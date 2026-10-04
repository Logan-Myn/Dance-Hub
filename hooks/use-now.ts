"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, refreshed every `intervalMs` (rounded down to it).
 * Server render and hydration use `serverNow` (or null when it isn't
 * given), so markup never differs between server and browser.
 */
export function useNow(intervalMs = 60_000, serverNow?: number): Date | null {
  const ms = useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => serverNow ?? null
  );
  return ms === null ? null : new Date(ms);
}
