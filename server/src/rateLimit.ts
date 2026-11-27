/** Fixed-window attempt counter, in memory. Slows password guessing per address and username. */
export class RateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Seconds to wait before another attempt is allowed; 0 when allowed now. */
  retryAfter(key: string): number {
    const entry = this.attempts.get(key);
    const now = this.now();
    if (!entry || entry.resetAt <= now || entry.count < this.limit) return 0;
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  /** Counts one attempt (a failure, or for sign-ups every request). */
  record(key: string) {
    const now = this.now();
    const entry = this.attempts.get(key);
    if (entry && entry.resetAt > now) entry.count++;
    else {
      if (this.attempts.size > 10_000) this.prune(now);
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    }
  }

  /** Forget a key, e.g. after a successful sign-in. */
  reset(key: string) {
    this.attempts.delete(key);
  }

  private prune(now: number) {
    for (const [key, entry] of this.attempts) if (entry.resetAt <= now) this.attempts.delete(key);
  }
}
