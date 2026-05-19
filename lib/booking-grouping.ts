import { toZonedTime } from 'date-fns-tz';
import { isSameDay, endOfWeek, startOfWeek } from 'date-fns';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

export interface BookingGroup {
  today: LessonBookingWithDetails[];
  thisWeek: LessonBookingWithDetails[];
  upcoming: LessonBookingWithDetails[];
  past: LessonBookingWithDetails[];
  canceled: LessonBookingWithDetails[];
}

const GRACE_MS = 15 * 60_000;

function hasEnded(b: LessonBookingWithDetails, now: Date): boolean {
  if (b.lesson_status === 'completed') return true;
  if (!b.scheduled_at) return false;
  const start = new Date(b.scheduled_at).getTime();
  const end = start + (b.duration_minutes ?? 60) * 60_000;
  return now.getTime() > end + GRACE_MS;
}

function compareScheduled(
  a: LessonBookingWithDetails,
  b: LessonBookingWithDetails,
): number {
  if (!a.scheduled_at) return 1;
  if (!b.scheduled_at) return -1;
  return (
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
}

export function groupBookings(
  bookings: LessonBookingWithDetails[],
  now: Date,
  tz: string,
): BookingGroup {
  const group: BookingGroup = {
    today: [],
    thisWeek: [],
    upcoming: [],
    past: [],
    canceled: [],
  };

  const zonedNow = toZonedTime(now, tz);
  const weekStart = startOfWeek(zonedNow, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(zonedNow, { weekStartsOn: 1 });

  for (const b of bookings) {
    if (b.lesson_status === 'canceled') {
      group.canceled.push(b);
      continue;
    }
    if (hasEnded(b, now)) {
      group.past.push(b);
      continue;
    }
    if (!b.scheduled_at) {
      group.upcoming.push(b);
      continue;
    }
    const zoned = toZonedTime(new Date(b.scheduled_at), tz);
    if (isSameDay(zoned, zonedNow)) {
      group.today.push(b);
    } else if (zoned >= weekStart && zoned <= weekEnd) {
      group.thisWeek.push(b);
    } else if (zoned > weekEnd) {
      group.upcoming.push(b);
    } else {
      group.past.push(b);
    }
  }

  group.today.sort(compareScheduled);
  group.thisWeek.sort(compareScheduled);
  group.upcoming.sort(compareScheduled);
  group.past.sort(compareScheduled);
  group.canceled.sort(compareScheduled);

  return group;
}
