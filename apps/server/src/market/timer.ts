import { ensureBenchmarkInstruments } from '@budget/db';
import {
  lastMarketRun,
  lastSuccessfulMarketRun,
  marketRunsSince,
  recordMarketRun,
  writesHeld,
  type Db,
  type MarketRunRow,
} from '@budget/db';
import { addDays, todayInVienna } from '@budget/domain';
import { errorKind, type MarketSources } from '@budget/market';
import {
  refreshCpi,
  refreshFx,
  refreshPrices,
  type CpiRefreshResult,
  type FxRefreshResult,
  type PriceRefreshResult,
} from './refresh';

export interface MarketRefreshResult {
  prices: PriceRefreshResult;
  fx: FxRefreshResult;
  cpi: CpiRefreshResult;
}

export interface RefreshMarketOptions {
  trigger?: MarketRunRow['trigger'];
  /** Clock for the run log; tests pin it. */
  clock?: () => Date;
}

/** Price rows written by a prices run, all sources. */
export const priceRowsOf = (prices: PriceRefreshResult): number =>
  Object.values(prices.bySource).reduce((n, s) => n + s.rows, 0);

/**
 * The jobs in order: rates first (prices in a foreign currency are valued with them), then prices,
 * then the monthly consumer price index (only read when the stored series is older than a month;
 * a failure there is not part of the run's status). One line
 * goes to the run log (`market_run`): when it ran, what it asked for, counts and error classes.
 * A run is `failed` when it threw or when lookups failed and nothing at all was written, `partial`
 * when some lookups failed, `ok` otherwise. The newest `ok`/`partial` run is the "Stand ... Kurse".
 */
export async function refreshMarket(
  db: Db,
  sources: MarketSources,
  today: string,
  { trigger = 'manual', clock = () => new Date() }: RefreshMarketOptions = {},
): Promise<MarketRefreshResult> {
  const startedAt = clock().toISOString();
  const log = (
    status: MarketRunRow['status'],
    priceRows: number,
    fxRows: number,
    classes: Iterable<string>,
    failedCount: number,
  ) =>
    recordMarketRun(db, {
      trigger,
      startedAt,
      finishedAt: clock().toISOString(),
      asOf: today,
      status,
      priceRows,
      fxRows,
      failedCount,
      errorClasses: [...new Set(classes)].sort().join(',') || null,
    });
  try {
    ensureBenchmarkInstruments(db);
    const fx = await refreshFx(db, sources, { today });
    const prices = await refreshPrices(db, sources, { today });
    const cpi = await refreshCpi(db, sources, { today });
    const failed = [...fx.failed, ...prices.failed];
    const priceRows = priceRowsOf(prices);
    const fxRows = fx.bySource.ecb.rows;
    log(
      failed.length === 0 ? 'ok' : priceRows + fxRows === 0 ? 'failed' : 'partial',
      priceRows,
      fxRows,
      failed.flatMap((f) => f.errors),
      failed.length,
    );
    return { prices, fx, cpi };
  } catch (error) {
    log('failed', 0, 0, [errorKind(error)], 0);
    throw error;
  }
}

const viennaTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Vienna',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Minutes since midnight in Vienna. */
export function viennaMinutes(now: Date): number {
  const [h, m] = viennaTime.format(now).split(':').map(Number);
  return (h as number) * 60 + (m as number);
}

/**
 * The nightly run starts at 02:30 Vienna, inside the 01:00-03:00 window: by then the UTC day of
 * the day before is over for the crypto feeds (summer and winter time) and every exchange has
 * closed.
 */
export const NIGHTLY_AT_MINUTES = 2 * 60 + 30;
/** After a failed run wait this long, and never fail more than `MAX_FAILED_PER_DAY` times a day. */
export const RETRY_AFTER_MS = 30 * 60_000;
export const MAX_FAILED_PER_DAY = 3;

/**
 * Whether a run is due, from the run log alone (so a restart can neither lose nor double it):
 * never succeeded, or the last success is older than yesterday: now (catch-up); last success
 * yesterday: from 02:30 on; already succeeded today: no. After a failed run it backs off.
 */
export function nightlyDue(db: Db, now: Date): boolean {
  const today = todayInVienna(now);
  const ok = lastSuccessfulMarketRun(db);
  const okDay = ok ? todayInVienna(new Date(ok.finishedAt)) : undefined;
  const due =
    okDay === undefined ||
    okDay < addDays(today, -1) ||
    (okDay < today && viennaMinutes(now) >= NIGHTLY_AT_MINUTES);
  if (!due) return false;
  const last = lastMarketRun(db);
  if (last?.status === 'failed' && now.getTime() - Date.parse(last.finishedAt) < RETRY_AFTER_MS)
    return false;
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const failedToday = marketRunsSince(db, since).filter(
    (r) => r.status === 'failed' && todayInVienna(new Date(r.finishedAt)) === today,
  ).length;
  return failedToday < MAX_FAILED_PER_DAY;
}

export interface DailyTimer {
  stop(): void;
  /** One check; exported for tests. Runs the jobs when one is due (see `nightlyDue`). */
  tick(now?: Date): Promise<boolean>;
}

/**
 * In-process nightly refresh (`BUDGET_MARKET_DAILY=1`) until the P4 worker owns scheduling; the
 * worker calls `refreshMarket` / `refreshPrices` / `refreshFx` itself. Checks once a minute, and
 * right at the start with `catchUpOnStart` (a night missed by a restart or an outage is made up
 * then). It asks for the previous day's closes, never the running day, plus the ECB rates, and is
 * idempotent: a second run writes nothing. Failures are logged by class and never stop the server.
 */
export function startDailyMarketTimer(options: {
  db: Db;
  sources: MarketSources;
  log?: (message: string) => void;
  checkEveryMs?: number;
  onTick?: (now: Date) => Promise<void>;
  catchUpOnStart?: boolean;
}): DailyTimer {
  const { db, sources, log = console.log, checkEveryMs = 60_000 } = options;
  let running = false;
  const tick = async (now?: Date): Promise<boolean> => {
    const at = now ?? new Date();
    if (running) return false;
    // An import task owns the write lock: try again at the next check.
    if (writesHeld(db)) return false;
    running = true;
    try {
      await options.onTick?.(at);
      if (!nightlyDue(db, at)) return false;
      const asOf = addDays(todayInVienna(at), -1);
      const { prices, fx, cpi } = await refreshMarket(db, sources, asOf, {
        trigger: 'nightly',
        clock: now ? () => now : () => new Date(),
      });
      log(
        `Market refresh: ${priceRowsOf(prices)} price rows, ` +
          `${fx.bySource.ecb.rows} rate rows, ${prices.failed.length + fx.failed.length} failed, ` +
          `price index ${cpi.skipped ? 'unchanged' : cpi.failed ? `failed (${cpi.failed})` : `${cpi.rows} rows`}`,
      );
    } catch (error) {
      log(`Market refresh failed (${error instanceof Error ? error.name : 'error'})`);
    } finally {
      running = false;
    }
    return true;
  };
  const handle = setInterval(() => void tick(), checkEveryMs);
  handle.unref();
  if (options.catchUpOnStart) setTimeout(() => void tick(), 5_000).unref();
  return { stop: () => clearInterval(handle), tick };
}
