import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-hot-toast';
import PrivateLessonPaymentModal from '@/components/PrivateLessonPaymentModal';

const mockConfirmPayment = jest.fn();
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment: mockConfirmPayment }),
  useElements: () => ({}),
}));
jest.mock('@stripe/stripe-js', () => ({ loadStripe: () => Promise.resolve({}) }));
jest.mock('react-hot-toast', () => {
  const toast = { success: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: toast, toast };
});

function renderModal() {
  const onSuccess = jest.fn();
  render(
    <PrivateLessonPaymentModal
      isOpen
      onClose={() => {}}
      clientSecret="pi_secret"
      stripeAccountId="acct_1"
      price={50}
      lessonTitle="Bachata basics"
      communitySlug="salsa"
      onSuccess={onSuccess}
    />,
  );
  return { onSuccess };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('a processing payment is pending, not failed', async () => {
  mockConfirmPayment.mockResolvedValue({ paymentIntent: { status: 'processing' } });
  const { onSuccess } = renderModal();

  await userEvent.click(screen.getByRole('button', { name: /pay/i }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('processing'));
  expect(toast.error).not.toHaveBeenCalled();
});

test('a succeeded payment completes the booking', async () => {
  mockConfirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
  const { onSuccess } = renderModal();

  await userEvent.click(screen.getByRole('button', { name: /pay/i }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('succeeded'));
});

test('a redirect returns to the private lessons page, not the home page', async () => {
  mockConfirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
  renderModal();

  await userEvent.click(screen.getByRole('button', { name: /pay/i }));

  await waitFor(() => expect(mockConfirmPayment).toHaveBeenCalled());
  const { confirmParams, redirect } = mockConfirmPayment.mock.calls[0][0];
  expect(redirect).toBe('if_required');
  expect(confirmParams.return_url).toBe(`${window.location.origin}/salsa/private-lessons?lesson_payment=return`);
});
