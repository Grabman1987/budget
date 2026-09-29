/** In-memory sliding-window rate limiter (one Fly machine, so process memory is enough). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Record an attempt. Returns false when the key is over the limit (the attempt is still counted). */
  allow(key: string, now = Date.now()): boolean {
    const start = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > start);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return list.length <= this.limit;
  }

  /** Attempts of the key in the current window. */
  count(key: string, now = Date.now()): number {
    return (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs).length;
  }

  private prune(now: number): void {
    for (const [key, list] of this.hits) {
      if (list.every((t) => t <= now - this.windowMs)) this.hits.delete(key);
    }
  }
}
