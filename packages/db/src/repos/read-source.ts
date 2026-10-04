import { createHash } from 'node:crypto';
import {
  todayInVienna,
  sourceInteger,
  informationalResolution,
  isAutomaticResolution,
  matchedResolution,
  type OperationVerdict,
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
import { evaluateReadSource, operationDay, stagedOperations } from './read-source-ledger';

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
const transferOperation = (op: SourceOperation) =>
  op.transactions.some((t) => !t.amount.assetId) && !op.transactions.some((t) => t.tradeId);
const kindLabel = (op: SourceOperation) =>
  transferOperation(op) ? 'Umbuchung abgleichen' : 'Anlage prüfen';
/** What an item shows for a verdict: a closing reason (matched, informational) or an open title. */
function verdictCopy(op: SourceOperation, verdict: OperationVerdict | undefined) {
  const base = `Quellbewegung: ${kindLabel(op)}`;
  if (verdict?.status === 'matched')
    return { title: base, closed: matchedResolution(verdict.refs) };
  if (verdict?.status === 'informational')
    return { title: base, closed: informationalResolution(verdict.reason) };
  if (verdict?.status === 'unmapped')
    return { title: 'Quellbewegung: Zuordnung fehlt', closed: null };
  if (verdict?.status === 'missing')
    return { title: `Quellbewegung fehlt in der App: ${kindLabel(op)}`, closed: null };
  return { title: base, closed: null };
}
/**
 * Applies a verdict to an item that is open or was closed automatically (never to the owner's
 * decisions). Writes nothing when the item already shows this verdict; returns whether it changed.
 */
function applyVerdict(
  db: Executor,
  old: typeof inboxItem.$inferSelect,
  op: SourceOperation,
  verdict: OperationVerdict | undefined,
  ctx: GroupedContext,
) {
  const { title, closed } = verdictCopy(op, verdict);
  const detail = JSON.stringify(op);
  const detailChanged = old.detail !== detail;
  if (closed !== null) {
    const same = old.resolvedAt !== null && old.resolution === closed;
    if (same && old.title === title && !detailChanged) return false;
    updateEntity(
      db,
      inboxItem,
      old.id,
      {
        title,
        detail,
        kind: 'import',
        urgent: false,
        resolvedAt: same ? old.resolvedAt : new Date().toISOString(),
        resolution: closed,
      },
      ctx,
    );
    return true;
  }
  if (!old.resolvedAt && old.title === title && !detailChanged) return false;
  updateEntity(
    db,
    inboxItem,
    old.id,
    { title, detail, kind: 'import', urgent: false, resolvedAt: null, resolution: null },
    ctx,
  );
  return true;
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
    const verdicts = operations.length
      ? evaluateReadSource(tx, readSourceMappings(tx), since, operations)
      : new Map<string, OperationVerdict>();
    for (const op of operations) {
      const day = since === null ? null : operationDay(op);
      const key = 'operation:' + op.id;
      const detail = JSON.stringify(op);
      if (day !== null && since !== null && day < since) {
        const base = `Quellbewegung: ${kindLabel(op)}`;
        item(tx, key, base, detail, 'import', grouped, false, operationFields, SINCE_RESOLUTION);
        continue;
      }
      const verdict = verdicts.get(op.id);
      const { title, closed } = verdictCopy(op, verdict);
      const old = getEntity(tx, inboxItem, itemId(key));
      if (!old) item(tx, key, title, detail, 'import', grouped, false, operationFields, closed);
      else if (old.resolvedAt && !isAutomaticResolution(old.resolution))
        // The owner's decision stands, unless the source facts changed.
        item(tx, key, title, detail, 'import', grouped, false, operationFields);
      else applyVerdict(tx, old, op, verdict, grouped);
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
export interface ReadSourceMatchCounts {
  /** A counterpart exists in the ledger. */
  matched: number;
  /** No counterpart: the movement is missing in the app. */
  missing: number;
  /** The source asset or currency has no account/instrument mapping yet. */
  unmapped: number;
  /** Internal moves and fee-only legs without ledger effect. */
  informational: number;
}
const emptyCounts = (): ReadSourceMatchCounts => ({
  matched: 0,
  missing: 0,
  unmapped: 0,
  informational: 0,
});
function tally(counts: ReadSourceMatchCounts, verdict: OperationVerdict | undefined) {
  if (verdict?.status === 'matched') counts.matched++;
  else if (verdict?.status === 'informational') counts.informational++;
  else if (verdict?.status === 'unmapped') counts.unmapped++;
  else counts.missing++;
}
/** Read-only preview of the matching for all staged movements on/after the start day. */
export function readSourceMatchSummary(db: Executor): ReadSourceMatchCounts {
  return runInTransaction(db, (tx) => {
    const verdicts = evaluateReadSource(tx, readSourceMappings(tx), readSourceSince(tx));
    const counts = emptyCounts();
    for (const verdict of verdicts.values()) tally(counts, verdict);
    return counts;
  });
}
export interface ReadSourceReconcileResult extends ReadSourceMatchCounts {
  groupId: string;
  /** Items whose state this run changed. */
  changed: number;
  /** Items resolved by the owner, left untouched. */
  ownerResolved: number;
}
/**
 * "Abgleich neu ausführen": re-checks every staged movement on/after the start day against the
 * ledger, including items the manual cut-off cleanup closed. Owner decisions stay untouched.
 * One audit group, so the whole run can be undone. Never creates bookings or trades.
 */
export function reconcileReadSource(db: Executor, ctx: AuditContext): ReadSourceReconcileResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const since = readSourceSince(tx);
    const verdicts = evaluateReadSource(tx, readSourceMappings(tx), since);
    const result: ReadSourceReconcileResult = {
      ...emptyCounts(),
      groupId: grouped.groupId,
      changed: 0,
      ownerResolved: 0,
    };
    for (const { row, op, day } of stagedOperations(tx)) {
      if (since !== null && day !== null && day < since) continue;
      if (row.resolvedAt && !isAutomaticResolution(row.resolution)) {
        result.ownerResolved++;
        continue;
      }
      const verdict = verdicts.get(op.id);
      tally(result, verdict);
      if (applyVerdict(tx, row, op, verdict, grouped)) result.changed++;
    }
    return result;
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
