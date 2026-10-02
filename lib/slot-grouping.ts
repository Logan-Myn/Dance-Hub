import type { TeacherAvailabilitySlot } from '@/types/private-lessons';
import { formatInTz, naiveToUtc } from '@/lib/timezone';

/** Returns a new Date with `days` added. Does not mutate input. */
export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Formats a Date as YYYY-MM-DD using its local calendar components.
 * Avoids the UTC-shift bug of `toISOString().split('T')[0]` for times near midnight.
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns 7 YYYY-MM-DD strings starting from `start`. */
export function getWeekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toDateString(addDays(start, i)));
}

/** The real start instant of a slot stored as a date and time in the teacher's timezone. */
export function slotStartUtc(slot: TeacherAvailabilitySlot): Date {
  return naiveToUtc(`${slot.availability_date}T${slot.start_time}`, slot.teacher_timezone ?? 'UTC');
}

/**
 * Midnight (browser-local Date) of today's calendar date in `tz`, so the
 * week strip starts on the student's today rather than the browser's.
 */
export function todayInTz(tz: string): Date {
  return new Date(`${formatInTz(new Date(), tz, 'yyyy-MM-dd')}T00:00:00`);
}

/**
 * Groups slots by date. With `tz`, a slot goes under the date its start falls
 * on in that timezone (the student's), and each day is sorted by start
 * instant. Without it, slots are grouped by the teacher-local
 * `availability_date` and sorted by `start_time`.
 */
export function groupSlotsByDate(
  slots: TeacherAvailabilitySlot[],
  tz?: string
): Map<string, TeacherAvailabilitySlot[]> {
  const map = new Map<string, TeacherAvailabilitySlot[]>();
  for (const slot of slots) {
    const key = tz ? formatInTz(slotStartUtc(slot), tz, 'yyyy-MM-dd') : slot.availability_date;
    const list = map.get(key) ?? [];
    list.push(slot);
    map.set(key, list);
  }
  for (const list of map.values()) {
    if (tz) {
      list.sort((a, b) => slotStartUtc(a).getTime() - slotStartUtc(b).getTime());
    } else {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
  }
  return map;
}

/**
 * Searches forward in 7-day windows for the first window containing at least
 * one slot. Returns the start Date of that window, or null if no slot exists
 * within `horizonDays` from `startFrom`. `tz` as for groupSlotsByDate.
 */
export function findFirstWeekWithSlots(
  slots: TeacherAvailabilitySlot[],
  startFrom: Date,
  horizonDays: number,
  tz?: string
): Date | null {
  if (slots.length === 0) return null;
  const grouped = groupSlotsByDate(slots, tz);
  for (let offset = 0; offset < horizonDays; offset += 7) {
    const windowStart = addDays(startFrom, offset);
    for (const date of getWeekDays(windowStart)) {
      if (grouped.has(date)) return windowStart;
    }
  }
  return null;
}

/**
 * Teacher-local date range to request so that every slot starting within the
 * student's next `horizonDays` days is included. Availability is stored by
 * the teacher's date, which is at most one day off the student's date.
 */
export function availabilityFetchRange(
  studentTz: string,
  horizonDays: number
): { startDate: string; endDate: string } {
  const today = todayInTz(studentTz);
  return {
    startDate: toDateString(addDays(today, -1)),
    endDate: toDateString(addDays(today, horizonDays + 1)),
  };
}
