import type { AuthEventKind, AuthStore } from './store';

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface EventLogOptions {
  /** One row per kind and client within this window; repeats only raise its counter. */
  windowMs?: number;
  /** New rejection rows per window across all clients; beyond it rows merge per kind only. */
  maxRowsPerWindow?: number;
  /** Counters of merged rows are written back at most this often. */
  flushMs?: number;
  /** Keys held in memory. */
  maxKeys?: number;
  /** Rows older than this are pruned. */
  retentionDays?: number;
}

interface Bucket {
  id: string;
  windowEnd: number;
  count: number;
  written: number;
  lastAt: number;
  lastFlush: number;
}

/**
 * Writes `auth_event`. Normal events (a login, a new passkey) are rare and need a credential, so
 * they are written as they happen. Rejections anyone on the internet can trigger (foreign
 * origin, rate limit, failed login) go through `reject`, which keeps the table bounded:
 *
 * - one row per kind and client (IP hash) per 10 minutes, repeats only raise its `count`;
 * - at most `maxRowsPerWindow` such rows per window overall; beyond that, one shared row per kind
 *   without IP hash, so rotating addresses cannot add rows either;
 * - counters are written back at most once a minute (and by `flush`), not per request.
 *
 * Worst case under a permanent flood: (12 + kinds) rows per 10 minutes, about 2,500 a day, and
 * `prune` removes rows after 180 days.
 */
export class AuthEventLog {
  private buckets = new Map<string, Bucket>();
  private windowStart = 0;
  private rowsInWindow = 0;
  private readonly windowMs: number;
  private readonly maxRowsPerWindow: number;
  private readonly flushMs: number;
  private readonly maxKeys: number;
  readonly retentionDays: number;

  constructor(
    private readonly store: AuthStore,
    options: EventLogOptions = {},
  ) {
    this.windowMs = options.windowMs ?? 10 * MINUTE;
    this.maxRowsPerWindow = options.maxRowsPerWindow ?? 12;
    this.flushMs = options.flushMs ?? MINUTE;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.retentionDays = options.retentionDays ?? 180;
  }

  /** A normal event, written straight away. */
  write(
    kind: AuthEventKind,
    now: Date,
    extra: { passkeyId?: string | null; ipHash?: string | null; detail?: string } = {},
  ): void {
    this.store.logEvent(kind, now, extra);
  }

  /** A rejection: merged per kind and client, globally capped (see the class comment). */
  reject(
    kind: AuthEventKind,
    now: Date,
    extra: { passkeyId?: string | null; ipHash: string; detail?: string },
  ): void {
    const t = now.getTime();
    const own = this.live(`${kind}|${extra.ipHash}`, t);
    if (own) return this.bump(own, t);

    if (t - this.windowStart >= this.windowMs) {
      this.windowStart = t;
      this.rowsInWindow = 0;
    }
    if (this.rowsInWindow < this.maxRowsPerWindow) {
      this.rowsInWindow += 1;
      this.open(`${kind}|${extra.ipHash}`, t, this.store.logEvent(kind, now, extra));
      return;
    }
    // Over the cap: count into one shared row per kind, without IP hash or detail.
    const shared = this.live(`${kind}|*`, t);
    if (shared) return this.bump(shared, t);
    this.open(`${kind}|*`, t, this.store.logEvent(kind, now, { detail: 'merged: many clients' }));
  }

  /** Write back pending counters (every minute and on shutdown). */
  flush(now: Date): void {
    // While an import task writes, the counters stay in memory until the next flush.
    if (this.store.writesHeld) return;
    const t = now.getTime();
    for (const [key, bucket] of this.buckets) {
      this.persist(bucket);
      if (t >= bucket.windowEnd) this.buckets.delete(key);
    }
  }

  /** Flush counters and delete rows older than the retention (at start and daily). */
  prune(now: Date): number {
    if (this.store.writesHeld) return 0;
    this.flush(now);
    return this.store.pruneEvents(new Date(now.getTime() - this.retentionDays * DAY));
  }

  private live(key: string, t: number): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (!bucket) return undefined;
    if (t < bucket.windowEnd) return bucket;
    this.persist(bucket);
    this.buckets.delete(key);
    return undefined;
  }

  private open(key: string, t: number, id: string): void {
    if (this.buckets.size >= this.maxKeys) {
      // Oldest first (insertion order); its counter is saved before it goes.
      const [oldestKey, oldest] = this.buckets.entries().next().value as [string, Bucket];
      this.persist(oldest);
      this.buckets.delete(oldestKey);
    }
    this.buckets.set(key, {
      id,
      windowEnd: t + this.windowMs,
      count: 1,
      written: 1,
      lastAt: t,
      lastFlush: t,
    });
  }

  private bump(bucket: Bucket, t: number): void {
    bucket.count += 1;
    bucket.lastAt = t;
    if (t - bucket.lastFlush >= this.flushMs) this.persist(bucket);
  }

  private persist(bucket: Bucket): void {
    bucket.lastFlush = bucket.lastAt;
    if (bucket.count === bucket.written) return;
    this.store.setEventCount(bucket.id, bucket.count, new Date(bucket.lastAt));
    bucket.written = bucket.count;
  }
}
