import { createHash } from 'node:crypto';
import {
  documentedCostOf,
  isIncomeTrade,
  moneyRuleViolation,
  replayKnownSecurityTransfers,
  settlementCents,
  unitsRuleViolation,
  type KnownSecurityReplayInput,
  type KnownSecurityReplayResult,
  type SeriesTrade,
} from '@budget/domain';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  account, accountReconciliation, auditLog, booking, bookingSplit, holding,
  INCOME_TYPES, security, trade,
} from '../schema';
import { investmentPreferences } from './investment-preferences';
import { listTrades, type TradeRow } from './trades';
import { runInTransaction, type Executor } from './types';

export type RecordedSecurityHistoryFailure =
  | 'invalid_scope' | 'account_or_currency' | 'locked' | 'scope_limit'
  | 'unsupported_snapshot' | 'unsupported_event' | 'unpaired_delivery'
  | 'invalid_trade' | 'canonical_conflict' | 'replay_conflict';

export type RecordedSecurityHistory =
  | { available: false; code: RecordedSecurityHistoryFailure; offendingIds: string[] }
  | {
      available: true;
      /** App-ledger basis only; this is not a certificate of external broker completeness. */
      evidenceClass: 'recorded-native';
      replayThrough: string;
      fingerprintThrough: string;
      factFingerprint: string;
      input: KnownSecurityReplayInput;
      state: Extract<KnownSecurityReplayResult, { available: true }>;
      canonical: { accountId: string; unitsE8: number; basisCents: number }[];
      relevantTradeIds: string[];
      /** Empty until a persisted, validated security-transfer pair relation exists. */
      relevantPairIds: [];
    };

const unavailable = (code: RecordedSecurityHistoryFailure, offendingIds: string[] = []): RecordedSecurityHistory =>
  ({ available: false, code, offendingIds });
const validDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const rank = (row: TradeRow) => row.kind === 'buy' ? 0 : 1;
const ordered = (rows: TradeRow[], accountIds: readonly string[]) => {
  // Each account's rows arrive in SQLite (date, id) order. The canonical cost
  // projection retains that order within same-day kind; cross-account ties have
  // no economic effect while persisted security-transfer pairs are unavailable.
  const index = new Map(rows.map((row, i) => [row.id, i]));
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) ||
    accountIds.indexOf(a.accountId) - accountIds.indexOf(b.accountId) ||
    index.get(a.id)! - index.get(b.id)!);
};
const series = (row: TradeRow): SeriesTrade => ({ date: row.date, kind: row.kind,
  unitsE8: row.unitsE8, amountCents: row.amountCents,
  feeCents: row.feeCents, taxCents: row.taxCents, currency: 'EUR' });

/**
 * Read-only native-history bridge. A buy is an app-ledger acquisition; an old delivery is never
 * guessed into a transfer. No public route, pair persistence or apply capability is created here.
 */
export function readRecordedSecurityHistory(db: Executor, input: {
  securityId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  asOf: string;
}): RecordedSecurityHistory {
  if (!input.securityId || input.securityId.length > 80 ||
      !input.sourceAccountId || input.sourceAccountId.length > 80 ||
      !input.destinationAccountId || input.destinationAccountId.length > 80 ||
      input.sourceAccountId === input.destinationAccountId || !validDay(input.asOf))
    return unavailable('invalid_scope');
  return runInTransaction(db, (tx) => {
    const instrument = tx.select().from(security).where(and(
      eq(security.id, input.securityId), isNull(security.deletedAt))).get();
    const accountIds = [input.sourceAccountId, input.destinationAccountId];
    const accounts = tx.select().from(account).where(inArray(account.id, accountIds)).all();
    if (!instrument || accounts.length !== 2 || accounts.some((row) =>
      row.deletedAt !== null || row.role !== 'investment' || row.currency !== 'EUR'))
      return unavailable('account_or_currency');

    // A reconciliation at or after the requested boundary locks historical source facts.
    const reconciliations = tx.select().from(accountReconciliation)
      .where(inArray(accountReconciliation.accountId, accountIds)).limit(1001).all();
    if (reconciliations.length > 1000) return unavailable('scope_limit');
    if (reconciliations.some((row) => row.deletedAt === null && row.date >= input.asOf))
      return unavailable('locked', reconciliations.filter((row) =>
        row.deletedAt === null && row.date >= input.asOf).map((row) => row.id));

    // Include tombstones and later rows in the CAS facts; only live rows enter basis replay.
    const allTrades = accountIds.flatMap((accountId) => listTrades(tx, {
      accountId, securityId: input.securityId, includeDeleted: true, limit: 1001,
    }));
    if (allTrades.length > 1000) return unavailable('scope_limit');
    const snapshots = tx.select().from(holding).where(and(
      eq(holding.securityId, input.securityId), inArray(holding.accountId, accountIds)))
      .limit(1001).all();
    if (snapshots.length > 1000) return unavailable('scope_limit');
    const liveTrades = allTrades.filter((row) => row.deletedAt === null);
    const nativeInDbOrder = liveTrades.filter((row) => row.kind === 'buy' || row.kind === 'sell');
    const relevant = ordered(nativeInDbOrder, accountIds);
    if (relevant.length > 1000) return unavailable('scope_limit');
    for (const row of liveTrades) {
      if (!validDay(row.date) || unitsRuleViolation(row.kind, row.unitsE8) || moneyRuleViolation(row))
        return unavailable('invalid_trade', [row.id]);
      if (row.kind === 'delivery_in' || row.kind === 'delivery_out')
        return unavailable('unpaired_delivery', [row.id]);
      if (row.kind === 'split') return unavailable('unsupported_event', [row.id]);
      if (!['buy', 'sell', 'dividend', 'interest', 'fee', 'tax'].includes(row.kind))
        return unavailable('unsupported_event', [row.id]);
    }
    const settlements: { tradeId: string; cash: typeof booking.$inferSelect;
      part: typeof bookingSplit.$inferSelect }[] = [];
    for (const row of liveTrades) {
      const amount = settlementCents(row);
      if (amount === 0) {
        if (row.bookingId !== null) return unavailable('invalid_trade', [row.id]);
        continue;
      }
      if (!row.bookingId) return unavailable('invalid_trade', [row.id]);
      const owners = tx.select({ id: trade.id }).from(trade).where(and(
        eq(trade.bookingId, row.bookingId), isNull(trade.deletedAt))).limit(2).all();
      if (owners.length !== 1 || owners[0]?.id !== row.id)
        return unavailable('invalid_trade', [row.id]);
      const cash = tx.select().from(booking).where(eq(booking.id, row.bookingId)).get();
      const parts = tx.select().from(bookingSplit)
        .where(eq(bookingSplit.bookingId, row.bookingId)).limit(2).all();
      const part = parts[0];
      if (!cash || cash.deletedAt !== null || cash.accountId !== row.accountId ||
          cash.date !== row.date || cash.amountCents !== amount || cash.currency !== 'EUR' ||
          cash.transferId !== null || cash.originalAmountCents !== null ||
          cash.originalCurrency !== null || cash.fxRateMicro !== null ||
          cash.fxFeeCents !== null || parts.length !== 1 || !part ||
          part.amountCents !== amount || part.categoryId !== null ||
          part.contactId !== null || part.transferId !== null ||
          part.incomeTypeId !== (isIncomeTrade(row.kind) ? INCOME_TYPES.capital.id : null))
        return unavailable('invalid_trade', [row.id]);
      settlements.push({ tradeId: row.id, cash, part });
    }

    const method = investmentPreferences(tx).costMethod;
    const latest = [input.asOf, ...allTrades.map((row) => row.date),
      ...snapshots.map((row) => row.asOf)].sort().at(-1)!;
    const revisionKeys: [string, string][] = [
      ['security', instrument.id], ['investment_preference', 'portfolio'],
      ...accounts.map((row): [string, string] => ['account', row.id]),
      ...allTrades.map((row): [string, string] => ['trade', row.id]),
      ...snapshots.map((row): [string, string] => ['holding', row.id]),
      ...reconciliations.map((row): [string, string] => ['account_reconciliation', row.id]),
      ...settlements.flatMap(({ cash, part }): [string, string][] => [
        ['booking', cash.id], ['booking_split', part.id],
      ]),
    ];
    if (revisionKeys.length > 6000) return unavailable('scope_limit');
    revisionKeys.sort((a, b) => a[0]!.localeCompare(b[0]!) || a[1]!.localeCompare(b[1]!));
    const auditRevisions = revisionKeys.map(([entityType, entityId]) => {
      const newest = tx.select({ id: auditLog.id }).from(auditLog).where(and(
        eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
        .orderBy(desc(sql<number>`rowid`)).limit(1).get();
      return [entityType, entityId, newest?.id ?? null];
    });
    // This is the current complete set of recorded facts for these two accounts, not a claim
    // that an external broker's older or omitted events are present.
    const factFingerprint = createHash('sha256').update(JSON.stringify({
      version: 1, scope: input, method, instrument, accounts: accounts.sort((a, b) => a.id.localeCompare(b.id)),
      reconciliations: reconciliations.sort((a, b) => a.id.localeCompare(b.id)),
      trades: allTrades.sort((a, b) => a.id.localeCompare(b.id)),
      snapshots: snapshots.sort((a, b) => a.id.localeCompare(b.id)),
      settlements: settlements.sort((a, b) => a.tradeId.localeCompare(b.tradeId)),
      auditRevisions,
    })).digest('hex');

    const canonicalAt = (accountId: string, through: string) => documentedCostOf(
      nativeInDbOrder.filter((row) => row.accountId === accountId && row.date <= through).map(series),
      undefined, method);
    for (const snapshot of snapshots) if (snapshot.deletedAt === null) {
      const native = nativeInDbOrder.filter((row) =>
        row.accountId === snapshot.accountId && row.date <= snapshot.asOf).map(series);
      const average = documentedCostOf(native, undefined, 'average');
      const fifo = documentedCostOf(native, undefined, 'fifo');
      if (!average || !fifo || average.unitsE8 !== snapshot.unitsE8 ||
          fifo.unitsE8 !== snapshot.unitsE8 ||
          (snapshot.costBasisCents !== null &&
            snapshot.costBasisCents !== average.costBasisCents &&
            snapshot.costBasisCents !== fifo.costBasisCents))
        return unavailable('unsupported_snapshot', [snapshot.id]);
    }

    const makeInput = (through: string): KnownSecurityReplayInput => {
      const sequenceByDay = new Map<string, number>();
      return {
        securityId: input.securityId, method,
        opening: 'recorded-ledger-zero-seed',
        coverage: { kind: 'all-supported-recorded-facts', through },
        accountIds, lockedAccountIds: [],
        events: relevant.filter((row) => row.date <= through).map((row) => {
          const sequence = sequenceByDay.get(row.date) ?? 0;
          sequenceByDay.set(row.date, sequence + 1);
          return { id: row.id, date: row.date, sequence,
            securityId: input.securityId, currency: 'EUR', kind: row.kind as 'buy' | 'sell',
            accountId: row.accountId, unitsE8: row.unitsE8, amountCents: row.amountCents,
            feeCents: row.feeCents, taxCents: row.taxCents };
        }),
      };
    };
    // Later recorded facts are part of the same snapshot and must also have a viable native
    // replay before a backdated preview can be considered for a future transactional action.
    const full = replayKnownSecurityTransfers(makeInput(latest));
    if (!full.available) return unavailable('replay_conflict', full.eventId ? [full.eventId] : []);
    const replayInput = makeInput(input.asOf);
    const state = replayKnownSecurityTransfers(replayInput);
    if (!state.available) return unavailable('replay_conflict', state.eventId ? [state.eventId] : []);
    for (const result of [
      { through: input.asOf, state }, { through: latest, state: full },
    ]) for (const accountState of result.state.accounts) {
      const expected = canonicalAt(accountState.accountId, result.through);
      if (!expected || expected.unitsE8 !== accountState.unitsE8 ||
          expected.costBasisCents !== accountState.basisCents)
        return unavailable('canonical_conflict', [accountState.accountId]);
    }
    return {
      available: true, evidenceClass: 'recorded-native',
      replayThrough: input.asOf, fingerprintThrough: latest,
      factFingerprint, input: replayInput, state,
      canonical: state.accounts.map((row) => ({ accountId: row.accountId,
        unitsE8: row.unitsE8, basisCents: row.basisCents })),
      relevantTradeIds: liveTrades.map((row) => row.id), relevantPairIds: [],
    };
  });
}
