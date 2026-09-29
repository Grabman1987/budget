import { isIPv4, isIPv6 } from 'node:net';

export interface RateLimiterOptions {
  /** Most keys kept in memory; the least recently seen key is evicted beyond it. */
  maxKeys?: number;
  /**
   * Ceiling across all keys per window (fixed window). Protects against guessing from many
   * addresses at once. Only attempts a key was allowed make count towards it.
   */
  globalLimit?: number;
}

export interface RateDecision {
  allowed: boolean;
  /** True exactly once per blocking period of a key (or of the global ceiling): log this one. */
  firstBreach: boolean;
}

interface Entry {
  /** The newest hits in the window, oldest first; never more than `limit + 1`. */
  hits: number[];
  blocked: boolean;
}

/**
 * In-memory sliding-window rate limiter (one Fly machine, so process memory is enough).
 * Memory is bounded: at most `maxKeys` keys with at most `limit + 1` timestamps each.
 */
export class RateLimiter {
  private entries = new Map<string, Entry>();
  private globalStart = 0;
  private globalCount = 0;
  private globalBlocked = false;
  readonly maxKeys: number;
  readonly globalLimit: number;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    options: RateLimiterOptions = {},
  ) {
    this.maxKeys = options.maxKeys ?? 10_000;
    this.globalLimit = options.globalLimit ?? Number.POSITIVE_INFINITY;
  }

  /** Record an attempt. Over the limit the attempt is still counted, so hammering keeps the key blocked. */
  check(key: string, now = Date.now()): RateDecision {
    const start = now - this.windowMs;
    this.dropStale(start);
    let entry = this.entries.get(key);
    if (entry) {
      // Re-insert: the map stays ordered by last hit, so the first key is the eviction candidate.
      this.entries.delete(key);
    } else {
      entry = { hits: [], blocked: false };
      while (this.entries.size >= this.maxKeys) {
        const oldest = this.entries.keys().next().value as string;
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, entry);
    while (entry.hits.length > 0 && (entry.hits[0] as number) <= start) entry.hits.shift();
    entry.hits.push(now);
    if (entry.hits.length > this.limit + 1) entry.hits.shift();

    if (entry.hits.length > this.limit) {
      const firstBreach = !entry.blocked;
      entry.blocked = true;
      return { allowed: false, firstBreach };
    }
    entry.blocked = false;
    return this.checkGlobal(now);
  }

  /** Same as `check`, boolean only. */
  allow(key: string, now = Date.now()): boolean {
    return this.check(key, now).allowed;
  }

  /** Attempts of the key in the current window (at most `limit + 1`). */
  count(key: string, now = Date.now()): number {
    return (this.entries.get(key)?.hits ?? []).filter((t) => t > now - this.windowMs).length;
  }

  /** Number of keys held in memory. */
  get size(): number {
    return this.entries.size;
  }

  private checkGlobal(now: number): RateDecision {
    if (now - this.globalStart >= this.windowMs) {
      this.globalStart = now;
      this.globalCount = 0;
      this.globalBlocked = false;
    }
    this.globalCount += 1;
    if (this.globalCount <= this.globalLimit) return { allowed: true, firstBreach: false };
    const firstBreach = !this.globalBlocked;
    this.globalBlocked = true;
    return { allowed: false, firstBreach };
  }

  /** Drop keys whose newest hit left the window; they sit at the front, so this stops early. */
  private dropStale(start: number): void {
    for (const [key, entry] of this.entries) {
      const newest = entry.hits[entry.hits.length - 1];
      if (newest !== undefined && newest > start) break;
      this.entries.delete(key);
    }
  }
}

/**
 * Rate-limit key of a client address. IPv6 is keyed by its /64 prefix (one customer network, and
 * a host can rotate through the rest of it); IPv4 and IPv4-mapped IPv6 by the full address.
 */
export function clientKey(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1] as string;
  if (isIPv4(address)) return address;
  const bare = address.replace(/%.*$/, '');
  if (!isIPv6(bare)) return address;
  return `${expandIPv6(bare).slice(0, 4).join(':')}::/64`;
}

/** The eight hextets of an IPv6 address, lower case without leading zeros. */
function expandIPv6(address: string): string[] {
  let text = address.toLowerCase();
  // An embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) becomes two hextets.
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right].map((h) => parseInt(h, 16).toString(16));
}
