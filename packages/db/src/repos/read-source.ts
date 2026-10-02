import { createHash } from 'node:crypto';
import {
  todayInVienna,
  sourceInteger,
  type SourceBalance,
  type SourceMapping,
  type SourceOperation,
} from '@budget/domain';
import { appSetting, inboxItem, account, security } from '../schema';
import { getEntity, createEntity, updateEntity } from './entities';
import { withGroup, type AuditContext, type GroupedContext } from './audit';
import { runInTransaction, type Executor } from './types';
import { accountSummaries } from './ledger-queries';
import { holdingValuationExportAsOf } from './portfolio';
import { ConflictError } from './errors';

export interface ReadSourceState {
  lastSuccess: string | null;
  lastAttempt: string | null;
  status: 'idle' | 'partial' | 'ok' | 'failed';
  window: {
    from: string;
    to: string;
    cursor: string | null;
    complete?: boolean;
    seen?: string[];
  } | null;
  balances: SourceBalance[];
}
const stateKey = 'source.crypto.state';
const mappingKey = 'source.crypto.mappings';
export function readSourceState(db: Executor): ReadSourceState {
  const row = getEntity(db, appSetting, stateKey);
  return row
    ? (JSON.parse(row.value) as ReadSourceState)
    : { lastSuccess: null, lastAttempt: null, status: 'idle', window: null, balances: [] };
}
export function readSourceMappings(db: Executor): SourceMapping[] {
  const row = getEntity(db, appSetting, mappingKey);
  return row ? (JSON.parse(row.value) as SourceMapping[]) : [];
}
function setting(db: Executor, id: string, value: unknown, ctx: GroupedContext) {
  const data = { value: JSON.stringify(value) };
  if (getEntity(db, appSetting, id)) updateEntity(db, appSetting, id, data, ctx);
  else createEntity(db, appSetting, { id, ...data }, ctx);
}
export function saveReadSourceState(db: Executor, state: ReadSourceState, ctx: AuditContext) {
  setting(db, stateKey, state, withGroup(ctx));
}
export function mapReadSource(db: Executor, mapping: SourceMapping, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const balance = readSourceState(tx).balances.find((b) => b.key === mapping.key);
    const acc = getEntity(tx, account, mapping.accountId);
    if (!balance || !acc || acc.onBudget || acc.closedAt)
      throw new ConflictError('Ein aktives Anlage- oder Verrechnungskonto auswählen.');
    if (balance.amount.assetId) {
      if (
        !mapping.securityId ||
        !getEntity(tx, security, mapping.securityId) ||
        !['crypto', 'brokerage'].includes(acc.type)
      )
        throw new ConflictError('Anlagekonto und Instrument auswählen.');
    } else if (mapping.securityId || !balance.currency || acc.currency !== balance.currency) {
      throw new ConflictError('Die Kontowährung muss zur Quelle passen.');
    }
    const mappings = readSourceMappings(tx).filter((m) => m.key !== mapping.key);
    if (
      mappings.some((m) => m.accountId === mapping.accountId && m.securityId === mapping.securityId)
    )
      throw new ConflictError('Dieses Konto bzw. Instrument ist bereits zugeordnet.');
    setting(tx, mappingKey, [...mappings, mapping], grouped);
    return { groupId: grouped.groupId };
  });
}
const itemId = (key: string) =>
  'source:' +
  createHash('sha256')
    .update('crypto:' + key)
    .digest('hex');
function item(
  db: Executor,
  key: string,
  title: string,
  detail: string,
  kind: 'import' | 'reconciliation' | 'other',
  ctx: GroupedContext,
  reopen = false,
) {
  const id = itemId(key);
  const old = getEntity(db, inboxItem, id);
  if (!old)
    createEntity(
      db,
      inboxItem,
      {
        id,
        kind,
        title,
        detail,
        refType: 'read_source',
        refId: 'crypto',
        urgent: kind !== 'import',
      },
      ctx,
    );
  else if (old.detail !== detail || (reopen && old.resolvedAt))
    updateEntity(db, inboxItem, id, { title, detail, resolvedAt: null, resolution: null }, ctx);
}
export function stageSourcePage(
  db: Executor,
  operations: SourceOperation[],
  state: ReadSourceState,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    for (const op of operations) {
      const transfer =
        op.transactions.some((t) => !t.amount.assetId) && !op.transactions.some((t) => t.tradeId);
      item(
        tx,
        'operation:' + op.id,
        transfer ? 'Quellbewegung: Umbuchung abgleichen' : 'Quellbewegung: Anlage prüfen',
        JSON.stringify({
          ...op,
          mappings: readSourceMappings(tx).filter((m) =>
            op.transactions.some(
              (t) =>
                m.key ===
                (t.amount.assetId
                  ? 'asset:' + t.amount.assetId
                  : 'currency:' + t.amount.currencyId),
            ),
          ),
        }),
        'import',
        grouped,
      );
    }
    saveReadSourceState(tx, state, grouped);
    return grouped.groupId;
  });
}
export function finishReadSource(
  db: Executor,
  balances: SourceBalance[],
  now: string,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const day = todayInVienna(new Date(now));
    const accounts = accountSummaries(tx, day);
    const holdings = holdingValuationExportAsOf(tx, day);
    const positions = [
      ...holdings.values,
      ...holdings.missingFxPositions,
      ...holdings.missingPricePositions,
    ];
    const mappings = readSourceMappings(tx);
    // Missing mapped balances stay actionable on every run, even after acknowledgement.
    for (const mapping of mappings.filter((m) => !balances.some((b) => b.key === m.key))) {
      item(
        tx,
        'balance:' + mapping.key,
        'Quellsaldo: Abgleich offen',
        JSON.stringify({
          key: mapping.key,
          source: null,
          local: null,
          scale: mapping.securityId ? 8 : 2,
          accountId: mapping.accountId,
          reason: 'source_missing',
        }),
        'reconciliation',
        grouped,
        true,
      );
    }
    const all = balances;
    for (const balance of all) {
      const mapping = mappings.find((m) => m.key === balance.key);
      const acc = accounts.find((a) => a.id === mapping?.accountId);
      const fresh = balances.includes(balance);
      const source = sourceInteger(balance.amount.value, balance.amount.assetId ? 8 : 2);
      const valid =
        fresh &&
        mapping &&
        acc &&
        !acc.onBudget &&
        !acc.closedAt &&
        (balance.amount.assetId
          ? mapping.securityId &&
            ['crypto', 'brokerage'].includes(acc.type) &&
            getEntity(tx, security, mapping.securityId)
          : !mapping.securityId && acc.currency === balance.currency);
      const local = !valid
        ? null
        : balance.amount.assetId
          ? (positions.find(
              (p) => p.accountId === mapping.accountId && p.securityId === mapping.securityId,
            )?.unitsE8 ?? 0)
          : acc.balanceCents;
      if (local === null || source === null || local !== source) {
        item(
          tx,
          'balance:' + balance.key,
          local === null || source === null ? 'Quellsaldo: Abgleich offen' : 'Quellsaldo weicht ab',
          JSON.stringify({
            key: balance.key,
            source: fresh ? balance.amount.value : null,
            local,
            scale: balance.amount.assetId ? 8 : 2,
            accountId: mapping?.accountId ?? null,
            reason: !fresh
              ? 'source_missing'
              : !valid
                ? 'mapping_required'
                : source === null
                  ? 'precision_unsupported'
                  : 'difference',
          }),
          'reconciliation',
          grouped,
          true,
        );
      } else {
        const id = itemId('balance:' + balance.key);
        const warning = getEntity(tx, inboxItem, id);
        if (warning && !warning.resolvedAt)
          updateEntity(
            tx,
            inboxItem,
            id,
            { resolvedAt: now, resolution: 'Quellsaldo stimmt beim Abruf überein.' },
            grouped,
          );
      }
    }
    const state = readSourceState(tx);
    saveReadSourceState(
      tx,
      {
        ...state,
        balances,
        status: 'ok',
        window: null,
        lastSuccess: state.window!.to,
        lastAttempt: now,
      },
      grouped,
    );
    const failure = getEntity(tx, inboxItem, itemId('failure'));
    if (failure && !failure.resolvedAt)
      updateEntity(
        tx,
        inboxItem,
        failure.id,
        { resolvedAt: now, resolution: 'Abruf erfolgreich.' },
        grouped,
      );
    return grouped.groupId;
  });
}
export function failReadSource(db: Executor, now: string) {
  const ctx = withGroup({ actor: 'system' });
  runInTransaction(db, (tx) => {
    saveReadSourceState(tx, { ...readSourceState(tx), lastAttempt: now, status: 'failed' }, ctx);
    item(
      tx,
      'failure',
      'Datenquelle: Abruf fehlgeschlagen',
      'Schlüssel, Leserechte und Verbindung prüfen. Gespeicherter Fortschritt bleibt erhalten.',
      'other',
      ctx,
      true,
    );
  });
}
