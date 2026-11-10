import {
  calculateStrategyTrend,
  usEquityScheduledSessions,
  usEquitySessionCompletedAt,
  US_EQUITY_CALENDAR_ID,
  US_EQUITY_CALENDAR_SOURCE_ID,
  type StrategyMonthCalendar,
  type StrategyTrendClose,
  type StrategyTrendSession,
} from '@budget/domain';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { price, priceAudit, security } from '../schema';
import { SIGNAL_INDEX_ID } from './signal-index-id';
import { openStaleValueItem } from './market';
import { strategyConfiguration, type StrategyEvidence } from './portfolio-strategy';
import type { Executor } from './types';

/**
 * The signal series of the trend strategy (#762): completed daily closes of the plain Nasdaq-100
 * price index in USD, stored like any other price (`security` + `price`, no schema of its own).
 * Ariva is the primary source (exchange "Indizes Nasdaq", id 72), Yahoo `^NDX` the fallback; both
 * were compared on 10.11.2026 (docs/portfolio-trend-strategy.md).
 */
export const SIGNAL_INDEX = {
  id: SIGNAL_INDEX_ID,
  name: 'Nasdaq-100 Kursindex (USD), Signalreihe',
  symbol: '^NDX',
  currency: 'USD',
  quoteUrl: 'https://www.ariva.de/us-tech-100-index/kurse/historische-kurse',
  quoteExchange: '72',
  indexId: 'nasdaq-100-usd-price-index:NDX',
  /** First capture reaches this far back (about 290 sessions for the 220 needed plus a margin). */
  backfillDays: 430,
  minSessions: 220,
  /** Sessions kept in the evidence; older stored rows are ignored. */
  maxSessions: 260,
  /** A completed session may be missing this long before the evidence counts as stale. */
  staleAfterHours: 30,
} as const;
/** Micro-units per index point (prices are stored in micro-units). */
const UNITS_PER_POINT = 1_000_000;
const SOURCE_LABEL = { ariva: `ariva:${SIGNAL_INDEX.quoteExchange}`, yfinance: 'yfinance:^NDX' };

export const isSignalInstrument = (securityId: string) => securityId === SIGNAL_INDEX.id;

/** Capture only runs for an explicitly enabled strategy; nothing is activated automatically. */
export function signalCaptureActive(db: Executor): boolean {
  return strategyConfiguration(db).config?.enabled === true;
}

/** Idempotent system instrument; creates nothing while the strategy is not enabled. */
export function ensureSignalInstrument(db: Executor): boolean {
  if (!signalCaptureActive(db)) return false;
  db.insert(security)
    .values({
      id: SIGNAL_INDEX.id,
      name: SIGNAL_INDEX.name,
      symbol: SIGNAL_INDEX.symbol,
      kind: 'other',
      currency: SIGNAL_INDEX.currency,
      allocationIncluded: false,
      quoteUrl: SIGNAL_INDEX.quoteUrl,
      quoteExchange: SIGNAL_INDEX.quoteExchange,
    })
    .onConflictDoNothing()
    .run();
  return true;
}

const unavailable = (reason: string, missingSessions?: string[]): StrategyEvidence => ({
  status: 'unavailable',
  reason,
  ...(missingSessions && missingSessions.length > 0 ? { missingSessions } : {}),
});

const monthOf = (date: string) => date.slice(0, 7);
const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const previousMonth = (month: string) =>
  monthOf(new Date(Date.parse(`${month}-01T00:00:00.000Z`) - 86_400_000).toISOString());

type PriceSource = typeof price.$inferSelect.source;
interface StoredClose {
  date: string;
  priceMicro: number;
  source: PriceSource;
  currency: string;
  completedAt: string;
  observedAt: string | null;
}

/**
 * Evidence from stored closes only. Unavailable (never a guess) when: the instrument is not exactly
 * the configured plain USD price index; a stored close is manual, imported, in another currency or
 * has no recorded observation time (or was observed before its session ended); the stored session
 * dates miss a scheduled session or contain an unscheduled one; fewer than 220 sessions exist; the
 * newest completed session is more than `staleAfterHours` old and still missing; or the holiday
 * table does not cover the period. Rows completed or first observed after `asOf` are ignored, so
 * an as-of evaluation never looks ahead.
 */
export function storedStrategyEvidence(db: Executor, asOf: string): StrategyEvidence {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs) || new Date(asOfMs).toISOString() !== asOf)
    return unavailable('invalid_as_of');
  const instrument = db.select().from(security).where(eq(security.id, SIGNAL_INDEX.id)).get();
  if (!instrument) return unavailable('signal_series_not_captured');
  if (
    instrument.deletedAt !== null ||
    instrument.kind !== 'other' ||
    instrument.symbol !== SIGNAL_INDEX.symbol ||
    instrument.currency !== SIGNAL_INDEX.currency ||
    instrument.quoteUrl !== SIGNAL_INDEX.quoteUrl ||
    instrument.quoteExchange !== SIGNAL_INDEX.quoteExchange ||
    instrument.leverageFactor !== 10 ||
    instrument.allocationIncluded
  )
    return unavailable('signal_instrument_identity_mismatch');

  // First observation (the insert audit row) and any later change per date.
  const observed = new Map<string, string>();
  const changed = new Set<string>();
  for (const row of db
    .select()
    .from(priceAudit)
    .where(eq(priceAudit.securityId, SIGNAL_INDEX.id))
    .all()) {
    if (row.oldPriceMicro !== null) changed.add(row.date);
    else if (!observed.has(row.date) || row.ts < observed.get(row.date)!)
      observed.set(row.date, row.ts);
  }
  const all: StoredClose[] = [];
  for (const row of db
    .select()
    .from(price)
    .where(eq(price.securityId, SIGNAL_INDEX.id))
    .orderBy(asc(price.date))
    .all()) {
    const completedAt = usEquitySessionCompletedAt(row.date);
    const observedAt = observed.get(row.date) ?? null;
    // Not yet completed or not yet known at the as-of time: ignored, never looked ahead.
    if (completedAt > asOf || (observedAt !== null && observedAt > asOf)) continue;
    all.push({
      date: row.date,
      priceMicro: row.priceMicro,
      source: row.source,
      currency: row.currency,
      completedAt,
      observedAt,
    });
  }
  if (all.length === 0) return unavailable('no_completed_sessions');

  // Start at the first session of a month so every month of the list is provably complete.
  let first = Math.max(0, all.length - SIGNAL_INDEX.maxSessions);
  const monthStart = (date: string) => usEquityScheduledSessions(monthOf(date))?.[0] === date;
  while (first < all.length && !monthStart(all[first]!.date)) first++;
  const used = all.slice(first);
  if (used.length < SIGNAL_INDEX.minSessions) return unavailable('insufficient_history');
  // Row-level checks only on the evidence window; older stored rows cannot poison it.
  for (const row of used) {
    if (row.source !== 'ariva' && row.source !== 'yfinance') return unavailable('untrusted_source');
    if (row.currency !== SIGNAL_INDEX.currency) return unavailable('currency_mismatch');
    if (row.observedAt === null) return unavailable('observation_time_missing');
    if (row.observedAt < row.completedAt) return unavailable('observed_before_session_end');
    if (changed.has(row.date)) return unavailable('close_changed_after_capture');
  }
  const latest = used.at(-1)!.date;

  // Veto: stored sessions must equal the published schedule from the first to the newest session.
  const have = new Set(used.map((row) => row.date));
  const missing: string[] = [];
  for (let m = monthOf(used[0]!.date); m <= monthOf(latest); m = nextMonth(m)) {
    const scheduled = usEquityScheduledSessions(m);
    if (!scheduled) return unavailable('holiday_table_out_of_range');
    for (const day of scheduled) if (day <= latest && !have.has(day)) missing.push(day);
    if (used.some((row) => monthOf(row.date) === m && !scheduled.includes(row.date)))
      return unavailable('unscheduled_session_in_evidence');
  }
  if (missing.length > 0) return unavailable('session_gap', missing);

  // Stale: the newest scheduled session that finished more than the grace period ago must be there.
  const limit = new Date(asOfMs - SIGNAL_INDEX.staleAfterHours * 3_600_000).toISOString();
  for (let m = monthOf(asOf), tries = 0; tries < 3; tries++, m = previousMonth(m)) {
    const scheduled = usEquityScheduledSessions(m);
    if (!scheduled) return unavailable('holiday_table_out_of_range');
    const due = scheduled.filter((day) => usEquitySessionCompletedAt(day) <= limit).at(-1);
    if (!due) continue;
    if (due > latest)
      return unavailable(
        'stale',
        scheduled.filter((day) => day > latest && day <= due),
      );
    break;
  }

  const sessions: StrategyTrendSession[] = used.map((row) => ({
    date: row.date,
    completedAt: row.completedAt,
  }));
  const sourceId = [...new Set(used.slice(-SIGNAL_INDEX.minSessions).map((row) => row.source))]
    .map((source) => SOURCE_LABEL[source as 'ariva' | 'yfinance'])
    .sort()
    .join('+');
  const closes: StrategyTrendClose[] = used.map((row) => ({
    sessionDate: row.date,
    closedAt: row.completedAt,
    observedAt: row.observedAt!,
    sourceId,
    indexId: SIGNAL_INDEX.indexId,
    closeUnits: row.priceMicro,
  }));
  const input = {
    asOf,
    latestCompletedSession: latest,
    calendar: { id: US_EQUITY_CALENDAR_ID, verifiedComplete: true as const, sessions },
    source: {
      sourceId,
      indexId: SIGNAL_INDEX.indexId,
      kind: 'price-index' as const,
      currency: 'USD' as const,
      leverage: 1 as const,
      unitsPerPoint: UNITS_PER_POINT,
    },
    closes,
  };
  const trend = calculateStrategyTrend(input);
  if (trend.status === 'unavailable')
    return unavailable(`trend_${trend.reason}`, trend.missingSessions);

  // Month calendars: the newest evidence month and the next one (its sessions are not yet observed).
  const months: StrategyMonthCalendar[] = [];
  for (const month of [monthOf(latest), nextMonth(monthOf(latest))]) {
    const scheduled = usEquityScheduledSessions(month);
    if (!scheduled) return unavailable('holiday_table_out_of_range');
    months.push({
      id: US_EQUITY_CALENDAR_ID,
      sourceId: US_EQUITY_CALENDAR_SOURCE_ID,
      month,
      verifiedComplete: true,
      sessions: scheduled,
    });
  }
  return { status: 'verified', verifiedIndex: 'nasdaq-100-usd-price-index', input, months };
}

/** The provider the server injects; `asOf` is the request time. */
export const storedStrategyEvidenceProvider =
  (db: Executor) =>
  async (asOf: string): Promise<StrategyEvidence> =>
    storedStrategyEvidence(db, asOf);

/** Index points to 2 decimals (10_000 micro), half away from zero. */
export const normaliseIndexClose = (micro: number): number => Math.round(micro / 10_000) * 10_000;

/**
 * Store fetched closes of the signal series (inside the market run's transaction).
 * - A session that is not completed at `nowIso` is never stored (partial same-day bar).
 * - An identical stored close is left alone (no audit noise), so the refetch window heals
 *   omitted days without rewriting anything.
 * - A stored close first observed before its session ended is a poisoned capture and is replaced
 *   (its audit trail is dropped, the new insert is audited).
 * - Any other difference (also a stored close without any audit trail) is a conflict: the stored
 *   close is kept, an audit row and one inbox item per session record the disagreement, and the evidence stays unavailable (`close_changed_after_capture`) until
 *   an operator corrects the stored close. Manual closes are never touched.
 */
export function storeSignalCloses(
  tx: Executor,
  quotes: readonly { date: string; priceMicro: number }[],
  source: 'ariva' | 'yfinance',
  nowIso: string,
): { rows: number; conflicts: number } {
  let rows = 0,
    conflicts = 0;
  for (const raw of quotes) {
    // Index closes are normalised to 2 decimals: Ariva delivers 2, Yahoo full float precision.
    const q = { date: raw.date, priceMicro: normaliseIndexClose(raw.priceMicro) };
    const completedAt = usEquitySessionCompletedAt(q.date);
    if (completedAt > nowIso) continue;
    const key = and(eq(price.securityId, SIGNAL_INDEX.id), eq(price.date, q.date));
    const trailKey = and(eq(priceAudit.securityId, SIGNAL_INDEX.id), eq(priceAudit.date, q.date));
    const existing = tx.select().from(price).where(key).get();
    const audit = (oldPrice: number | null, oldSource: PriceSource | null) =>
      tx
        .insert(priceAudit)
        .values({
          id: randomUUID(),
          securityId: SIGNAL_INDEX.id,
          date: q.date,
          oldPriceMicro: oldPrice,
          newPriceMicro: q.priceMicro,
          oldSource,
          newSource: source,
          ts: nowIso,
        })
        .run();
    if (!existing) {
      tx.insert(price)
        .values({
          securityId: SIGNAL_INDEX.id,
          date: q.date,
          priceMicro: q.priceMicro,
          currency: SIGNAL_INDEX.currency,
          source,
        })
        .run();
      audit(null, null);
      rows++;
      continue;
    }
    if (existing.source === 'manual' || normaliseIndexClose(existing.priceMicro) === q.priceMicro)
      continue;
    const trail = tx.select().from(priceAudit).where(trailKey).all();
    const firstSeen = trail
      .filter((a) => a.oldPriceMicro === null)
      .map((a) => a.ts)
      .sort()[0];
    if (firstSeen !== undefined && firstSeen < completedAt) {
      tx.delete(priceAudit).where(trailKey).run();
      tx.update(price)
        .set({ priceMicro: q.priceMicro, currency: SIGNAL_INDEX.currency, source })
        .where(key)
        .run();
      audit(null, null);
      rows++;
    } else {
      // Counted on every run while unresolved; the audit row is written once.
      if (!trail.some((a) => a.oldPriceMicro !== null && a.newPriceMicro === q.priceMicro))
        audit(existing.priceMicro, existing.source);
      const points = (micro: number) => (micro / 1_000_000).toFixed(2);
      openStaleValueItem(tx, {
        title: 'Signalreihe Nasdaq-100: abweichender Schlusskurs',
        detail:
          `Sitzung ${q.date}: gespeichert ${points(existing.priceMicro)} (${existing.source}), ` +
          `neu abgerufen ${points(q.priceMicro)} (${source}). Der gespeicherte Wert bleibt, ` +
          'die Strategie-Signale sind gesperrt, bis der Eintrag bereinigt ist.',
        refType: 'security',
        // Per session, so the next successful price run does not close it automatically.
        refId: `${SIGNAL_INDEX.id}:${q.date}`,
      });
      conflicts++;
    }
  }
  return { rows, conflicts };
}
