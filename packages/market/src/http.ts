import { MarketError } from './errors';

export interface HttpOptions {
  /** Injected so tests never touch the network. */
  fetch: typeof fetch;
  timeoutMs?: number;
  /** Retries after the first attempt, for network errors, timeouts, 429 and 5xx. */
  retries?: number;
  /** Delay before the first retry; doubles each time. */
  backoffMs?: number;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_USER_AGENT =
  'budget-app/0.1 (+private household finance; market data refresh)';
const MAX_BODY_CHARS = 20_000_000;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** GET `url` as text with timeout, User-Agent and exponential backoff. Errors carry no URL. */
export async function getText(url: string, options: HttpOptions, accept = '*/*'): Promise<string> {
  const { timeoutMs = 15_000, retries = 2, backoffMs = 500, sleep = pause } = options;
  const headers = { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT, accept };
  let last: MarketError = new MarketError('network');
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    try {
      const res = await options.fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429) last = new MarketError('rate_limited');
      else if (res.status >= 500) last = new MarketError('http', String(res.status));
      else if (res.status === 404) throw new MarketError('not_found');
      else if (!res.ok) throw new MarketError('http', String(res.status));
      else {
        const text = await res.text();
        if (text.length > MAX_BODY_CHARS) throw new MarketError('parse', 'response too large');
        return text;
      }
    } catch (error) {
      if (error instanceof MarketError) {
        if (error.kind === 'not_found' || error.kind === 'parse' || error.kind === 'http')
          throw error;
        last = error;
      } else {
        const name = error instanceof Error ? error.name : '';
        last = new MarketError(
          name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
        );
      }
    }
  }
  throw last;
}

/** Politeness toward public sites: at least `minIntervalMs` between two requests of one source. */
export function throttle(
  minIntervalMs: number,
  sleep: (ms: number) => Promise<void> = pause,
  clock: () => number = Date.now,
): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY;
  return async () => {
    const wait = last + minIntervalMs - clock();
    if (wait > 0) await sleep(wait);
    last = clock();
  };
}
