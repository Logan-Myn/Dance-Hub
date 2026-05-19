import { groupBookings, BookingGroup } from '@/lib/booking-grouping';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

const mkBooking = (
  id: string,
  scheduledAtIso: string | null,
  lessonStatus: LessonBookingWithDetails['lesson_status'] = 'booked',
  durationMin = 60,
): LessonBookingWithDetails =>
  ({
    id,
    scheduled_at: scheduledAtIso,
    lesson_status: lessonStatus,
    duration_minutes: durationMin,
    payment_status: 'succeeded',
    viewer_role: 'teacher',
    lesson_title: 'L',
    student_name: 's',
    student_email: 's@e',
    community_name: 'C',
    price_paid: '0',
    cancellation_cutoff_hours: 24,
    late_refund_policy: 'no_refund',
  } as unknown as LessonBookingWithDetails);

const NOW = new Date('2026-05-20T12:00:00Z'); // Wed, May 20

test('puts a booking later today into "today"', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-20T18:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.today.map(b => b.id)).toEqual(['a']);
  expect(groups.thisWeek).toEqual([]);
});

test('puts a booking on Friday into "this week"', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-22T18:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.thisWeek.map(b => b.id)).toEqual(['a']);
});

test('puts a booking next week into "upcoming"', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-28T18:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.upcoming.map(b => b.id)).toEqual(['a']);
});

test('puts an ended booking into "past"', () => {
  // Started 3 hours ago for 60 min — ended 2h ago, past the 15-min grace.
  const groups = groupBookings(
    [mkBooking('a', '2026-05-20T09:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.past.map(b => b.id)).toEqual(['a']);
});

test('puts a canceled booking into "canceled" regardless of scheduled_at', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-22T18:00:00Z', 'canceled')],
    NOW,
    'UTC',
  );
  expect(groups.canceled.map(b => b.id)).toEqual(['a']);
  expect(groups.thisWeek).toEqual([]);
});

test('sorts each section ascending by scheduled_at', () => {
  const groups = groupBookings(
    [
      mkBooking('b', '2026-05-22T18:00:00Z'),
      mkBooking('a', '2026-05-21T18:00:00Z'),
    ],
    NOW,
    'UTC',
  );
  expect(groups.thisWeek.map(b => b.id)).toEqual(['a', 'b']);
});

test('null scheduled_at goes to "upcoming"', () => {
  const groups = groupBookings(
    [mkBooking('a', null)],
    NOW,
    'UTC',
  );
  expect(groups.upcoming.map(b => b.id)).toEqual(['a']);
});
