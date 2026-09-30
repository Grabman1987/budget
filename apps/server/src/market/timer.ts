import type { Db } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import type { MarketSources } from '@budget/market';
import { refreshFx, refreshPrices } from './refresh';

/** Both jobs in order: rates first (prices in a foreign currency are valued with them). */
export async function refreshMarket(db: Db, sources: MarketSources, today: string) {
  const fx = await refreshFx(db, sources, { today });
  const prices = await refreshPrices(db, sources, { today });
  return { prices, fx };
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

export const DAILY_AT_MINUTES = 22 * 60 + 30;

export interface DailyTimer {
  stop(): void;
  /** One check; exported for tests. Runs the jobs when 22:30 (Vienna) has passed today. */
  tick(now?: Date): Promise<boolean>;
}

/**
 * In-process daily refresh at 22:30 Vienna (`BUDGET_MARKET_DAILY=1`), until the P4 worker owns
 * scheduling; the worker calls `refreshMarket` / `refreshPrices` / `refreshFx` itself. Checks once
 * a minute, runs at most once per Vienna day (a restart after 22:30 runs once more, which is
 * harmless: the jobs are idempotent). Failures are logged by class and never stop the server.
 */
export function startDailyMarketTimer(options: {
  db: Db;
  sources: MarketSources;
  log?: (message: string) => void;
  checkEveryMs?: number;
}): DailyTimer {
  const { db, sources, log = console.log, checkEveryMs = 60_000 } = options;
  let lastDay: string | undefined;
  let running = false;
  const tick = async (now = new Date()): Promise<boolean> => {
    const today = todayInVienna(now);
    if (running || lastDay === today || viennaMinutes(now) < DAILY_AT_MINUTES) return false;
    running = true;
    lastDay = today;
    try {
      const { prices, fx } = await refreshMarket(db, sources, today);
      log(
        `Market refresh: ${prices.bySource.yfinance.rows + prices.bySource.ariva.rows} price rows, ` +
          `${fx.bySource.ecb.rows} rate rows, ${prices.failed.length + fx.failed.length} failed`,
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
  return { stop: () => clearInterval(handle), tick };
}
