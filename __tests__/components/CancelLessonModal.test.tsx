import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelLessonModal } from '@/components/CancelLessonModal';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

const baseProps = {
  isOpen: true,
  onClose: jest.fn(),
  onCancelled: jest.fn(),
  bookingId: 'bk_1',
  lessonTitle: 'Bachata Basics',
  scheduledAtIso: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  pricePaid: 50,
  currency: 'EUR',
  role: 'student' as const,
  expectedRefundCents: 5000,
};

test('shows refund amount when expectedRefundCents > 0', () => {
  render(<CancelLessonModal {...baseProps} />);
  expect(screen.getByText(/€50/)).toBeInTheDocument();
  expect(screen.getByText(/refund/i)).toBeInTheDocument();
});

test('shows no-refund warning when expectedRefundCents === 0', () => {
  render(<CancelLessonModal {...baseProps} expectedRefundCents={0} />);
  expect(screen.getByText(/no refund/i)).toBeInTheDocument();
});

test('on confirm, POSTs to the cancel endpoint and calls onCancelled', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 'canceled', refunded_amount_cents: 5000 }),
  });

  render(<CancelLessonModal {...baseProps} />);
  await userEvent.click(screen.getByRole('button', { name: /cancel lesson/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/bookings/bk_1/cancel',
      expect.objectContaining({ method: 'POST' })
    );
    expect(baseProps.onCancelled).toHaveBeenCalled();
  });
});
