"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The viewer's time zone: their saved one when they have it (same on server
 * and browser), otherwise UTC on the server and the browser's zone after
 * hydration.
 */
export function useViewerTimeZone(saved: string | null | undefined): string {
  return useSyncExternalStore(
    subscribe,
    () => saved || Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => saved || "UTC"
  );
}
