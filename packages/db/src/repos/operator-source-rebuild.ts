import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  addDays,
  lastDayOfMonth,
  monthsBetween,
  matchSourceOperations,
  matchAggregatedSourceCash,
  planSourceRebuild,
  rebuildDaySchema,
  rebuildOperationSchema,
  rebuildSafe,
  rebuildValue,
  sourceBalancesOnDays,
  daysBetween,
  sourceAmountKey,
  rebuildLegDay,
  sourceMappingSchema,
  sourceInteger,
  REBUILD_REWARDS,
  rebuildAssetUnits,
  type RebuildTrade,
  type SourceOperation,
  type SourceMapping,
  type RebuildIssue,
} from '@budget/domain';
import { account, booking, inboxItem, price, holding, security } from '../schema';
import { type AuditContext } from './audit';
import { createTransfer, deleteBooking, updateBooking } from './bookings';
import { ReconciledLockedError } from './errors';
import { balanceSeries } from './ledger-queries';
import { OperatorInputError } from './operator-ops';
import { loadMatchLedger } from './read-source-ledger';
import { readSourceMappings } from './read-source';
import {
  createTrade,
  deleteTrade,
  listTrades,
  rewardTradeInputs,
  tradeCashTransferInput,
  updateTrade,
  type TradeInput,
  type TradeRow,
} from './trades';
import { runInTransaction, type Executor } from './types';

class DryRunRollback extends Error {}
const fold = (s: string) => s.trim().toLocaleLowerCase('de-AT');
const unitText = (n: number) =>
  `${BigInt(Math.abs(n)) / 100000000n}.${(BigInt(Math.abs(n)) % 100000000n).toString().padStart(8, '0')}`;
const equalTrade = (a: TradeRow, b: TradeInput) =>
  (
    [
      'securityId',
      'date',
      'kind',
      'unitsE8',
      'amountCents',
      'feeCents',
      'taxCents',
      'note',
    ] as const
  ).every((k) => a[k] === b[k]);
export interface SourceRebuildOptions {
  depot: string;
  cash: string;
  since: string;
  today: string;
  dryRun?: boolean;
  unlock?: boolean;
}
export interface SourceRebuildReport {
  groupId: string;
  dryRun: boolean;
  since: string;
  outcomes: {
    id: string;
    status: 'created' | 'updated' | 'removed' | 'unchanged' | 'matched' | 'kept' | 'skipped';
    reason?: string;
    tradeId?: string;
    trade?: Pick<
      TradeInput,
      | 'accountId'
      | 'securityId'
      | 'date'
      | 'kind'
      | 'unitsE8'
      | 'amountCents'
      | 'feeCents'
      | 'taxCents'
      | 'note'
    >;
  }[];
  issues: RebuildIssue[];
  units: {
    securityId: string;
    date: string;
    appUnitsE8: number;
    sourceUnitsE8: number;
    differenceE8: number;
  }[];
  cash: { date: string; appCents: number; sourceCents: number; differenceCents: number }[];
  cashTop20: SourceRebuildReport['cash'];
  cashEnd: SourceRebuildReport['cash'][number] | null;
  openingCash: {
    date: string;
    appCents: number;
    sourceCents: number;
    differenceCents: number;
    field: string;
    currentOpeningBalanceCents: number;
    proposedOpeningBalanceCents: number | null;
    openingDate: string;
    proposedOpeningDate: string | null;
  } | null;
  fiatMovements: {
    id: string;
    type: string;
    verdict: unknown;
    cashStatus: 'matched' | 'matched_by_sum' | 'missing' | 'none';
  }[];
  aggregatedCashMatches: ReturnType<typeof matchAggregatedSourceCash>['matches'];
  removedRows: { trades: number; bookings: number };
  unmapped: { key: string; legs: number; fiatEffectCents: number | null }[];
  createdByKind: Record<string, { count: number; amountCents: number }>;
  counts: Record<string, number>;
}
/** Operator-only, no fetch and no budget account writes. One run group with nested savepoints. */
export function applySourceRebuild(
  db: Executor,
  options: SourceRebuildOptions,
  ctx: Pick<AuditContext, 'actor'>,
): SourceRebuildReport {
  const since = rebuildDaySchema.parse(options.since),
    today = rebuildDaySchema.parse(options.today);
  if (since > today || daysBetween(since, today) >= 36525)
    throw new OperatorInputError(
      'since must be on/before today and within the app cash series 100-year limit',
    );
  const report: SourceRebuildReport = {
    groupId: randomUUID(),
    dryRun: Boolean(options.dryRun),
    since,
    outcomes: [],
    issues: [],
    units: [],
    cash: [],
    cashTop20: [],
    cashEnd: null,
    openingCash: null,
    fiatMovements: [],
    aggregatedCashMatches: [],
    removedRows: { trades: 0, bookings: 0 },
    unmapped: [],
    createdByKind: {},
    counts: {},
  };
  try {
    runInTransaction(db, (tx) => {
      const grouped = { actor: ctx.actor, groupId: report.groupId };
      const writeOptions = { unlockReconciled: Boolean(options.unlock) };
      const liveAccounts = tx.select().from(account).where(isNull(account.deletedAt)).all();
      const resolveAccount = (name: string) => {
        const rows = liveAccounts.filter((a) => fold(a.name) === fold(name));
        if (
          rows.length !== 1 ||
          rows[0]!.closedAt ||
          rows[0]!.onBudget ||
          rows[0]!.role !== 'investment'
        )
          throw new OperatorInputError(
            'Select one active off-budget investment account by exact name',
          );
        return rows[0]!;
      };
      const depot = resolveAccount(options.depot),
        cash = resolveAccount(options.cash);
      if (
        depot.id === cash.id ||
        depot.referenceAccountId !== cash.id ||
        depot.currency !== cash.currency
      )
        throw new OperatorInputError(
          'cash must be the separate same-currency depot reference account',
        );
      const allMappings = readSourceMappings(tx).map((m) => sourceMappingSchema.parse(m));
      if (new Set(allMappings.map((m) => m.key)).size !== allMappings.length)
        throw new OperatorInputError('Duplicate source mapping');
      const mappings = allMappings.filter(
        (m) => m.accountId === depot.id || m.accountId === cash.id,
      );
      const assets = mappings.filter((m) => m.accountId === depot.id && m.securityId);
      const cashMappings = mappings.filter((m) => m.accountId === cash.id && !m.securityId);
      if (!assets.length || cashMappings.length !== 1)
        throw new OperatorInputError(
          'Map depot assets and exactly one fiat currency to cash first',
        );
      const cashKey = cashMappings[0]!.key;
      if (!cashKey.startsWith('currency:') || assets.some((m) => !m.key.startsWith('asset:')))
        throw new OperatorInputError('Source mapping key has an invalid asset/currency identity');
      if (new Set(assets.map((m) => m.securityId)).size !== assets.length)
        throw new OperatorInputError('Multiple source assets map to one security');
      for (const m of assets)
        if (
          !tx
            .select()
            .from(security)
            .where(and(eq(security.id, m.securityId!), isNull(security.deletedAt)))
            .get()
        )
          throw new OperatorInputError('Mapped security is unavailable');
      // A snapshot overrides trade history in the app. Never promise a rebuild that it would mask.
      if (
        tx
          .select()
          .from(holding)
          .where(and(eq(holding.accountId, depot.id), isNull(holding.deletedAt)))
          .get()
      )
        throw new OperatorInputError(
          'Depot has holding snapshots; resolve them before rebuilding trade history',
        );
      const operations: SourceOperation[] = tx
        .select()
        .from(inboxItem)
        .where(and(eq(inboxItem.refType, 'read_source'), eq(inboxItem.kind, 'import')))
        .all()
        .map((row) => rebuildOperationSchema.parse(JSON.parse(row.detail ?? 'null')));
      if (!operations.length) throw new OperatorInputError('No staged source operations');
      if (
        new Set(operations.map((op) => op.id)).size !== operations.length ||
        new Set(operations.flatMap((op) => op.transactions.map((t) => t.id))).size !==
          operations.reduce((s, op) => s + op.transactions.length, 0)
      )
        throw new OperatorInputError('Duplicate source operation or transaction');
      const prices = tx.select().from(price).all();
      const openingDay = addDays(since, -1);
      // Validate replay precision before the first destructive write.
      const allDays: string[] = [];
      for (let day = openingDay; day <= today; day = addDays(day, 1)) allDays.push(day);
      const sourceHistory = sourceBalancesOnDays(
        operations,
        allDays,
        new Set([...assets.map((m) => m.key), cashKey]),
      );
      const openingSource = sourceHistory.get(openingDay)!;
      const before = listTrades(tx, { accountId: depot.id });
      const ownerLedger = loadMatchLedger(tx, mappings);
      const ownerIds = new Set(
        before
          .filter((t) => !t.importKey?.startsWith('pp:') && !t.importKey?.startsWith('rebuild:'))
          .map((t) => t.id),
      );
      ownerLedger.trades = ownerLedger.trades.filter((t) => ownerIds.has(t.id));
      const rewardLegs = operations
        .filter(
          (op) =>
            REBUILD_REWARDS.has(op.type) &&
            !op.transactions.some((t) => !t.amount.assetId && !['fee', 'tax'].includes(t.type)),
        )
        .flatMap((op) =>
          op.transactions
            .filter(
              (t) =>
                t.amount.assetId &&
                assets.some((m) => m.key === sourceAmountKey(t.amount)) &&
                !['fee', 'tax'].includes(t.type) &&
                rebuildLegDay(t) >= since,
            )
            .map((t): SourceOperation => ({
              ...op,
              id: `${op.id}:${t.id}`,
              transactions: [
                {
                  ...t,
                  amount: { ...t.amount, value: unitText(rebuildAssetUnits(t, op.transactions)) },
                  fee: null,
                  tradeFee: null,
                },
              ],
            })),
        );
      const ownerRewardMatches = matchSourceOperations(rewardLegs, mappings, ownerLedger);
      const claimedRewardLegs = new Set(
        rewardLegs
          .filter((op) => ownerRewardMatches.get(op.id)?.status === 'matched')
          .map((op) => op.id),
      );
      for (const id of claimedRewardLegs)
        report.outcomes.push({ id, status: 'matched', reason: 'owner_reward_leg' });
      const toRebuild = operations.map((op) => ({
        ...op,
        transactions: op.transactions.filter((t) => !claimedRewardLegs.has(`${op.id}:${t.id}`)),
      }));
      const plan = planSourceRebuild(toRebuild, assets, prices, since, cashKey, cash.currency);
      report.issues.push(...plan.issues);
      const desired: RebuildTrade[] = [...plan.trades];
      const sumUnits = (rows: TradeRow[], m: SourceMapping, day: string) =>
        rebuildSafe(
          rows
            .filter((t) => t.securityId === m.securityId && t.date <= day)
            .reduce((s, t) => s + BigInt(t.unitsE8), 0n),
        );
      for (const m of assets) {
        const key = `rebuild:opening:${since}:${m.securityId}`;
        const app = sumUnits(
          before.filter((t) => t.importKey !== key),
          m,
          openingDay,
        );
        const difference = rebuildSafe(BigInt(openingSource.get(m.key) ?? 0) - BigInt(app));
        if (!difference) continue;
        const value = rebuildValue(
          prices,
          m.securityId!,
          openingDay,
          difference,
          depot.currency,
          0,
        );
        if (value === null) report.issues.push({ id: key, key: m.key, reason: 'opening_no_price' });
        desired.push({
          securityId: m.securityId!,
          date: openingDay,
          kind: difference > 0 ? 'delivery_in' : 'delivery_out',
          unitsE8: difference,
          amountCents: value ?? 0,
          feeCents: 0,
          taxCents: 0,
          importKey: key,
          note: `Source opening at ${openingDay}`,
        });
      }
      const inputsOf = (t: RebuildTrade): TradeInput[] => {
        const base = {
          ...t,
          accountId: depot.id,
          kind: t.kind === 'reward' ? ('buy' as const) : t.kind,
          source: 'import' as const,
        };
        return t.kind === 'reward' ? rewardTradeInputs(base) : [base];
      };
      const wanted = new Set(desired.flatMap((t) => inputsOf(t).map((i) => i.importKey!)));
      if (wanted.size !== desired.reduce((sum, t) => sum + inputsOf(t).length, 0))
        throw new OperatorInputError('Source rebuild keys collide');
      const liveBookings = () => tx.select().from(booking).where(isNull(booking.deletedAt)).all();
      const cashLeg = (t: TradeRow) =>
        liveBookings().filter(
          (b) => b.accountId === depot.id && b.importKey === `${t.importKey}:cash`,
        );
      const attempt = (id: string, f: (inner: Executor) => void) => {
        const n = report.outcomes.length;
        const removed = { ...report.removedRows };
        try {
          runInTransaction(tx, f);
        } catch (error) {
          report.outcomes.length = n;
          report.removedRows = removed;
          report.outcomes.push({
            id,
            status: 'skipped',
            reason:
              error instanceof ReconciledLockedError
                ? 'reconciled_locked'
                : error instanceof Error
                  ? error.message
                  : 'refused',
          });
        }
      };
      const remove = (inner: Executor, t: TradeRow) => {
        const legs = cashLeg(t),
          rows = liveBookings().length;
        if (legs.length > 1) throw new OperatorInputError('Ambiguous cash settlement');
        if (legs[0]) {
          if (
            !legs[0].transferId ||
            !liveBookings().some(
              (b) => b.transferId === legs[0]!.transferId && b.accountId === cash.id,
            )
          )
            throw new OperatorInputError(
              'Cash settlement does not belong to selected cash account',
            );
          deleteBooking(inner, legs[0].id, grouped, writeOptions);
        }
        deleteTrade(inner, t.id, grouped, writeOptions);
        report.removedRows.trades++;
        report.removedRows.bookings += rows - liveBookings().length;
        report.outcomes.push({ id: t.importKey!, status: 'removed', tradeId: t.id, trade: t });
      };
      const removedIds = new Set<string>();
      for (const t of before) {
        if (removedIds.has(t.id)) continue;
        const key = t.importKey ?? '';
        const imported =
          !t.bookingId || liveBookings().find((b) => b.id === t.bookingId)?.source === 'import';
        if (
          (t.date >= since && key.startsWith('pp:') && imported) ||
          ((t.date >= since || key.startsWith(`rebuild:opening:${since}:`)) &&
            key.startsWith('rebuild:') &&
            !wanted.has(key))
        ) {
          attempt(key, (inner) => {
            const pair =
              key.startsWith('rebuild:reward:') && /:(buy|div)$/.test(key)
                ? before.filter(
                    (r) =>
                      r.importKey === `${key.slice(0, -4)}:buy` ||
                      r.importKey === `${key.slice(0, -4)}:div`,
                  )
                : [t];
            for (const r of pair) remove(inner, r);
            pair.forEach((r) => removedIds.add(r.id));
          });
        } else if (!key.startsWith('rebuild:'))
          report.outcomes.push({
            id: t.id,
            status: 'kept',
            tradeId: t.id,
            reason: 'owner_or_before_since',
            trade: t,
          });
      }
      for (const b of liveBookings().filter(
        (b) =>
          b.accountId === cash.id &&
          b.source === 'import' &&
          (b.importKey === `pp:cash-target:${cash.id}` ||
            b.importKey?.startsWith(`pp:cash-target:${cash.id}:`)),
      ))
        attempt(b.importKey!, (inner) => {
          const rows = liveBookings().length;
          deleteBooking(inner, b.id, grouped, writeOptions);
          report.removedRows.bookings += rows - liveBookings().length;
          report.outcomes.push({ id: b.importKey!, status: 'removed', reason: 'cash_target' });
        });

      // Match individual proposed unit movements together; owner and locked rows are claimed once.
      const preservedLedger = loadMatchLedger(tx, mappings);
      preservedLedger.trades = preservedLedger.trades.filter(
        (t) =>
          !listTrades(tx, { accountId: depot.id }).some(
            (r) => r.id === t.id && wanted.has(r.importKey ?? ''),
          ),
      );
      const synthetic = desired
        .filter((t) => !t.importKey.startsWith('rebuild:opening:'))
        .map((t): SourceOperation => ({
          id: t.importKey,
          type: t.kind === 'reward' ? 'reward' : t.kind,
          transactions: [
            {
              id: t.importKey,
              type: t.kind,
              walletId: 'rebuild-match',
              flow: t.unitsE8 < 0 ? 'OUTGOING' : 'INCOMING',
              creditedAt: `${t.date}T12:00:00Z`,
              amount:
                t.kind === 'interest'
                  ? {
                      value: `${BigInt(t.amountCents) / 100n}.${(BigInt(t.amountCents) % 100n).toString().padStart(2, '0')}`,
                      assetId: null,
                      currencyId: cashKey.slice(9),
                      cents: t.amountCents,
                    }
                  : {
                      value: unitText(t.unitsE8),
                      assetId: assets.find((m) => m.securityId === t.securityId)!.key.slice(6),
                      currencyId: null,
                      cents: null,
                    },
              fee: null,
              balanceAfter: null,
              tradeId: null,
              tradeFee: null,
              compensates: null,
            },
          ],
        }));
      const matches = matchSourceOperations(synthetic, mappings, preservedLedger);
      for (const desiredTrade of desired)
        attempt(desiredTrade.importKey, (inner) => {
          const match = matches.get(desiredTrade.importKey);
          if (match?.status === 'matched') {
            // An owner counterpart added after a prior rebuild replaces our duplicate only.
            for (const input of inputsOf(desiredTrade)) {
              const old = listTrades(tx, { accountId: depot.id }).find(
                (t) => t.importKey === input.importKey,
              );
              if (old) remove(inner, old);
            }
            report.outcomes.push({
              id: desiredTrade.importKey,
              status: 'matched',
              reason: JSON.stringify(match.refs),
              trade: inputsOf(desiredTrade).at(-1)!,
            });
            return;
          }
          const inputs = inputsOf(desiredTrade);
          const statuses: string[] = [];
          for (const input of inputs) {
            const existing = listTrades(tx, { accountId: depot.id, includeDeleted: true }).find(
              (t) => t.importKey === input.importKey,
            );
            if (existing?.deletedAt)
              throw new OperatorInputError('rebuild_key_deleted: restore with undo-group first');
            let status: 'created' | 'updated' | 'unchanged' = 'created';
            if (existing) {
              status = equalTrade(existing, input) ? 'unchanged' : 'updated';
              if (status === 'updated')
                updateTrade(inner, existing.id, input, grouped, writeOptions);
            } else createTrade(inner, input, grouped);
            if (desiredTrade.kind !== 'reward') {
              const transfer = tradeCashTransferInput(input, cash.id);
              const old = tx
                .select()
                .from(booking)
                .where(
                  and(
                    eq(booking.accountId, depot.id),
                    eq(booking.importKey, `${input.importKey}:cash`),
                  ),
                )
                .get();
              if (old?.deletedAt)
                throw new OperatorInputError('cash_key_deleted: restore with undo-group first');
              if (
                old &&
                (!old.transferId ||
                  !liveBookings().some(
                    (b) => b.transferId === old.transferId && b.accountId === cash.id,
                  ))
              )
                throw new OperatorInputError('Cash settlement conflict');
              if (transfer && old) {
                const signed =
                  transfer.fromAccountId === depot.id
                    ? -transfer.amountCents
                    : transfer.amountCents;
                if (old.amountCents !== signed || old.date !== input.date) {
                  updateBooking(
                    inner,
                    old.id,
                    { date: input.date, amountCents: signed },
                    grouped,
                    writeOptions,
                  );
                  status = 'updated';
                }
              } else if (transfer) {
                createTransfer(inner, transfer, grouped);
                if (status === 'unchanged') status = 'updated';
              } else if (old) {
                deleteBooking(inner, old.id, grouped, writeOptions);
                status = 'updated';
              }
            }
            statuses.push(status);
            report.outcomes.push({ id: input.importKey!, status, trade: input });
          }
          if (
            desiredTrade.kind === 'reward' &&
            statuses.includes('created') &&
            statuses.some((s) => s !== 'created')
          )
            throw new OperatorInputError('Incomplete reward pair');
        });
      const cashHistory = new Map(
        balanceSeries(tx, cash.id, { from: openingDay, to: today }).map((b) => [
          b.date,
          b.balanceCents,
        ]),
      );
      const balanceAt = (day: string) => rebuildSafe(BigInt(cashHistory.get(day)!));
      const sourceCash = (day: string) => sourceHistory.get(day)!.get(cashKey) ?? 0;
      const appOpening = balanceAt(openingDay),
        srcOpening = sourceCash(openingDay);
      const delta = rebuildSafe(BigInt(srcOpening) - BigInt(appOpening));
      report.openingCash = {
        date: openingDay,
        appCents: appOpening,
        sourceCents: srcOpening,
        differenceCents: delta,
        field: 'Einstellungen > Konten > openingBalanceCents (Anfangssaldo)',
        currentOpeningBalanceCents: cash.openingBalanceCents,
        proposedOpeningBalanceCents:
          cash.openingDate > openingDay
            ? null
            : rebuildSafe(BigInt(cash.openingBalanceCents) + BigInt(delta)),
        openingDate: cash.openingDate,
        proposedOpeningDate: cash.openingDate > openingDay ? openingDay : null,
      };
      const dates = [
        ...new Set([
          openingDay,
          ...monthsBetween(since.slice(0, 7), today.slice(0, 7))
            .map(lastDayOfMonth)
            .filter((day) => day <= today),
          today,
        ]),
      ];
      const after = listTrades(tx, { accountId: depot.id });
      for (const day of dates) {
        const source = sourceHistory.get(day)!;
        for (const m of assets) {
          const app = sumUnits(after, m, day),
            src = source.get(m.key) ?? 0;
          report.units.push({
            securityId: m.securityId!,
            date: day,
            appUnitsE8: app,
            sourceUnitsE8: src,
            differenceE8: rebuildSafe(BigInt(app) - BigInt(src)),
          });
        }
      }
      for (let day = openingDay; day <= today; day = addDays(day, 1)) {
        const appCents = balanceAt(day),
          sourceCents = sourceCash(day);
        const row = {
          date: day,
          appCents,
          sourceCents,
          differenceCents: rebuildSafe(BigInt(appCents) - BigInt(sourceCents)),
        };
        if (row.differenceCents) report.cash.push(row);
        if (day === today) report.cashEnd = row;
      }
      report.cashTop20 = [...report.cash]
        .sort(
          (a, b) =>
            Math.abs(b.differenceCents) - Math.abs(a.differenceCents) ||
            a.date.localeCompare(b.date),
        )
        .slice(0, 20);
      const ledger = loadMatchLedger(tx, mappings);
      const verdicts = matchSourceOperations(plan.unbooked, allMappings, ledger);
      const cashLegs = plan.unbooked.flatMap((op) =>
        op.transactions
          .filter((t) => sourceAmountKey(t.amount) === cashKey && !['fee', 'tax'].includes(t.type))
          .map((t) => ({ opId: op.id, tx: t, operation: { ...op, id: t.id, transactions: [t] } })),
      );
      const cashVerdicts = matchSourceOperations(
        cashLegs.map((l) => l.operation),
        mappings,
        ledger,
      );
      const claimedBookings = new Set(
        [...cashVerdicts.values()].flatMap((v) =>
          v.status === 'matched' ? v.refs.filter((r) => r.type === 'booking').map((r) => r.id) : [],
        ),
      );
      const movements = cashLegs
        .filter((l) => cashVerdicts.get(l.tx.id)?.status !== 'matched')
        .map(({ tx: t }) => ({
          id: t.id,
          date: rebuildLegDay(t),
          amountCents:
            (t.flow === 'INCOMING' ? 1 : -1) * Math.abs(sourceInteger(t.amount.value, 2)!),
        }));
      const aggregate = matchAggregatedSourceCash(
        movements,
        ledger.bookings.filter((b) => b.accountId === cash.id && !claimedBookings.has(b.id)),
      );
      report.aggregatedCashMatches = aggregate.matches;
      for (const id of aggregate.limitedBookingIds)
        report.issues.push({ id, reason: 'aggregate_search_limit' });
      const aggregateIds = new Set(report.aggregatedCashMatches.flatMap((m) => m.movementIds));
      report.fiatMovements = plan.unbooked.map(
        (op): SourceRebuildReport['fiatMovements'][number] => {
          const legs = cashLegs.filter((l) => l.opId === op.id);
          const matched = legs.every(
            (l) => cashVerdicts.get(l.tx.id)?.status === 'matched' || aggregateIds.has(l.tx.id),
          );
          return {
            id: op.id,
            type: op.type,
            verdict: verdicts.get(op.id),
            cashStatus: !legs.length
              ? 'none'
              : !matched
                ? 'missing'
                : legs.some((l) => aggregateIds.has(l.tx.id))
                  ? 'matched_by_sum'
                  : 'matched',
          };
        },
      );
      for (const issue of report.issues.filter((i) => i.reason === 'unmapped_asset')) {
        const row = report.unmapped.find((r) => r.key === issue.key);
        if (row) {
          row.legs++;
          row.fiatEffectCents =
            row.fiatEffectCents === null || issue.fiatEffectCents == null
              ? null
              : rebuildSafe(BigInt(row.fiatEffectCents) + BigInt(issue.fiatEffectCents));
        } else
          report.unmapped.push({
            key: issue.key!,
            legs: 1,
            fiatEffectCents: issue.fiatEffectCents ?? null,
          });
      }
      for (const outcome of report.outcomes) {
        report.counts[outcome.status] = (report.counts[outcome.status] ?? 0) + 1;
        if (outcome.status === 'created') {
          const t = after.find((t) => t.importKey === outcome.id)!;
          const row = report.createdByKind[t.kind] ?? { count: 0, amountCents: 0 };
          row.count++;
          row.amountCents = rebuildSafe(BigInt(row.amountCents) + BigInt(t.amountCents));
          report.createdByKind[t.kind] = row;
        }
      }
      report.counts['issues'] = report.issues.length;
      report.counts['unitDifferences'] = report.units.filter((u) => u.differenceE8).length;
      report.counts['cashDifferences'] = report.cash.length;
      report.counts['unmatchedFiat'] = report.fiatMovements.filter(
        (m) => m.cashStatus === 'missing',
      ).length;
      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
    report.groupId = '';
  }
  if (!report.outcomes.some((o) => ['created', 'updated', 'removed'].includes(o.status)))
    report.groupId = '';
  return report;
}
