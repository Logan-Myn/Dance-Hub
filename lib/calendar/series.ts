import { formatInTimeZone } from "date-fns-tz";
import { addDaysToKey, dateKeyInTz, zonedTimeToUtc } from "@/lib/calendar-week";

export const MAX_REPEAT_WEEKS = 12;

/**
 * Start instants for a class repeated weekly, keeping the same wall-clock
 * time in `timeZone` (so 19:00 stays 19:00 across a daylight saving change).
 */
export function weeklyStarts(first: Date | string, timeZone: string, weeks: number): Date[] {
  const start = new Date(first);
  const n = Math.max(1, Math.min(MAX_REPEAT_WEEKS, Math.floor(weeks)));
  const day = dateKeyInTz(start, timeZone);
  const [h, m] = formatInTimeZone(start, timeZone, "H:m").split(":").map(Number);
  return Array.from({ length: n }, (_, k) => zonedTimeToUtc(addDaysToKey(day, 7 * k), h, m, timeZone));
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
