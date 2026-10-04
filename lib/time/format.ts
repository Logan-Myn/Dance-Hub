import { addDaysToKey, dateKeyInTz } from "@/lib/calendar-week";

type Instant = Date | string | number;
const toDate = (i: Instant) => (i instanceof Date ? i : new Date(i));

/** "7:00 PM" (en-US) or "19:00" (en-GB) at that moment in `timeZone` (required: the server has its own zone). */
export function formatTimeInZone(instant: Instant, timeZone: string, locale?: string): string {
  return toDate(instant).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
}

/** Short zone name at that moment, for example "CEST" or "CET". */
export function zoneAbbreviation(instant: Instant, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(toDate(instant))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).formatToParts(instant).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

/** True when both zones show the same wall-clock time at that moment. */
export function sameUtcOffset(instant: Instant, a: string, b: string): boolean {
  const d = toDate(instant);
  return offsetMinutes(d, a) === offsetMinutes(d, b);
}

/** "Today", "Tomorrow", or the weekday name, using the calendar day in `timeZone`. */
export function relativeDayWord(instant: Instant, now: Date, timeZone: string, locale?: string): string {
  const d = toDate(instant);
  const key = dateKeyInTz(d, timeZone);
  const today = dateKeyInTz(now, timeZone);
  if (key === today) return "Today";
  if (key === addDaysToKey(today, 1)) return "Tomorrow";
  return d.toLocaleDateString(locale, { weekday: "long", timeZone });
}

/** "in 4 min", "in 3 h 12 min", "in 2 days, 4 h", or "now" once it has started. */
export function startsIn(target: Instant, now: Date): string {
  const ms = toDate(target).getTime() - now.getTime();
  if (ms <= 0) return "now";
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `in ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `in ${d} ${d === 1 ? "day" : "days"}${hh ? `, ${hh} h` : ""}`;
}
