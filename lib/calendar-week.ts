import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Week maths for the live-class calendar.
 *
 * The calendar shows one week, Sunday 00:00 to the next Sunday 00:00, in the
 * viewer's timezone. The client turns that week into UTC instants for the API,
 * and buckets classes by their date and hour in the same timezone, so a class
 * is in exactly one week and on one day for every viewer.
 *
 * Calendar dates are plain 'yyyy-MM-dd' keys. Date arithmetic on them is done
 * in UTC so nothing here depends on the machine's timezone.
 */

/** Half-open range of instants: start <= t < end. */
export interface UtcRange {
  start: Date;
  end: Date;
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const INSTANT_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

const DAY_MS = 24 * 60 * 60 * 1000;

function keyToUtcDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** The calendar date of an instant, as seen in `tz`. */
export function dateKeyInTz(instant: Date | string, tz: string): string {
  return formatInTimeZone(new Date(instant), tz, 'yyyy-MM-dd');
}

/** The hour (0-23) of an instant, as seen in `tz`. */
export function hourInTz(instant: Date | string, tz: string): number {
  return Number(formatInTimeZone(new Date(instant), tz, 'H'));
}

export function addDaysToKey(key: string, days: number): string {
  const d = keyToUtcDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOfKey(key: string): number {
  return keyToUtcDate(key).getUTCDay();
}

/** Format a calendar date (e.g. 'EEE', 'MMM d') without shifting it. */
export function formatDayKey(key: string, fmt: string): string {
  return formatInTimeZone(keyToUtcDate(key), 'UTC', fmt);
}

/**
 * The Sunday that starts the week containing the calendar date `dayKey`,
 * moved by `weekOffset` whole weeks. For "this week" pass today's date in the
 * viewer's timezone: `weekStartKey(dateKeyInTz(now, tz))`.
 */
export function weekStartKey(dayKey: string, weekOffset = 0): string {
  return addDaysToKey(dayKey, -weekdayOfKey(dayKey) + weekOffset * 7);
}

export function weekDayKeys(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(startKey, i));
}

/** The instant of a wall-clock time on a calendar date in `tz`. */
export function zonedTimeToUtc(dayKey: string, hour: number, minute: number, tz: string): Date {
  return fromZonedTime(`${dayKey}T${pad2(hour)}:${pad2(minute)}:00`, tz);
}

/**
 * Where a new class starts when the teacher didn't click a slot: the next
 * half hour after `now` in `tz`, moved to `dayKey` when that day is later.
 * An earlier day (or none) keeps the next half hour, so it's never in the past.
 */
export function defaultClassStart(dayKey: string | null, now: Date, tz: string): Date {
  const [hour, minute] = formatInTimeZone(now, tz, 'H:m').split(':').map(Number);
  const slot = Math.floor((hour * 60 + minute) / 30) * 30 + 30;
  let key = dateKeyInTz(now, tz);
  if (slot === 24 * 60) key = addDaysToKey(key, 1);
  if (dayKey && dayKey > key) key = dayKey;
  return zonedTimeToUtc(key, Math.floor(slot / 60) % 24, slot % 60, tz);
}

/**
 * The first instant of a calendar date in `tz`. Usually local midnight, but
 * where the clocks jump forward at midnight (e.g. America/Santiago,
 * Asia/Beirut) midnight doesn't exist and the day starts at 01:00.
 */
function startOfDayUtc(dayKey: string, tz: string): Date {
  const midnight = zonedTimeToUtc(dayKey, 0, 0, tz);
  if (dateKeyInTz(midnight, tz) === dayKey) return midnight;
  // Midnight resolved to the evening before: search forward (to the
  // minute, within 3 hours) for the moment the date turns.
  let lo = 0;
  let hi = 3 * 60;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dateKeyInTz(new Date(midnight.getTime() + mid * 60_000), tz) === dayKey) hi = mid;
    else lo = mid;
  }
  return new Date(midnight.getTime() + hi * 60_000);
}

/** The week starting on `startKey` (a Sunday) in `tz`, as UTC instants. */
export function weekRangeUtc(startKey: string, tz: string): UtcRange {
  return {
    start: startOfDayUtc(startKey, tz),
    end: startOfDayUtc(addDaysToKey(startKey, 7), tz),
  };
}

export function isInRange(instant: Date | string, range: UtcRange): boolean {
  const t = new Date(instant).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

export function rangeContains(outer: UtcRange, inner: UtcRange): boolean {
  return outer.start.getTime() <= inner.start.getTime() && inner.end.getTime() <= outer.end.getTime();
}

/**
 * What the server pre-fetches for the calendar page. It can't know the
 * viewer's timezone, but any viewer's current week contains `now` and lasts
 * at most 7 days and an hour, so `now` +/- 8 days covers it everywhere.
 */
export function initialCalendarRange(now: Date): UtcRange {
  return {
    start: new Date(now.getTime() - 8 * DAY_MS),
    end: new Date(now.getTime() + 8 * DAY_MS),
  };
}

function parseBound(value: string, isEnd: boolean): Date | null {
  const dateOnly = DATE_KEY.exec(value);
  if (dateOnly) {
    // Older clients sent local 'yyyy-MM-dd' dates with an inclusive end day.
    const d = keyToUtcDate(value);
    if (d.toISOString().slice(0, 10) !== value) return null;
    return isEnd ? new Date(d.getTime() + DAY_MS) : d;
  }
  if (!INSTANT_WITH_OFFSET.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse the calendar API's `start` / `end` query params. The calendar sends
 * UTC instants; an instant without an offset is ambiguous and rejected.
 * Returns null when either bound is invalid or the range is empty.
 */
export function parseRangeParams(start: string, end: string): UtcRange | null {
  const s = parseBound(start, false);
  const e = parseBound(end, true);
  if (!s || !e || s.getTime() >= e.getTime()) return null;
  return { start: s, end: e };
}
