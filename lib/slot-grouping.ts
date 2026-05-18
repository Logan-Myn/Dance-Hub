import type { TeacherAvailabilitySlot } from '@/types/private-lessons';

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

/**
 * Groups slots by `availability_date`. Slots within a day are sorted ascending
 * by `start_time`.
 */
export function groupSlotsByDate(
  slots: TeacherAvailabilitySlot[]
): Map<string, TeacherAvailabilitySlot[]> {
  const map = new Map<string, TeacherAvailabilitySlot[]>();
  for (const slot of slots) {
    const list = map.get(slot.availability_date) ?? [];
    list.push(slot);
    map.set(slot.availability_date, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return map;
}

/**
 * Searches forward in 7-day windows for the first window containing at least
 * one slot. Returns the start Date of that window, or null if no slot exists
 * within `horizonDays` from `startFrom`.
 */
export function findFirstWeekWithSlots(
  slots: TeacherAvailabilitySlot[],
  startFrom: Date,
  horizonDays: number
): Date | null {
  if (slots.length === 0) return null;
  const grouped = groupSlotsByDate(slots);
  for (let offset = 0; offset < horizonDays; offset += 7) {
    const windowStart = addDays(startFrom, offset);
    for (const date of getWeekDays(windowStart)) {
      if (grouped.has(date)) return windowStart;
    }
  }
  return null;
}
