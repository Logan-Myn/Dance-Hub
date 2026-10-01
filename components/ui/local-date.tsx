"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format-date";

const subscribe = () => () => {};

/**
 * A date that is safe to server-render. The server doesn't know the viewer's
 * time zone, so the server render and the hydration pass both use UTC, then
 * the browser switches to its own zone.
 */
export function LocalDate({ value }: { value: string | Date }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={date.toISOString()}>
      {formatDate(date, hydrated ? undefined : "UTC")}
    </time>
  );
}
