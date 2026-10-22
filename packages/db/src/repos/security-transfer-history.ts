import { createHash, randomUUID } from 'node:crypto';
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
import { and, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  account, accountReconciliation, auditLog, booking, bookingSplit, holding,
  INCOME_TYPES, security, securityTransferPair, trade,
} from '../schema';
import { investmentPreferences } from './investment-preferences';
import { memoizedShared } from './request-memo';
import { listTrades, type TradeRow } from './trades';
import { runInTransaction, type Executor } from './types';

/** `null` means this position has no live paired history by the requested day. */
export function pairedRecordedPositionAsOf(db: Executor, input: {
  accountId: string; securityId: string; asOf: string; method: 'fifo' | 'average';
}): null | { available: false; code: RecordedSecurityHistoryFailure } |
  { available: true; unitsE8: number; basisCents: number; realizedGainCents: number } {
  return memoizedShared(db, `pairedPosition|${input.accountId}|${input.securityId}|${input.asOf}|${input.method}`, () => {
    const adjacent = db.select({ pair: securityTransferPair }).from(trade)
      .innerJoin(securityTransferPair, or(eq(securityTransferPair.outTradeId, trade.id),
        eq(securityTransferPair.inTradeId, trade.id)))
      .where(and(eq(securityTransferPair.securityId, input.securityId),
        isNull(securityTransferPair.deletedAt), eq(trade.accountId, input.accountId),
        lte(trade.date, input.asOf))).limit(1).get();
    if (!adjacent) return null;
    const out = db.select().from(trade).where(eq(trade.id, adjacent.pair.outTradeId)).get();
    const incoming = db.select().from(trade).where(eq(trade.id, adjacent.pair.inTradeId)).get();
    if (!out || !incoming) return { available: false as const, code: 'invalid_pair' as const };
    const counterpart = out.accountId === input.accountId ? incoming.accountId : out.accountId;
    const history = readRecordedSecurityHistory(db, { securityId: input.securityId,
      sourceAccountId: input.accountId, destinationAccountId: counterpart, asOf: input.asOf });
    if (!history.available) return { available: false as const, code: history.code };
    const replay = input.method === history.input.method ? history.state
      : replayKnownSecurityTransfers({ ...history.input, method: input.method });
    if (!replay.available) return { available: false as const, code: 'replay_conflict' as const };
    const state = replay.accounts.find((row) => row.accountId === input.accountId);
    return state ? { available: true as const, unitsE8: state.unitsE8,
      basisCents: state.basisCents, realizedGainCents: state.realizedGainCents }
      : { available: false as const, code: 'replay_conflict' as const };
  });
}

export type RecordedSecurityHistoryFailure =
  | 'invalid_scope' | 'account_or_currency' | 'scope_limit'
  | 'unsupported_snapshot' | 'unsupported_event' | 'unpaired_delivery'
  | 'invalid_trade' | 'invalid_pair' | 'ambiguous_pair_order'
  | 'canonical_conflict' | 'replay_conflict';

export type RecordedSecurityHistory =
  | { available: false; code: RecordedSecurityHistoryFailure; offendingIds: string[] }
  | {
      available: true;
      /** App-ledger basis only; this is not a certificate of external broker completeness. */
      evidenceClass: 'recorded-native' | 'recorded-paired';
      replayThrough: string;
      fingerprintThrough: string;
      factFingerprint: string;
      input: KnownSecurityReplayInput;
      /** Full current suffix for a hypothetical read-only proposal replay. */
      fullInput: KnownSecurityReplayInput;
      state: Extract<KnownSecurityReplayResult, { available: true }>;
      canonical: { accountId: string; unitsE8: number; basisCents: number }[];
      relevantTradeIds: string[];
      /** Historical calculation remains readable when a later reconciliation bars a write. */
      writeBlockers: ('reconciled' | 'account_closed')[];
      relevantPairIds: string[];
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
  // no economic effect between independent accounts.
  const index = new Map(rows.map((row, i) => [row.id, i]));
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) ||
    accountIds.indexOf(a.accountId) - accountIds.indexOf(b.accountId) ||
    index.get(a.id)! - index.get(b.id)!);
};
const series = (row: TradeRow): SeriesTrade => ({ date: row.date, kind: row.kind,
  unitsE8: row.unitsE8, amountCents: row.amountCents,
  feeCents: row.feeCents, taxCents: row.taxCents, currency: 'EUR' });

/**
 * Read-only recorded-history bridge. A buy is an app-ledger acquisition; an old delivery is never
 * guessed into a transfer. Pair writes and apply remain unavailable.
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
    const candidateIds = [input.sourceAccountId, input.destinationAccountId];
    const candidateAccounts = tx.select().from(account).where(inArray(account.id, candidateIds)).all();
    if (!instrument || candidateAccounts.length !== 2 || candidateAccounts.some((row) =>
      row.deletedAt !== null || row.role !== 'investment' || row.onBudget || row.currency !== 'EUR'))
      return unavailable('account_or_currency');

    // Only account-adjacent explicit pairs are read. Live pairs expand the economic
    // component; tombstones stay as adjacent CAS evidence without expanding it.
    const legRows = new Map<string, TradeRow>();
    const adjacentById = new Map<string, typeof securityTransferPair.$inferSelect>();
    const accountSet = new Set(candidateIds);
    let expanded = true;
    while (expanded) {
      expanded = false;
      const rows = tx.select({ pair: securityTransferPair }).from(trade)
        .innerJoin(securityTransferPair, or(eq(securityTransferPair.outTradeId, trade.id),
          eq(securityTransferPair.inTradeId, trade.id)))
        .where(and(eq(securityTransferPair.securityId, input.securityId),
          inArray(trade.accountId, [...accountSet]))).limit(1001).all();
      if (rows.length > 1000) return unavailable('scope_limit');
      for (const { pair } of rows) {
        adjacentById.set(pair.id, pair);
        if (adjacentById.size > 500) return unavailable('scope_limit');
        for (const legId of [pair.outTradeId, pair.inTradeId]) if (!legRows.has(legId)) {
          const row = tx.select().from(trade).where(eq(trade.id, legId)).get();
          if (row) legRows.set(legId, row);
        }
        if (pair.deletedAt !== null) continue;
        const out = legRows.get(pair.outTradeId), incoming = legRows.get(pair.inTradeId);
        if (!out || !incoming) continue;
        if (!accountSet.has(out.accountId) && !accountSet.has(incoming.accountId)) continue;
        for (const id of [out.accountId, incoming.accountId]) if (!accountSet.has(id)) {
          accountSet.add(id); expanded = true;
        }
      }
      if (accountSet.size > 50) return unavailable('scope_limit');
    }
    const accountIds = [...accountSet];
    const accounts = tx.select().from(account).where(inArray(account.id, accountIds)).all();
    if (accounts.length !== accountIds.length || accounts.some((row) =>
      row.deletedAt !== null || row.role !== 'investment' || row.onBudget || row.currency !== 'EUR'))
      return unavailable('account_or_currency');
    const adjacentPairs = [...adjacentById.values()];
    const adjacentLegIds = [...new Set(adjacentPairs.flatMap((pair) =>
      [pair.outTradeId, pair.inTradeId]))];
    if (adjacentLegIds.length > 1000) return unavailable('scope_limit');
    if (adjacentLegIds.some((id) => !legRows.has(id)))
      return unavailable('invalid_pair', adjacentPairs.map((pair) => pair.id));
    const adjacentLegs = adjacentLegIds.map((id) => legRows.get(id)!);
    const adjacentAccountIds = [...new Set(adjacentLegs.map((row) => row.accountId))];
    const adjacentAccounts = adjacentAccountIds.length ? tx.select().from(account)
      .where(inArray(account.id, adjacentAccountIds)).all() : [];
    if (adjacentAccounts.length !== adjacentAccountIds.length)
      return unavailable('invalid_pair', adjacentPairs.map((pair) => pair.id));
    const livePairs = adjacentPairs.filter((pair) => pair.deletedAt === null);
    const anyPairMembership = new Set<string>();
    for (const pair of adjacentPairs) for (const legId of [pair.outTradeId, pair.inTradeId]) {
      if (anyPairMembership.has(legId)) return unavailable('invalid_pair', [pair.id]);
      anyPairMembership.add(legId);
    }
    const pairLegIds = new Set<string>();
    for (const pair of livePairs) {
      const out = legRows.get(pair.outTradeId), incoming = legRows.get(pair.inTradeId);
      if (!out || !incoming || out.deletedAt !== null || incoming.deletedAt !== null ||
          pair.outTradeId === pair.inTradeId || pairLegIds.has(pair.outTradeId) ||
          pairLegIds.has(pair.inTradeId) || !Number.isSafeInteger(pair.creationOrder) ||
          pair.creationOrder <= 0 || out.securityId !== input.securityId ||
          incoming.securityId !== input.securityId || out.accountId === incoming.accountId ||
          out.date !== incoming.date || out.kind !== 'delivery_out' ||
          incoming.kind !== 'delivery_in' || out.unitsE8 !== -incoming.unitsE8 ||
          out.unitsE8 >= 0 || out.amountCents !== 0 || incoming.amountCents !== 0 ||
          out.feeCents !== 0 || incoming.feeCents !== 0 || out.taxCents !== 0 ||
          incoming.taxCents !== 0 || out.bookingId !== null || incoming.bookingId !== null ||
          !accountSet.has(out.accountId) || !accountSet.has(incoming.accountId))
        return unavailable('invalid_pair', [pair.id]);
      pairLegIds.add(pair.outTradeId); pairLegIds.add(pair.inTradeId);
    }

    // Reconciliations affect mutation eligibility, not historical basis projection.
    const reconciliations = tx.select().from(accountReconciliation)
      .where(inArray(accountReconciliation.accountId, accountIds)).limit(1001).all();
    if (reconciliations.length > 1000) return unavailable('scope_limit');
    const writeBlockers: ('reconciled' | 'account_closed')[] = [];
    if (reconciliations.some((row) => row.deletedAt === null && row.date >= input.asOf))
      writeBlockers.push('reconciled');
    if (accounts.some((row) => row.closedAt !== null)) writeBlockers.push('account_closed');

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
    const nativeInDbOrder = liveTrades.filter((row) =>
      row.kind === 'buy' || row.kind === 'sell' || row.kind === 'split');
    const relevant = ordered(nativeInDbOrder, accountIds);
    if (relevant.length + livePairs.length > 1000) return unavailable('scope_limit');
    for (const row of liveTrades) {
      if (!validDay(row.date) || unitsRuleViolation(row.kind, row.unitsE8) || moneyRuleViolation(row))
        return unavailable('invalid_trade', [row.id]);
      if ((row.kind === 'delivery_in' || row.kind === 'delivery_out') && !pairLegIds.has(row.id))
        return unavailable('unpaired_delivery', [row.id]);
      if (!['buy', 'sell', 'split', 'delivery_in', 'delivery_out',
        'dividend', 'interest', 'fee', 'tax'].includes(row.kind))
        return unavailable('unsupported_event', [row.id]);
    }
    // Native buys have the canonical buy-first position. No recorded order establishes
    // where a sale or split sits relative to an interacting same-day pair.
    const pairAccountsByDay = new Map<string, Set<string>>();
    for (const pair of livePairs) {
      const out = legRows.get(pair.outTradeId)!, incoming = legRows.get(pair.inTradeId)!;
      const accountsOnDay = pairAccountsByDay.get(out.date) ?? new Set<string>();
      accountsOnDay.add(out.accountId); accountsOnDay.add(incoming.accountId);
      pairAccountsByDay.set(out.date, accountsOnDay);
    }
    for (const row of relevant) if (row.kind !== 'buy' &&
      pairAccountsByDay.get(row.date)?.has(row.accountId))
      return unavailable('ambiguous_pair_order', [row.id]);
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
    // A past settlement can remain live after a trade was edited to zero cash or deleted.
    // The canonical invariant checks old booking IDs from trade audit snapshots; retain
    // that protection with explicit per-trade and aggregate read limits here.
    let historicalAuditCount = 0;
    const historicalBookings = new Map<string, typeof booking.$inferSelect | null>();
    for (const row of allTrades) {
      const audit = tx.select({ beforeJson: auditLog.beforeJson, afterJson: auditLog.afterJson })
        .from(auditLog).where(and(eq(auditLog.entityType, 'trade'),
          eq(auditLog.entityId, row.id))).limit(101).all();
      historicalAuditCount += audit.length;
      if (audit.length > 100 || historicalAuditCount > 5000)
        return unavailable('scope_limit', [row.id]);
      const oldIds = new Set<string>(row.bookingId ? [row.bookingId] : []);
      for (const entry of audit) for (const json of [entry.beforeJson, entry.afterJson]) {
        if (!json) continue;
        try {
          const snapshot = JSON.parse(json) as { booking_id?: unknown };
          if (typeof snapshot.booking_id === 'string') oldIds.add(snapshot.booking_id);
        } catch {
          return unavailable('invalid_trade', [row.id]);
        }
      }
      for (const bookingId of oldIds) {
        if (!historicalBookings.has(bookingId)) historicalBookings.set(bookingId,
          tx.select().from(booking).where(eq(booking.id, bookingId)).get() ?? null);
        const cash = historicalBookings.get(bookingId);
        if (cash && cash.deletedAt === null &&
            (row.deletedAt !== null || bookingId !== row.bookingId))
          return unavailable('invalid_trade', [row.id]);
      }
    }
    if (historicalBookings.size > 5000) return unavailable('scope_limit');

    const method = investmentPreferences(tx).costMethod;
    const latest = [input.asOf, ...allTrades.map((row) => row.date),
      ...snapshots.map((row) => row.asOf)].sort().at(-1)!;
    const revisionKeys: [string, string][] = [
      ['security', instrument.id], ['investment_preference', 'portfolio'],
      ...accounts.map((row): [string, string] => ['account', row.id]),
      ...allTrades.map((row): [string, string] => ['trade', row.id]),
      ...adjacentAccounts.map((row): [string, string] => ['account', row.id]),
      ...adjacentLegs.map((row): [string, string] => ['trade', row.id]),
      ...snapshots.map((row): [string, string] => ['holding', row.id]),
      ...adjacentPairs.map((row): [string, string] => ['security_transfer_pair', row.id]),
      ...reconciliations.map((row): [string, string] => ['account_reconciliation', row.id]),
      ...settlements.flatMap(({ cash, part }): [string, string][] => [
        ['booking', cash.id], ['booking_split', part.id],
      ]),
      ...[...historicalBookings.keys()].map((id): [string, string] => ['booking', id]),
    ];
    if (revisionKeys.length > 7000) return unavailable('scope_limit');
    revisionKeys.sort((a, b) => a[0]!.localeCompare(b[0]!) || a[1]!.localeCompare(b[1]!));
    const auditRevisions = revisionKeys.filter(([kind, id], index) =>
      index === 0 || kind !== revisionKeys[index - 1]![0] || id !== revisionKeys[index - 1]![1])
      .map(([entityType, entityId]) => {
      const newest = tx.select({ id: auditLog.id }).from(auditLog).where(and(
        eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
        .orderBy(desc(sql<number>`rowid`)).limit(1).get();
      return [entityType, entityId, newest?.id ?? null];
      });
    // This is the current complete set of recorded facts for these two accounts, not a claim
    // that an external broker's older or omitted events are present.
    const factFingerprint = createHash('sha256').update(JSON.stringify({
      version: 2, scope: input, method, instrument, accounts: accounts.sort((a, b) => a.id.localeCompare(b.id)),
      pairs: adjacentPairs.sort((a, b) => a.id.localeCompare(b.id)),
      adjacentLegs: adjacentLegs.sort((a, b) => a.id.localeCompare(b.id)),
      adjacentAccounts: adjacentAccounts.sort((a, b) => a.id.localeCompare(b.id)),
      reconciliations: reconciliations.sort((a, b) => a.id.localeCompare(b.id)),
      trades: allTrades.sort((a, b) => a.id.localeCompare(b.id)),
      snapshots: snapshots.sort((a, b) => a.id.localeCompare(b.id)),
      settlements: settlements.sort((a, b) => a.tradeId.localeCompare(b.tradeId)),
      historicalBookings: [...historicalBookings].sort((a, b) => a[0].localeCompare(b[0])),
      auditRevisions,
    })).digest('hex');

    const canonicalAt = (accountId: string, through: string) => documentedCostOf(
      nativeInDbOrder.filter((row) => row.accountId === accountId && row.date <= through).map(series),
      undefined, method);
    const makeInput = (through: string): KnownSecurityReplayInput => {
      const sequenceByDay = new Map<string, number>();
      const events = [
        ...relevant.filter((row) => row.date <= through).map((row) => ({
          id: row.id, date: row.date, securityId: input.securityId, currency: 'EUR',
          kind: row.kind as 'buy' | 'sell' | 'split', accountId: row.accountId,
          unitsE8: row.unitsE8, amountCents: row.amountCents,
          feeCents: row.feeCents, taxCents: row.taxCents, sequence: 0,
        })),
        ...livePairs.filter((pair) => legRows.get(pair.outTradeId)!.date <= through)
          .map((pair) => {
            const out = legRows.get(pair.outTradeId)!, incoming = legRows.get(pair.inTradeId)!;
            return { id: pair.id, date: out.date, securityId: input.securityId,
              currency: 'EUR', kind: 'transfer' as const, sequence: 0,
              sourceAccountId: out.accountId, destinationAccountId: incoming.accountId,
              unitsE8: incoming.unitsE8, outTradeId: out.id, inTradeId: incoming.id,
              creationOrder: pair.creationOrder };
          }),
      ].sort((a, b) => a.date.localeCompare(b.date) ||
        (a.kind === 'buy' ? 0 : a.kind === 'transfer' ? 2 : 1) -
        (b.kind === 'buy' ? 0 : b.kind === 'transfer' ? 2 : 1) ||
        (a.kind === 'transfer' && b.kind === 'transfer'
          ? a.creationOrder - b.creationOrder : 0));
      const sequenced: KnownSecurityReplayInput['events'][number][] = events.map((event) => {
        const sequence = sequenceByDay.get(event.date) ?? 0;
        sequenceByDay.set(event.date, sequence + 1);
        if (event.kind === 'transfer') {
          const { creationOrder: _order, ...transfer } = event;
          return { ...transfer, sequence };
        }
        return { ...event, sequence };
      });
      return {
        securityId: input.securityId, method,
        opening: 'recorded-ledger-zero-seed',
        coverage: { kind: 'all-supported-recorded-facts', through },
        accountIds, lockedAccountIds: [],
        events: sequenced,
      };
    };
    if (snapshots.filter((row) => row.deletedAt === null).length *
        (relevant.length + livePairs.length) > 50_000) return unavailable('scope_limit');
    for (const snapshot of snapshots) if (snapshot.deletedAt === null) {
      const at = makeInput(snapshot.asOf);
      const average = replayKnownSecurityTransfers({ ...at, method: 'average' });
      const fifo = replayKnownSecurityTransfers({ ...at, method: 'fifo' });
      const averageAccount = average.available && average.accounts.find((row) => row.accountId === snapshot.accountId);
      const fifoAccount = fifo.available && fifo.accounts.find((row) => row.accountId === snapshot.accountId);
      if (!averageAccount || !fifoAccount || averageAccount.unitsE8 !== snapshot.unitsE8 ||
          fifoAccount.unitsE8 !== snapshot.unitsE8 ||
          (snapshot.costBasisCents !== null &&
            snapshot.costBasisCents !== averageAccount.basisCents &&
            snapshot.costBasisCents !== fifoAccount.basisCents))
        return unavailable('unsupported_snapshot', [snapshot.id]);
    }
    // Later recorded facts are part of the same snapshot and must also have a viable native
    // replay before a backdated preview can be considered for a future transactional action.
    const fullInput = makeInput(latest);
    const full = replayKnownSecurityTransfers(fullInput);
    if (!full.available) return unavailable('replay_conflict', full.eventId ? [full.eventId] : []);
    const replayInput = makeInput(input.asOf);
    const state = replayKnownSecurityTransfers(replayInput);
    if (!state.available) return unavailable('replay_conflict', state.eventId ? [state.eventId] : []);
    for (const result of [
      { through: input.asOf, state }, { through: latest, state: full },
    ]) for (const accountState of result.state.accounts) {
      if (livePairs.some((pair) => legRows.get(pair.outTradeId)!.date <= result.through)) continue;
      const expected = canonicalAt(accountState.accountId, result.through);
      if (!expected || expected.unitsE8 !== accountState.unitsE8 ||
          expected.costBasisCents !== accountState.basisCents)
        return unavailable('canonical_conflict', [accountState.accountId]);
    }
    return {
      available: true, evidenceClass: livePairs.length ? 'recorded-paired' : 'recorded-native',
      replayThrough: input.asOf, fingerprintThrough: latest,
      factFingerprint, input: replayInput, fullInput, state,
      canonical: state.accounts.map((row) => ({ accountId: row.accountId,
        unitsE8: row.unitsE8, basisCents: row.basisCents })),
      relevantTradeIds: liveTrades.map((row) => row.id),
      relevantPairIds: livePairs.map((row) => row.id),
      writeBlockers,
    };
  });
}

/** Owner-facing projection of recorded evidence; never accepts caller-supplied lots or basis. */
export type RecordedSecurityTransferPreview =
  | { available: false; reason: string; message: string; applyAvailable: false }
  | {
      available: true;
      evidenceClass: 'recorded-native' | 'recorded-paired';
      method: 'fifo' | 'average';
      /** Versioned full-current-history CAS evidence for a later atomic writer. */
      factFingerprint: string;
      date: string;
      unitsE8: number;
      source: { accountId: string; beforeUnitsE8: number; beforeBasisCents: number;
        remainingUnitsE8: number; remainingBasisCents: number };
      destination: { accountId: string; beforeUnitsE8: number; beforeBasisCents: number;
        afterUnitsE8: number; afterBasisCents: number };
      transferredBasisCents: number;
      movedLots: { acquisitionId: string; acquiredOn: string; unitsE8: number; basisCents: number }[];
      cashDeltaCents: 0;
      realizedGainDeltaCents: 0;
      warnings: string[];
      applyAvailable: false;
    };

const historyMessage: Record<RecordedSecurityHistoryFailure, string> = {
  invalid_scope: 'Wertpapier, zwei verschiedene Konten und gültigen Stichtag auswählen.',
  account_or_currency: 'Beide Konten müssen budgetfreie Anlagekonten mit EUR-Einstand sein.',
  scope_limit: 'Die belegte Buchungshistorie überschreitet die Vorschaugrenze.',
  unsupported_snapshot: 'Ein älterer Bestandsstand lässt sich nicht aus den belegten Käufen ableiten.',
  unsupported_event: 'Diese Buchungshistorie enthält eine nicht unterstützte Kapitalmaßnahme.',
  unpaired_delivery: 'Eine frühere Lieferung ist nicht ausdrücklich als Übertragspaar belegt.',
  invalid_trade: 'Eine gespeicherte Buchung oder ihre Kontobuchung ist nicht schlüssig.',
  invalid_pair: 'Ein gespeichertes Übertragspaar hat widersprüchliche Buchungsseiten.',
  ambiguous_pair_order: 'Die Reihenfolge zwischen Übertrag und anderer Depotbuchung am selben Tag ist nicht belegt.',
  canonical_conflict: 'Der belegte Einstand stimmt nicht mit der bestehenden Bestandsrechnung überein.',
  replay_conflict: 'Die gespeicherte Buchungshistorie kann nicht vollständig nachgerechnet werden.',
};

export function previewRecordedSecurityTransfer(db: Executor, input: {
  securityId: string; sourceAccountId: string; destinationAccountId: string;
  date: string; unitsE8: number;
}): RecordedSecurityTransferPreview {
  if (!Number.isSafeInteger(input.unitsE8) || input.unitsE8 <= 0)
    return { available: false, reason: 'invalid_units',
      message: 'Positive Stückzahl mit höchstens acht Nachkommastellen eingeben.', applyAvailable: false };
  const history = readRecordedSecurityHistory(db, { securityId: input.securityId,
    sourceAccountId: input.sourceAccountId, destinationAccountId: input.destinationAccountId,
    asOf: input.date });
  if (!history.available) return { available: false, reason: history.code,
    message: historyMessage[history.code], applyAvailable: false };
  if (history.fullInput.events.some((event) => event.date === input.date &&
      (event.kind === 'sell' || event.kind === 'split') &&
      (event.accountId === input.sourceAccountId || event.accountId === input.destinationAccountId)))
    return { available: false, reason: 'ambiguous_pair_order',
      message: historyMessage.ambiguous_pair_order, applyAvailable: false };
  const source = history.state.accounts.find((row) => row.accountId === input.sourceAccountId)!;
  const destination = history.state.accounts.find((row) => row.accountId === input.destinationAccountId)!;
  const candidateId = randomUUID();
  const candidate = replayKnownSecurityTransfers({ ...history.fullInput,
    events: [...history.fullInput.events, { id: candidateId, date: input.date,
      sequence: history.fullInput.events.filter((event) => event.date === input.date).length,
      securityId: input.securityId, currency: 'EUR', kind: 'transfer',
      sourceAccountId: input.sourceAccountId, destinationAccountId: input.destinationAccountId,
      unitsE8: input.unitsE8, outTradeId: randomUUID(), inTradeId: randomUUID() }],
  });
  if (!candidate.available) return { available: false, reason: candidate.code,
    message: candidate.reason, applyAvailable: false };
  const plan = candidate.transfers.find((transfer) => transfer.pairId === candidateId)?.preview;
  if (!plan) return { available: false, reason: 'replay_conflict',
    message: historyMessage.replay_conflict, applyAvailable: false };
  return {
    available: true, evidenceClass: history.evidenceClass, method: plan.method,
    factFingerprint: history.factFingerprint,
    date: plan.date, unitsE8: plan.unitsE8,
    source: { accountId: source.accountId, beforeUnitsE8: source.unitsE8,
      beforeBasisCents: source.basisCents, remainingUnitsE8: source.unitsE8 - input.unitsE8,
      remainingBasisCents: plan.sourceRemainingBasisCents },
    destination: { accountId: destination.accountId, beforeUnitsE8: destination.unitsE8,
      beforeBasisCents: destination.basisCents,
      afterUnitsE8: destination.unitsE8 + input.unitsE8,
      afterBasisCents: plan.destinationBasisAfterCents },
    transferredBasisCents: plan.transferredBasisCents,
    movedLots: plan.moved.map((lot) => ({ acquisitionId: lot.acquisitionId,
      acquiredOn: lot.acquiredOn, unitsE8: lot.unitsE8, basisCents: lot.basisCents! })),
    cashDeltaCents: 0, realizedGainDeltaCents: 0,
    warnings: [
      'Vorschau auf Basis gespeicherter Budget-Buchungen; keine Bestätigung einer vollständigen Brokerhistorie.',
      'Stichtag nach allen bereits gespeicherten Buchungen dieses Tages; die spätere Übertragsreihenfolge ist noch nicht festgelegt.',
      ...(history.writeBlockers.includes('reconciled')
        ? ['Eine Kontoprüfung sperrt Änderungen am oder nach diesem Stichtag.'] : []),
      ...(history.writeBlockers.includes('account_closed')
        ? ['Ein beteiligtes Anlagekonto ist geschlossen und kann keinen neuen Übertrag erfassen.'] : []),
    ],
    applyAvailable: false,
  };
}
