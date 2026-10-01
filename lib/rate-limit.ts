/**
 * Fixed-window rate limiter kept in memory. The app runs as one long-lived
 * Node process (pm2), so a module-level limiter sees every request. It does
 * not share state across processes or survive a restart, which is fine for
 * slowing down guessing and floods.
 *
 *   const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
 *   if (!limiter.check(userId)) return 429;
 */
export interface RateLimiter {
  /** Counts one attempt for `key`; false once the key is over its limit. */
  check(key: string): boolean;
  /** Number of keys currently tracked. */
  size(): number;
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweepAt = Date.now() + windowMs;

  return {
    check(key: string): boolean {
      const now = Date.now();
      // Drop expired windows at most once per window, so keys that stop
      // coming back don't pile up.
      if (now >= nextSweepAt) {
        for (const [k, w] of windows) {
          if (w.resetAt <= now) windows.delete(k);
        }
        nextSweepAt = now + windowMs;
      }

      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
    size: () => windows.size,
  };
}
