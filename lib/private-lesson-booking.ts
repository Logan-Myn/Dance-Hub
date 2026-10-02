import { queryOne } from '@/lib/db';
import { formatInTz, naiveToUtc } from '@/lib/timezone';

// Checks shared by the book route (before taking payment) and the Stripe
// webhook (before recording the booking: a PaymentIntent doesn't expire, so
// the lesson may have become unbookable by the time it is paid).

// Availability slot as the student saw it: a date and time in the teacher's
// timezone. The lesson time is derived from it, never taken from the client.
export interface BookableSlot {
  id: string;
  availability_date: string;
  start_time: string;
  teacher_timezone: string;
}

/** One of the teacher's active slots in this community, or null. */
export async function findBookableSlot(
  slotId: string,
  communityId: string,
  teacherId: string | null,
): Promise<BookableSlot | null> {
  return queryOne<BookableSlot>`
    SELECT
      tas.id,
      to_char(tas.availability_date, 'YYYY-MM-DD') AS availability_date,
      to_char(tas.start_time, 'HH24:MI:SS') AS start_time,
      COALESCE(p.timezone, 'UTC') AS teacher_timezone
    FROM teacher_availability_slots tas
    LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
    WHERE tas.id = ${slotId}
      AND tas.community_id = ${communityId}
      AND tas.teacher_id = ${teacherId}
      AND tas.is_active = true
  `;
}

/** The slot's start instant: the same conversion the slot picker shows. */
export function slotStartsAt(slot: BookableSlot): Date {
  return naiveToUtc(`${slot.availability_date}T${slot.start_time}`, slot.teacher_timezone);
}

/**
 * Whether the lesson's monthly cap is already reached for the slot's
 * calendar month in the teacher's timezone. Canceled bookings don't count,
 * and neither does the booking of `excludePaymentIntentId` (the payment
 * being recorded, when the webhook rechecks).
 */
export async function monthlyLimitReached(
  lesson: { id: string; max_bookings_per_month: number | null },
  slot: BookableSlot,
  excludePaymentIntentId?: string,
): Promise<{ reached: boolean; monthLabel: string }> {
  const monthLabel = formatInTz(slotStartsAt(slot), slot.teacher_timezone, 'MMMM yyyy');
  if (!lesson.max_bookings_per_month) return { reached: false, monthLabel };

  const [year, month] = slot.availability_date.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthStart = naiveToUtc(`${slot.availability_date.slice(0, 7)}-01T00:00:00`, slot.teacher_timezone);
  const monthEnd = naiveToUtc(`${nextMonth}-01T00:00:00`, slot.teacher_timezone);
  const booked = await queryOne<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM lesson_bookings
    WHERE private_lesson_id = ${lesson.id}
      AND lesson_status <> 'canceled'
      AND scheduled_at >= ${monthStart}
      AND scheduled_at < ${monthEnd}
      AND stripe_payment_intent_id IS DISTINCT FROM ${excludePaymentIntentId ?? ''}
  `;
  return { reached: Number(booked?.count ?? 0) >= lesson.max_bookings_per_month, monthLabel };
}

function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lesson date and time for an email, in the recipient's timezone (their
 * profile's, UTC when unknown), e.g. "Tuesday, November 10, 2026" and
 * "6:00 PM EST".
 */
export function lessonTimeForEmail(
  when: Date,
  timezone: string | null | undefined,
): { date: string; time: string } {
  const tz = isTimeZone(timezone) ? timezone : 'UTC';
  return {
    date: formatInTz(when, tz, 'EEEE, MMMM d, yyyy'),
    time: formatInTz(when, tz, 'h:mm a zzz'),
  };
}
