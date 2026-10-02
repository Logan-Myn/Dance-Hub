import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { BookingsTab } from '@/components/private-lessons/manage/BookingsTab';

// The teacher's bookings list. The lesson-bookings route returns rows without
// a viewer_role, and the teacher always refunds in full when they cancel.
const booking = {
  id: 'b1',
  lesson_title: 'Beginner Bachata',
  student_name: 'Maria',
  student_email: 'm@example.com',
  // Inside the 24h cutoff of a no-refund policy: a student would get nothing.
  scheduled_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
  duration_minutes: 60,
  lesson_status: 'scheduled',
  payment_status: 'succeeded',
  community_name: 'Studio',
  price_paid: '40.00',
  cancellation_cutoff_hours: 24,
  late_refund_policy: 'no_refund',
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [booking] }) as jest.Mock;
});

test("the teacher's cancel dialog promises a full refund to the student", async () => {
  const user = userEvent.setup();
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <BookingsTab communitySlug="salsa" />
    </SWRConfig>,
  );

  await user.click(await screen.findByRole('button', { name: /more actions/i }));
  await user.click(await screen.findByRole('menuitem', { name: /cancel booking/i }));

  expect(await screen.findByText(/This will refund €40\.00 to the student/)).toBeInTheDocument();
  expect(screen.queryByText(/No refund will be issued/)).not.toBeInTheDocument();
});
