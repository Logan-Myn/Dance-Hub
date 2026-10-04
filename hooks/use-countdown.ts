"use client";

import { startsIn } from "@/lib/time/format";
import { useNow } from "@/hooks/use-now";

/**
 * "in 3 h 12 min" for `target`, kept fresh. Null when there is no target,
 * and during server render unless `serverNow` is given.
 */
export function useCountdown(
  target: Date | string | number | null | undefined,
  intervalMs = 30_000,
  serverNow?: number
): string | null {
  const now = useNow(intervalMs, serverNow);
  if (target == null || now === null) return null;
  return startsIn(target, now);
}
