import { isCalendarRange, windowMonths } from '@budget/domain';
import { checkedReportPeriod, reportPeriodSchema } from './report-period';
import {
  addMonths,
  aggregatePayeeAnalysis,
  comparePayeeAnalysis,
  lastDayOfMonth,
  monthOf,
  payeeAnalysisTopFive,
  type PayeeAnalysisPeriod,
} from '@budget/domain';
import { payeeActivity, payeeAvailableMonths, queryBookings } from '@budget/db';
import type { Db } from '@budget/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, readQuery } from './http';

const periodSchema = reportPeriodSchema;
const summaryQuery = z.object({ period: periodSchema.default('1J') });
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Invalid date');
const detailQuery = z.object({
  from: day,
  to: day,
  cursor: z.string().max(256).optional(),
});
const STATUSES = ['pending', 'confirmed', 'reconciled'] as const;

function activity(db: Db, range: { from: string; to: string }) {
  try {
    return payeeActivity(db, range);
  } catch (error) {
    if (error instanceof RangeError && /safe integer cents/.test(error.message))
      throw new ApiError(
        422,
        'calculation_limit',
        'Die Summe überschreitet den sicheren Centbereich.',
      );
    throw error;
  }
}

function calculation<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError && /safe integer cents/.test(error.message))
      throw new ApiError(
        422,
        'calculation_limit',
        'Die Summe überschreitet den sicheren Centbereich.',
      );
    throw error;
  }
}

function periodMonths(all: string[], period: z.infer<typeof periodSchema>, through: string) {
  if (isCalendarRange(period)) return windowMonths(period, all);
  const count =
    period === '1M'
      ? 1
      : period === '3M'
        ? 3
        : period === '1J'
          ? 12
          : period === '3J'
            ? 36
            : Infinity;
  const eligible = all.filter((month) => month <= through);
  if (period === 'YTD')
    return eligible.filter((month) => month.startsWith(`${through.slice(0, 4)}-`));
  return eligible.slice(Number.isFinite(count) ? -count : 0);
}

export function payeeReportRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const { period: rawPeriod } = readQuery(c, summaryQuery);
    const period = checkedReportPeriod(rawPeriod, today());
    const through = isCalendarRange(period) ? monthOf(today()) : addMonths(monthOf(today()), -1);
    const available = payeeAvailableMonths(db, through);
    const selected = periodMonths(available, period, through);
    const selectedRange = selected.length
      ? {
          from: `${selected[0]}-01`,
          to:
            lastDayOfMonth(selected[selected.length - 1]!) < today()
              ? lastDayOfMonth(selected[selected.length - 1]!)
              : today(),
        }
      : null;
    const previousMonths =
      selected.length && available.length >= selected.length * 2
        ? available.slice(
            available.indexOf(selected[0]!) - selected.length,
            available.indexOf(selected[0]!),
          )
        : [];
    const previousRange = previousMonths.length
      ? {
          from: `${previousMonths[0]}-01`,
          to: lastDayOfMonth(previousMonths[previousMonths.length - 1]!),
        }
      : null;
    const allRange = available.length
      ? { from: `${available[0]}-01`, to: lastDayOfMonth(available[available.length - 1]!) }
      : null;
    const source = selectedRange
      ? activity(db, selectedRange)
      : { bookings: [], payees: [], excludedUnclassifiedOutflowCents: 0, statuses: [] };
    const names = new Map(
      source.payees.map((row) => [row.id, `${row.name}${row.deleted ? ' (gelöscht)' : ''}`]),
    );
    const empty: PayeeAnalysisPeriod = {
      totalSpendCents: 0,
      bookingCount: 0,
      averageSpendCents: null,
      rows: [],
    };
    const current = selectedRange
      ? calculation(() => aggregatePayeeAnalysis(source.bookings, names, selectedRange))
      : empty;
    const previousSource = previousRange ? activity(db, previousRange) : null;
    const previousNames = new Map(
      previousSource?.payees.map((row) => [
        row.id,
        `${row.name}${row.deleted ? ' (gelöscht)' : ''}`,
      ]) ?? [],
    );
    const previous =
      previousRange && previousSource
        ? calculation(() =>
            aggregatePayeeAnalysis(previousSource.bookings, previousNames, previousRange),
          )
        : null;
    const compared = calculation(() => comparePayeeAnalysis(current, previous));
    const topFive = calculation(() => payeeAnalysisTopFive(current));
    const rows = compared.rows;
    return c.json({
      period,
      from: selectedRange?.from ?? null,
      to: selectedRange?.to ?? null,
      availableFrom: allRange?.from ?? null,
      availableTo: allRange?.to ?? null,
      availableMonths: available.length,
      previousFrom: previousRange?.from ?? null,
      previousTo: previousRange?.to ?? null,
      previousAvailable: Boolean(previous),
      includedStatuses: STATUSES,
      observedStatuses: source.statuses,
      basis: 'eligible budget-consumption categories',
      totalSpendCents: current.totalSpendCents,
      ...topFive,
      averageSpendCents: current.averageSpendCents,
      bookingCount: current.bookingCount,
      excludedUnclassifiedOutflowCents: source.excludedUnclassifiedOutflowCents,
      rows,
    });
  });
  app.get('/:payee/bookings', (c) => {
    const query = readQuery(c, detailQuery);
    if (query.to < query.from)
      throw new ApiError(400, 'invalid_range', 'Der Zeitraum ist ungültig.');
    const selected = c.req.param('payee') === 'ohne-empfaenger' ? null : c.req.param('payee');
    if (selected !== null && !selected)
      throw new ApiError(400, 'invalid_payee', 'Empfänger fehlt.');
    const source = activity(db, { from: query.from, to: query.to });
    let before: { date: string; id: string } | null = null;
    if (query.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8'),
        ) as Record<string, unknown>;
        if (
          typeof decoded['date'] !== 'string' ||
          !day.safeParse(decoded['date']).success ||
          typeof decoded['id'] !== 'string'
        )
          throw new Error('bad cursor');
        before = { date: decoded['date'], id: decoded['id'] };
      } catch {
        throw new ApiError(400, 'invalid_cursor', 'Der Buchungscursor ist ungültig.');
      }
    }
    const rows = source.bookings.filter(
      (row) =>
        row.payeeId === selected &&
        (!before || row.date < before.date || (row.date === before.date && row.id < before.id)),
    );
    const slice = rows.slice(0, 40);
    const page = queryBookings(db, { ids: slice.map((row) => row.id), limit: 40 });
    const byId = new Map(page.items.map((row) => [row.id, row]));
    return c.json({
      items: slice.flatMap((row) => {
        const booking = byId.get(row.id);
        return booking ? [{ booking, spendCents: row.spendCents, categories: row.categories }] : [];
      }),
      nextCursor:
        rows.length > slice.length
          ? Buffer.from(
              JSON.stringify({
                date: slice[slice.length - 1]!.date,
                id: slice[slice.length - 1]!.id,
              }),
            ).toString('base64url')
          : null,
      total: source.bookings.filter((row) => row.payeeId === selected).length,
    });
  });
  return app;
}
