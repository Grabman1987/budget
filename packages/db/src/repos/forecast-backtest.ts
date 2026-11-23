import {
  accountLiquidityForecast,
  addDays,
  addMonths,
  balanceSeries,
  daysBetween,
  incomePauseAmount,
  isLiquidityAccount,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  occurrences,
  plannedEventOccurrences,
  roundDivCents,
  versionOn,
  type ForecastAccountItem,
} from '@budget/domain';
import { and, asc, gte, inArray, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  account,
  auditLog,
  booking,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentPause,
  expectedPaymentVersion,
  incomePause,
  plannedEvent,
  statementSettlement,
} from '../schema';
import { tableMeta, type Snapshot } from './audit';
import { schedulePayment, scheduleVersion } from './expected';
import { runInTransaction, type Executor } from './types';

const historyTables = [
  account,
  booking,
  expectedPayment,
  expectedPaymentVersion,
  expectedPaymentPause,
  expectedOccurrence,
  incomePause,
  plannedEvent,
  statementSettlement,
];
type Revision = Pick<typeof auditLog.$inferSelect, 'ts' | 'entityType' | 'entityId' | 'beforeJson'>;
type DatedRow = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };

/** Rewind retained audit snapshots in reverse write order, including Undo/redo. */
function atCutoff<T extends SQLiteTable>(
  table: T,
  current: readonly (T['$inferSelect'] & DatedRow)[],
  changes: readonly Revision[],
  cutoff: string,
) {
  const { name, columns } = tableMeta(table);
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const revision of changes) {
    if (revision.entityType !== name || revision.ts < cutoff) continue;
    if (revision.beforeJson === null) {
      byId.delete(revision.entityId);
      continue;
    }
    const before = JSON.parse(revision.beforeJson) as Snapshot;
    const props = Object.fromEntries(
      Object.entries(columns).flatMap(([prop, column]) =>
        Object.hasOwn(before, column.name) ? [[prop, before[column.name]]] : [],
      ),
    );
    byId.set(revision.entityId, {
      ...byId.get(revision.entityId),
      ...props,
    } as (typeof current)[number]);
  }
  return [...byId.values()].filter(
    (row) => row.createdAt < cutoff && row.updatedAt < cutoff && row.deletedAt === null,
  );
}

type Booking = typeof booking.$inferSelect;
type Item = ForecastAccountItem & { key?: string };
type Cause = 'unplanned_expense' | 'late_income' | 'missing_schedule' | 'unclassified';
type Score = {
  predictedCents: number;
  actualCents: number;
  errorCents: number;
  predictedDay: string;
  actualDay: string;
  cause: Cause | null;
};
type Row = { month: string; accountId: string; name: string; end: Score; low: Score };

function score(
  predicted: { day: string; cents: number },
  actual: { day: string; cents: number },
  causeAt: (day: string, sign: number) => Cause,
): Score {
  const errorCents = actual.cents - predicted.cents;
  if (!Number.isSafeInteger(errorCents)) throw new RangeError('Unsafe forecast error');
  return {
    predictedCents: predicted.cents,
    actualCents: actual.cents,
    errorCents,
    predictedDay: predicted.day,
    actualDay: actual.day,
    cause:
      errorCents === 0
        ? null
        : causeAt(errorCents < 0 ? actual.day : predicted.day, Math.sign(errorCents)),
  };
}

/** Attribute only actual links or exact one-to-one planned movements; leave ambiguity visible. */
function causes(
  items: readonly Item[],
  actual: readonly Booking[],
  linkedKeys: ReadonlyMap<string, string>,
) {
  const used = new Set<Item>();
  const evidence = actual.flatMap((row): { day: string; cents: number; cause: Cause }[] => {
    const key = linkedKeys.get(row.id);
    if (!key && row.transferId !== null) return [];
    const matched = items.find(
      (item) =>
        !used.has(item) &&
        (key
          ? key === item.key
          : item.key === undefined && item.cents === row.amountCents && item.day === row.date),
    );
    if (matched) {
      used.add(matched);
      return matched.cents > 0 && row.amountCents > 0 && row.date > matched.day
        ? [
            { day: matched.day, cents: -matched.cents, cause: 'late_income' },
            { day: row.date, cents: matched.cents, cause: 'late_income' },
          ]
        : [];
    }
    return [
      {
        day: row.date,
        cents: row.amountCents,
        cause: key || row.amountCents > 0 ? 'missing_schedule' : 'unplanned_expense',
      },
    ];
  });
  return (day: string, sign: number): Cause => {
    const totals = new Map<Cause, bigint>();
    for (const entry of evidence) {
      if (entry.day > day) continue;
      totals.set(entry.cause, (totals.get(entry.cause) ?? 0n) + BigInt(entry.cents));
    }
    let cause: Cause = 'unclassified';
    let strongest = 0n;
    for (const [candidate, cents] of totals) {
      const contribution = cents * BigInt(sign);
      if (contribution > strongest) {
        strongest = contribution;
        cause = candidate;
      }
    }
    return cause;
  };
}

/** Closed months only. The information cutoff is the end of day one in Vienna. */
export function forecastBacktest(db: Executor, today: string, count = 6) {
  if (!Number.isInteger(count) || count < 1 || count > 24)
    throw new RangeError('Expected 1 to 24 closed months');
  return runInTransaction(db, (tx) => {
    const currentMonth = monthOf(today);
    const months = monthsBetween(addMonths(currentMonth, -count), addMonths(currentMonth, -1));
    const firstCutoff = cutoffAfter(`${months[0]}-01`);
    const revisions = tx
      .select({
        ts: auditLog.ts,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        beforeJson: auditLog.beforeJson,
      })
      .from(auditLog)
      .where(
        and(
          gte(auditLog.ts, firstCutoff),
          inArray(
            auditLog.entityType,
            historyTables.map((table) => tableMeta(table).name),
          ),
        ),
      )
      .orderBy(sql`rowid DESC`)
      .all();
    const accounts = tx.select().from(account).orderBy(asc(account.id)).all();
    const bookings = tx.select().from(booking).orderBy(asc(booking.date), asc(booking.id)).all();
    const payments = tx.select().from(expectedPayment).all();
    const versions = tx
      .select()
      .from(expectedPaymentVersion)
      .orderBy(asc(expectedPaymentVersion.validFrom))
      .all();
    const pauses = tx.select().from(expectedPaymentPause).all();
    const occurrenceRows = tx.select().from(expectedOccurrence).all();
    const incomePauses = tx.select().from(incomePause).all();
    const events = tx.select().from(plannedEvent).all();
    const statements = tx.select().from(statementSettlement).all();
    const actualById = new Map(accounts.map((row) => [row.id, row]));
    const liveBookings = bookings.filter((row) => row.deletedAt === null && row.date <= today);
    const linkedKeys = new Map(
      occurrenceRows.flatMap((row) =>
        row.deletedAt === null && row.bookingId !== null
          ? [[row.bookingId, `${row.expectedPaymentId}|${row.dueDate}`] as const]
          : [],
      ),
    );
    const rows: Row[] = [];
    let incompleteAccounts = 0;
    for (const month of months) {
      const start = `${month}-01`;
      const end = lastDayOfMonth(month);
      const cutoff = cutoffAfter(start);
      const historicAccounts = atCutoff(account, accounts, revisions, cutoff)
        .filter((row) => isLiquidityAccount(row, start))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!historicAccounts.length) continue;
      const actualAccounts = historicAccounts.flatMap((row) => {
        const actual = actualById.get(row.id);
        return actual?.currency === 'EUR' && actual.openingDate <= start ? [actual] : [];
      });
      const ids = new Set(historicAccounts.map((a) => a.id));
      const historicBookings = atCutoff(booking, bookings, revisions, cutoff).filter(
        (row) => row.date <= start,
      );
      const historicBookingIds = new Set(historicBookings.map((row) => row.id));
      const actualBookings = liveBookings.filter(
        (row) => ids.has(row.accountId) && row.date <= end,
      );
      const days = daysBetween(start, end);
      const dates = Array.from({ length: days + 1 }, (_, i) => addDays(start, i));
      const startBalances = balanceSeries(
        historicAccounts,
        historicBookings.filter((row) => ids.has(row.accountId)),
        [start],
      )[0]!.balances;
      const actualIds = new Set(actualAccounts.map((row) => row.id));
      const actualBalances = balanceSeries(
        actualAccounts,
        actualBookings.filter((row) => actualIds.has(row.accountId)),
        dates,
      );
      const marks = new Map(
        atCutoff(expectedOccurrence, occurrenceRows, revisions, cutoff).map((row) => [
          `${row.expectedPaymentId}|${row.dueDate}`,
          row,
        ]),
      );
      const historicalVersions = atCutoff(expectedPaymentVersion, versions, revisions, cutoff).sort(
        (a, b) => a.validFrom.localeCompare(b.validFrom),
      );
      const historicalPauses = atCutoff(expectedPaymentPause, pauses, revisions, cutoff);
      const historicalIncomePauses = atCutoff(incomePause, incomePauses, revisions, cutoff);
      const historicalStatements = atCutoff(
        statementSettlement,
        statements,
        revisions,
        cutoff,
      ).filter((row) => row.state === 'open' || row.state === 'represented');
      const replaced = new Set(
        historicalStatements.flatMap((row) =>
          row.legacyPaymentId && row.legacyDueDate
            ? [`${row.legacyPaymentId}|${row.legacyDueDate}`]
            : [],
        ),
      );
      const items: Item[] = [];
      const incompleteIds = new Set<string>();
      for (const payment of atCutoff(expectedPayment, payments, revisions, cutoff)) {
        const accountId = payment.accountId;
        if (accountId === null || !ids.has(accountId)) continue;
        const ownVersions = historicalVersions.filter(
          (row) => row.expectedPaymentId === payment.id,
        );
        const ownPauses = historicalPauses
          .filter((row) => row.expectedPaymentId === payment.id)
          .map(({ fromDate, throughDate }) => ({ fromDate, throughDate }));
        const schedule = { ...schedulePayment(payment), pauses: ownPauses };
        const due = new Map(
          occurrences(schedule, ownVersions.map(scheduleVersion), start, end).map((row) => [
            row.dueDate,
            row.amountCents,
          ]),
        );
        if (payment.kind === 'outflow') {
          for (const mark of marks.values())
            if (
              mark.expectedPaymentId === payment.id &&
              mark.dueDate <= start &&
              mark.status === 'expected'
            )
              due.set(mark.dueDate, mark.expectedAmountCents);
        }
        for (const [day, amountCents] of due) {
          const key = `${payment.id}|${day}`;
          const mark = marks.get(key);
          if (
            replaced.has(key) ||
            mark?.status === 'skipped' ||
            mark?.status === 'missed' ||
            (mark?.bookingId && historicBookingIds.has(mark.bookingId))
          )
            continue;
          const currency = versionOn(ownVersions, day)?.currency ?? 'EUR';
          // Rate rows can be revised/backfilled without preserving their publication timestamp.
          if (currency !== 'EUR' && amountCents !== 0) {
            incompleteIds.add(accountId);
            continue;
          }
          const pause = historicalIncomePauses.find(
            (row) =>
              row.expectedPaymentId === payment.id && row.startDate <= day && day <= row.endDate,
          );
          const amount =
            pause && day >= start
              ? incomePauseAmount(
                  {
                    expectedPaymentId: payment.id,
                    dueDate: day,
                    kind: payment.kind,
                    currency,
                    amountCents,
                  },
                  pause,
                )
              : amountCents;
          items.push({
            accountId,
            key,
            day,
            cents: amount,
            kind: payment.kind === 'inflow' ? 'income' : 'fixed',
            expected: payment.kind === 'inflow',
          });
        }
      }
      for (const event of atCutoff(plannedEvent, events, revisions, cutoff)) {
        if (!event.enabled || event.accountId === null || !ids.has(event.accountId)) continue;
        for (const movement of plannedEventOccurrences(event, addDays(start, 1), end))
          items.push({
            accountId: event.accountId,
            day: movement.date,
            cents: movement.amountCents,
            expected: movement.amountCents > 0,
            kind: 'event',
          });
      }
      for (const statement of historicalStatements) {
        if (statement.currency !== 'EUR' || statement.debitDate > end) continue;
        for (const [accountId, bookingId, cents] of [
          [statement.fundingAccountId, statement.fromBookingId, -statement.payableCents],
          [statement.cardAccountId, statement.toBookingId, statement.payableCents],
        ] as const) {
          if (
            !ids.has(accountId) ||
            (bookingId && historicBookingIds.has(bookingId)) ||
            (cents >= 0 && statement.debitDate <= start && !ids.has(statement.fundingAccountId))
          )
            continue;
          items.push({
            accountId,
            day: statement.debitDate,
            cents,
            expected: false,
            kind: 'event',
          });
        }
      }
      const projected = accountLiquidityForecast(
        {
          startDay: start,
          accounts: historicAccounts.map((row) => ({
            id: row.id,
            name: row.name,
            balanceCents: startBalances.get(row.id)!,
          })),
          items,
          // The live model leaves the household variable-spending estimate unassigned.
          variableMonthlyCents: 0,
        },
        days,
      ).withExpectedInflows;
      for (const path of projected.accounts) {
        const { accountId, name } = path;
        if (!actualIds.has(accountId) || incompleteIds.has(accountId)) {
          incompleteAccounts++;
          continue;
        }
        const actualPath = actualBalances.map(({ date, balances }) => {
          const cents = balances.get(accountId)!;
          if (!Number.isSafeInteger(cents)) throw new RangeError('Unsafe actual balance');
          return { day: date, cents };
        });
        const actualLow = actualPath.reduce((low, point) =>
          point.cents < low.cents ? point : low,
        );
        const accountItems = items.filter((item) => item.accountId === accountId);
        const incomeKeys = new Set(
          accountItems.filter((item) => item.cents > 0).map((item) => item.key),
        );
        const explain = causes(
          accountItems,
          liveBookings.filter((row) => {
            if (row.accountId !== accountId || row.date < actualById.get(accountId)!.openingDate)
              return false;
            if (row.date > end) {
              const key = linkedKeys.get(row.id);
              return row.amountCents > 0 && key !== undefined && incomeKeys.has(key);
            }
            return row.date > start || !historicBookingIds.has(row.id);
          }),
          linkedKeys,
        );
        rows.push({
          month,
          accountId,
          name,
          end: score(
            { day: end, cents: path.days.at(-1)!.balanceCents },
            actualPath.at(-1)!,
            explain,
          ),
          low: score(path.low, actualLow, explain),
        });
      }
    }
    const mean = (metric: 'end' | 'low') =>
      rows.length === 0
        ? null
        : roundDivCents(
            rows.reduce((sum, row) => sum + BigInt(Math.abs(row[metric].errorCents)), 0n),
            rows.length,
          );
    const largestMisses = rows
      .flatMap(({ month, accountId, name, end, low }) => [
        { month, accountId, name, metric: 'end' as const, ...end },
        { month, accountId, name, metric: 'low' as const, ...low },
      ])
      .filter((row) => row.errorCents !== 0)
      .sort((a, b) => Math.abs(b.errorCents) - Math.abs(a.errorCents))
      .slice(0, 5);
    return {
      months,
      rows,
      incompleteAccounts,
      meanEndErrorCents: mean('end'),
      meanLowErrorCents: mean('low'),
      largestMisses,
    };
  });
}

function cutoffAfter(day: string): string {
  const next = addDays(day, 1);
  const midnight = new Date(`${next}T00:00:00Z`);
  const offset = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Vienna',
    timeZoneName: 'longOffset',
  })
    .formatToParts(midnight)
    .find(({ type }) => type === 'timeZoneName')!
    .value.slice(3);
  return new Date(`${next}T00:00:00${offset}`).toISOString();
}

export type ForecastBacktest = ReturnType<typeof forecastBacktest>;
