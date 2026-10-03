import { createHash } from 'node:crypto';
import {
  todayInVienna,
  sourceInteger,
  type SourceBalance,
  type SourceMapping,
  type SourceOperation,
  type SourceFailureCategory,
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
    pages?: number;
  } | null;
  balances: SourceBalance[];
}
const stateKey = 'source.crypto.state';
const mappingKey = 'source.crypto.mappings';
const sinceKey = 'source.crypto.since';
export const SINCE_RESOLUTION = 'Vor dem Startdatum – bereits in der App erfasst.';
const isoDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value + 'T00:00:00Z').toISOString().startsWith(value);
export function readSourceState(db: Executor): ReadSourceState {
  const row = getEntity(db, appSetting, stateKey);
  if (!row)
    return { lastSuccess: null, lastAttempt: null, status: 'idle', window: null, balances: [] };
  const state = JSON.parse(row.value) as ReadSourceState;
  if (state.window?.seen) {
    state.window.pages ??= state.window.seen.length;
    state.window.seen = state.window.seen.slice(-64);
  }
  return state;
}
export function readSourceMappings(db: Executor): SourceMapping[] {
  const row = getEntity(db, appSetting, mappingKey);
  return row ? (JSON.parse(row.value) as SourceMapping[]) : [];
}
/** Start day (`YYYY-MM-DD`) of the movements the source may stage; null means no limit. */
export function readSourceSince(db: Executor): string | null {
  const row = getEntity(db, appSetting, sinceKey);
  const value = row ? (JSON.parse(row.value) as unknown) : null;
  return typeof value === 'string' && isoDay(value) ? value : null;
}
/** Calendar day (Vienna) of the latest transaction, or null when it is unknown. */
function operationDay(op: { transactions?: Array<{ creditedAt: string }> }): string | null {
  const times = (Array.isArray(op.transactions) ? op.transactions : [])
    .map((t) => Date.parse(t.creditedAt))
    .filter((t) => !Number.isNaN(t));
  return times.length ? todayInVienna(new Date(Math.max(...times))) : null;
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
export function setReadSourceSince(db: Executor, since: string | null, ctx: AuditContext) {
  if (since !== null && !isoDay(since)) throw new ConflictError('Ungültiges Startdatum.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    setting(tx, sinceKey, since, grouped);
    if (since !== null) {
      const resolvedAt = new Date().toISOString();
      for (const row of tx.select().from(inboxItem).all()) {
        if (
          row.refType !== 'read_source' ||
          row.kind !== 'import' ||
          row.resolvedAt !== null ||
          !row.detail
        )
          continue;
        let day: string | null = null;
        try {
          day = operationDay(JSON.parse(row.detail) as SourceOperation);
        } catch {
          continue;
        }
        if (day !== null && day < since)
          updateEntity(
            tx,
            inboxItem,
            row.id,
            { resolvedAt, resolution: SINCE_RESOLUTION },
            grouped,
          );
      }
    }
    return { groupId: grouped.groupId };
  });
}
/** First connection: with no start day ever saved, the source starts at `day` (the connection day). */
export function defaultReadSourceSince(db: Executor, day: string, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    if (getEntity(tx, appSetting, sinceKey)) return null;
    return setReadSourceSince(tx, day, ctx);
  });
}
const itemId = (key: string) =>
  'source:' +
  createHash('sha256')
    .update('crypto:' + key)
    .digest('hex');
function operationFields(detail: string) {
  const fields = JSON.parse(detail) as Record<string, unknown>;
  delete fields['mappings'];
  return JSON.stringify(fields);
}
/** Mappings are current display data, independent of the acknowledged source facts. */
export function readSourceDisplayDetail(detail: string | null, mappings: SourceMapping[]) {
  if (!detail) return detail;
  let op: SourceOperation;
  try {
    op = JSON.parse(detail) as SourceOperation;
  } catch {
    return detail;
  }
  if (!op || typeof op !== 'object') return detail;
  if (!Array.isArray(op.transactions)) return detail;
  return JSON.stringify({
    ...op,
    mappings: mappings.filter((m) =>
      op.transactions.some(
        (t) =>
          m.key ===
          (t.amount.assetId ? 'asset:' + t.amount.assetId : 'currency:' + t.amount.currencyId),
      ),
    ),
  });
}
function balanceFields(detail: string) {
  const value = JSON.parse(detail) as {
    source: string | null;
    local: number | null;
    reason: string;
  };
  // Decimal formatting and mapping display changes do not change the discrepancy.
  const source = value.source?.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') ?? null;
  return JSON.stringify({ source, local: value.local, reason: value.reason });
}
function item(
  db: Executor,
  key: string,
  title: string,
  detail: string,
  kind: 'import' | 'reconciliation' | 'other',
  ctx: GroupedContext,
  reopen = false,
  compare: (detail: string) => string = (detail) => detail,
  closed: string | null = null,
) {
  const id = itemId(key);
  const old = getEntity(db, inboxItem, id);
  if (closed !== null) {
    // Recorded for dedupe and replay, but never asks for attention.
    const resolved = { resolvedAt: new Date().toISOString(), resolution: closed };
    if (!old)
      createEntity(
        db,
        inboxItem,
        { id, kind, title, detail, refType: 'read_source', refId: 'crypto', ...resolved },
        ctx,
      );
    else if (!old.resolvedAt)
      updateEntity(db, inboxItem, id, { title, detail, kind, ...resolved }, ctx);
    return;
  }
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
  else if (
    old.detail !== detail ||
    old.kind !== kind ||
    (reopen && old.resolvedAt) ||
    old.resolution === SINCE_RESOLUTION
  ) {
    const changed =
      old.kind !== kind ||
      !old.detail ||
      old.resolution === SINCE_RESOLUTION ||
      compare(old.detail) !== compare(detail);
    updateEntity(
      db,
      inboxItem,
      id,
      {
        title,
        detail,
        kind,
        urgent: kind !== 'import',
        ...(changed || reopen ? { resolvedAt: null, resolution: null } : {}),
      },
      ctx,
    );
  }
}
export function stageSourcePage(
  db: Executor,
  operations: SourceOperation[],
  state: ReadSourceState,
  ctx: AuditContext,
  invalidOperations: Array<{ id: string; reason: 'schema' }> = [],
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const since = readSourceSince(tx);
    for (const op of operations) {
      const day = since === null ? null : operationDay(op);
      const transfer =
        op.transactions.some((t) => !t.amount.assetId) && !op.transactions.some((t) => t.tradeId);
      item(
        tx,
        'operation:' + op.id,
        transfer ? 'Quellbewegung: Umbuchung abgleichen' : 'Quellbewegung: Anlage prüfen',
        JSON.stringify(op),
        'import',
        grouped,
        false,
        operationFields,
        day !== null && since !== null && day < since ? SINCE_RESOLUTION : null,
      );
    }
    for (const invalid of invalidOperations)
      item(
        tx,
        'operation:' + invalid.id,
        'Quellbewegung: Datenformat prüfen',
        JSON.stringify(invalid),
        'other',
        grouped,
      );
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
    const resolveBalance = (key: string, detail: string) => {
      const warning = getEntity(tx, inboxItem, itemId('balance:' + key));
      if (warning && (!warning.resolvedAt || warning.detail !== detail))
        updateEntity(
          tx,
          inboxItem,
          warning.id,
          {
            detail,
            ...(!warning.resolvedAt
              ? { resolvedAt: now, resolution: 'Quellsaldo stimmt beim Abruf überein.' }
              : {}),
          },
          grouped,
        );
    };
    for (const mapping of mappings.filter((m) => !balances.some((b) => b.key === m.key))) {
      const acc = accounts.find((a) => a.id === mapping.accountId);
      const local =
        !acc ||
        acc.onBudget ||
        acc.closedAt ||
        (mapping.securityId &&
          (!getEntity(tx, security, mapping.securityId) ||
            !['crypto', 'brokerage'].includes(acc.type)))
          ? null
          : mapping.securityId
            ? (positions.find(
                (p) => p.accountId === mapping.accountId && p.securityId === mapping.securityId,
              )?.unitsE8 ?? 0)
            : acc.balanceCents;
      if (local === 0) {
        resolveBalance(
          mapping.key,
          JSON.stringify({
            key: mapping.key,
            source: null,
            local,
            scale: mapping.securityId ? 8 : 2,
            accountId: mapping.accountId,
            reason: 'source_missing',
          }),
        );
        continue;
      }
      item(
        tx,
        'balance:' + mapping.key,
        'Quellsaldo: Abgleich offen',
        JSON.stringify({
          key: mapping.key,
          source: null,
          local,
          scale: mapping.securityId ? 8 : 2,
          accountId: mapping.accountId,
          reason: 'source_missing',
        }),
        'reconciliation',
        grouped,
        false,
        balanceFields,
      );
    }
    for (const balance of balances) {
      const mapping = mappings.find((m) => m.key === balance.key);
      const acc = accounts.find((a) => a.id === mapping?.accountId);
      const source = balance.issue
        ? null
        : sourceInteger(balance.amount.value, balance.amount.assetId ? 8 : 2);
      const valid =
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
            source: balance.amount.value,
            local,
            scale: balance.amount.assetId ? 8 : 2,
            accountId: mapping?.accountId ?? null,
            reason: balance.issue
              ? balance.issue === 'duplicate'
                ? 'duplicate_rows'
                : 'invalid_balance'
              : !valid
                ? 'mapping_required'
                : source === null
                  ? 'precision_unsupported'
                  : 'difference',
          }),
          'reconciliation',
          grouped,
          false,
          balanceFields,
        );
      } else {
        resolveBalance(
          balance.key,
          JSON.stringify({
            key: balance.key,
            source: balance.amount.value,
            local,
            scale: balance.amount.assetId ? 8 : 2,
            accountId: mapping!.accountId,
            reason: 'matched',
          }),
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
export function failReadSource(
  db: Executor,
  now: string,
  category: SourceFailureCategory = 'http',
  completeWindow = false,
) {
  const ctx = withGroup({ actor: 'system' });
  runInTransaction(db, (tx) => {
    const state = readSourceState(tx);
    saveReadSourceState(
      tx,
      {
        ...state,
        lastAttempt: now,
        status: 'failed',
        ...(completeWindow ? { lastSuccess: state.window!.to, window: null } : {}),
      },
      ctx,
    );
    item(
      tx,
      'failure',
      'Datenquelle: Abruf fehlgeschlagen',
      JSON.stringify({ category }),
      'other',
      ctx,
      true,
    );
  });
}
