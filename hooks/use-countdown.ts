"use client";

import { startsIn } from "@/lib/time/format";
import { useNow } from "@/hooks/use-now";

/** "in 3 h 12 min" for `target`, kept fresh; null when there is no target. */
export function useCountdown(
  target: Date | string | number | null | undefined,
  intervalMs = 30_000
): string | null {
  const now = useNow(intervalMs);
  if (target == null) return null;
  return startsIn(target, now);
}
