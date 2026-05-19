import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingRow } from '@/components/private-lessons/manage/BookingRow';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

const mkBooking = (
  over: Partial<LessonBookingWithDetails> = {},
): LessonBookingWithDetails =>
  ({
    id: 'b1',
    lesson_title: 'Beginner Bachata',
    student_name: 'Maria',
    student_email: 'm@example.com',
    scheduled_at: '2026-05-20T15:00:00Z',
    duration_minutes: 60,
    lesson_status: 'booked',
    payment_status: 'succeeded',
    viewer_role: 'teacher',
    community_name: 'Studio',
    price_paid: '40',
    cancellation_cutoff_hours: 24,
    late_refund_policy: 'no_refund',
    daily_room_name: null,
    ...over,
  } as unknown as LessonBookingWithDetails);

test('renders student name and lesson title', () => {
  render(
    <BookingRow
      booking={mkBooking()}
      canJoinVideo={false}
      onOpen={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByText(/Maria · Beginner Bachata/)).toBeInTheDocument();
});

test('renders Join button when canJoinVideo is true', () => {
  render(
    <BookingRow
      booking={mkBooking({ daily_room_name: 'room-1' })}
      canJoinVideo={true}
      onOpen={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole('link', { name: /join/i })).toBeInTheDocument();
});

test('does not render Join button when canJoinVideo is false', () => {
  render(
    <BookingRow
      booking={mkBooking()}
      canJoinVideo={false}
      onOpen={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByRole('link', { name: /join/i })).not.toBeInTheDocument();
});

test('clicking the row body calls onOpen', async () => {
  const onOpen = jest.fn();
  render(
    <BookingRow
      booking={mkBooking()}
      canJoinVideo={false}
      onOpen={onOpen}
      onCancel={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /open booking details/i }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
