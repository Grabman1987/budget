import {
  daysBetween, ExchangeRateUnavailableError, sumValuationCents, ValuationLimitError,
  worstQuality, type DailyValuationObservation, type ValuationQuality,
} from '@budget/domain';
import { and, asc, eq, isNull, lte, min } from 'drizzle-orm';
import { account, holding, security, trade } from '../schema';
import { EntityNotFoundError } from './errors';
import { portfolioPositions, type PortfolioPosition } from './portfolio-positions';
import { valuationSeries } from './portfolio';
import type { Executor } from './types';

export const INSTRUMENT_HISTORY_DAY_LIMIT = 20_000;
export class InstrumentHistoryRangeError extends RangeError {
  override readonly name = 'InstrumentHistoryRangeError';
}
export interface InstrumentHistoryPoint {
  date: string;
  unitsE8: number;
  valueCents: number | null;
  quality: ValuationQuality;
  missing: 'price' | 'fx' | null;
  observations: Readonly<DailyValuationObservation>[];
}
export interface InstrumentHistory {
  securityId: string;
  from: string;
  to: string;
  unit: 'EUR';
  position: PortfolioPosition | null;
  costMethod: 'average' | 'fifo';
  points: InstrumentHistoryPoint[];
  events: Array<{
    id: string; date: string; kind: typeof trade.$inferSelect.kind;
    accountId: string; unitsE8: number; amountCents: number; currency: string;
  }>;
  unavailable: 'missing_fx' | 'calculation_limit' | null;
}

/** One existing daily valuation read; no repeated as-of queries or second pricing/cost engine. */
export function instrumentHistory(db: Executor, securityId: string, window: { from?: string; to: string }): InstrumentHistory {
  if (!db.select({ id: security.id }).from(security).where(and(eq(security.id, securityId), isNull(security.deletedAt))).get())
    throw new EntityNotFoundError('security', securityId);
  const accountIds = db.select({ id: account.id }).from(account).where(isNull(account.deletedAt)).all().map((a) => a.id);
  const firstHolding = db.select({ date: min(holding.asOf) }).from(holding)
    .innerJoin(account, eq(holding.accountId, account.id))
    .where(and(eq(holding.securityId, securityId), isNull(holding.deletedAt), isNull(account.deletedAt), lte(holding.asOf, window.to))).get()?.date;
  const firstTrade = db.select({ date: min(trade.date) }).from(trade)
    .innerJoin(account, eq(trade.accountId, account.id))
    .where(and(eq(trade.securityId, securityId), isNull(trade.deletedAt), isNull(account.deletedAt), lte(trade.date, window.to))).get()?.date;
  const earliest = [firstHolding, firstTrade].filter((d): d is string => d !== null && d !== undefined).sort()[0];
  const from = window.from ?? earliest ?? window.to;
  if (from > window.to || daysBetween(from, window.to) + 1 > INSTRUMENT_HISTORY_DAY_LIMIT)
    throw new InstrumentHistoryRangeError('Der Instrumentverlauf umfasst höchstens 20.000 Tage. Bitte Zeitraum eingrenzen.');
  const positions = portfolioPositions(db, window.to);
  const canonical = positions.positions.find((p) => p.securityId === securityId) ?? null;
  const safe = (value: number | null) => value === null || Number.isSafeInteger(value);
  const positionSafe = !canonical || ([canonical.unitsE8, canonical.valueCents, canonical.costCents,
    canonical.gainCents, canonical.gainBp, canonical.shareBp].every(safe) &&
    canonical.accounts.every((a) => [a.unitsE8, a.valueCents, a.costCents, a.gainCents].every(safe)));
  const position = positionSafe ? canonical : null;
  const events = db.select({ id: trade.id, date: trade.date, kind: trade.kind, accountId: trade.accountId,
    unitsE8: trade.unitsE8, amountCents: trade.amountCents, currency: account.currency }).from(trade)
    .innerJoin(account, eq(trade.accountId, account.id))
    .where(and(eq(trade.securityId, securityId), isNull(trade.deletedAt), isNull(account.deletedAt), lte(trade.date, window.to)))
    .orderBy(asc(trade.date), asc(trade.id)).all().filter((t) => t.date >= from);
  const base = { securityId, from, to: window.to, unit: 'EUR' as const,
    position, costMethod: positions.costMethod, events };
  if (!positionSafe) return { ...base, points: [], unavailable: 'calculation_limit' };
  const observations = new Map<string, Readonly<DailyValuationObservation>[]>();
  try {
    const series = valuationSeries(db, { from, to: window.to, securities: [securityId], accounts: accountIds }, {
      estimate: true,
      observe: (fact) => {
        const entries = observations.get(fact.day) ?? [];
        entries.push(fact); observations.set(fact.day, entries);
      },
    });
    const points = series.days.map((date, i): InstrumentHistoryPoint => {
      const facts = observations.get(date) ?? [];
      const missing = facts.some((f) => f.fx.kind === 'missing' || f.missing === 'fx') ? 'fx'
        : facts.some((f) => f.quality === 'missing') ? 'price' : null;
      return {
        date, unitsE8: sumValuationCents(series.positions.map((p) => p.unitsE8[i]!)),
        valueCents: missing ? null : sumValuationCents(series.positions.map((p) => p.valueCents[i]!)),
        quality: facts.reduce<ValuationQuality>((quality, f) => worstQuality(quality, f.quality), 'exact'),
        missing, observations: facts,
      };
    });
    const last = points.at(-1);
    const endpoint = position ? position.valueCents : 0;
    if (last && last.valueCents !== endpoint)
      throw new Error('Instrument history and canonical dated position disagree');
    if (last && last.unitsE8 !== (position?.unitsE8 ?? 0))
      throw new Error('Instrument history and canonical dated units disagree');
    return { ...base, points, unavailable: null };
  } catch (error) {
    if (error instanceof ExchangeRateUnavailableError) return { ...base, points: [], unavailable: 'missing_fx' };
    if (error instanceof ValuationLimitError && error.boundary === 'result')
      return { ...base, points: [], unavailable: 'calculation_limit' };
    throw error;
  }
}
