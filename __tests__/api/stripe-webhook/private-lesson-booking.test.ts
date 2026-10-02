/**
 * payment_intent.succeeded for a private lesson creates the booking. When
 * another payment for the same slot was recorded first, the database refuses
 * the second booking (lesson_bookings_active_slot_key) and the webhook
 * refunds that payment on the teacher's connected account instead.
 */
import { POST } from '@/app/api/webhooks/stripe/route';
import { claimWebhookEvent, finishWebhookEvent } from '@/lib/stripe-webhook-events';

const mockConstructEvent = jest.fn();
const mockRefundsCreate = jest.fn();
const mockStripeClient = {
  webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
  refunds: { create: (...a: unknown[]) => mockRefundsCreate(...a) },
  subscriptions: { retrieve: jest.fn(), update: jest.fn() },
};
jest.mock('@/lib/stripe', () => ({
  STRIPE_API_VERSION: '2025-12-15.clover',
  get stripe() { return mockStripeClient; },
}));
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => mockStripeClient) }));
jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'stripe-signature': 'sig' }),
}));

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: Object.assign(jest.fn(), { json: (v: unknown) => v }),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

jest.mock('@/lib/stripe-webhook-events', () => ({
  claimWebhookEvent: jest.fn(),
  finishWebhookEvent: jest.fn(),
}));
const mockClaim = claimWebhookEvent as jest.Mock;
const mockFinish = finishWebhookEvent as jest.Mock;

const mockSendEmail = jest.fn();
jest.mock('@/lib/resend/email-service', () => ({
  getEmailService: () => ({ sendNotificationEmail: (...a: unknown[]) => mockSendEmail(...a) }),
}));
jest.mock('@/lib/resend/templates/community/member-welcome', () => ({ MemberWelcomeEmail: () => null }));
jest.mock('@/lib/resend/templates/community/community-opening', () => ({ CommunityOpeningEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/booking-confirmation', () => ({ BookingConfirmationEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/teacher-booking-notification', () => ({ TeacherBookingNotificationEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/payment-receipt', () => ({ PaymentReceiptEmail: () => null }));
jest.mock('@/lib/resend/templates/booking/booking-slot-taken', () => ({ BookingSlotTakenEmail: () => null }));
jest.mock('@/lib/broadcasts/billing', () => ({
  upsertBroadcastSubscription: jest.fn(),
  markBroadcastSubscriptionStatus: jest.fn(),
}));

const paymentIntentEvent = {
  id: 'evt_pi',
  type: 'payment_intent.succeeded',
  account: 'acct_teacher',
  created: 1,
  data: {
    object: {
      id: 'pi_late',
      metadata: {
        type: 'private_lesson',
        lesson_id: 'lesson-1',
        community_id: 'c1',
        student_id: 'student-2',
        student_email: 'late@example.com',
        student_name: 'Late Student',
        scheduled_at: '2026-11-10T23:00:00.000Z',
        availability_slot_id: 'slot-1',
        is_member: 'false',
        price_paid: '50',
      },
    },
  },
};

function slotTakenError() {
  return Object.assign(new Error('duplicate key value violates unique constraint "lesson_bookings_active_slot_key"'), {
    code: '23505',
    constraint_name: 'lesson_bookings_active_slot_key',
  });
}

/** Routes queryOne by SQL text; `insert` decides what the booking INSERT does. */
function routeQueries(insert: () => Promise<unknown>) {
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/INSERT INTO lesson_bookings/.test(text)) return insert();
    if (/FROM private_lessons/.test(text)) {
      return Promise.resolve({ title: 'Bachata basics', duration: 60, teacher_id: 'teacher-1' });
    }
    if (/FROM profiles/.test(text)) {
      return Promise.resolve({ display_name: 'Teacher', full_name: 'Teacher', email: 'teacher@example.com' });
    }
    return Promise.resolve(null);
  });
}

function post() {
  return POST(new Request('http://x', { method: 'POST', body: '{}' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockConstructEvent.mockReturnValue(paymentIntentEvent);
  mockClaim.mockResolvedValue('claimed');
  mockFinish.mockResolvedValue(undefined);
  mockSendEmail.mockResolvedValue(undefined);
  mockRefundsCreate.mockResolvedValue({ id: 're_1' });
});

describe('payment_intent.succeeded for a private lesson', () => {
  it('creates the booking and sends the confirmation emails', async () => {
    routeQueries(() => Promise.resolve({ id: 'booking-1' }));

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith('late@example.com', expect.stringMatching(/Booking Confirmed/), expect.anything());
  });

  it('refunds the payment on the connected account when the slot was booked first by someone else', async () => {
    routeQueries(() => Promise.reject(slotTakenError()));

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = mockRefundsCreate.mock.calls[0];
    expect(params).toEqual(expect.objectContaining({ payment_intent: 'pi_late', refund_application_fee: true }));
    expect(opts).toEqual(expect.objectContaining({
      stripeAccount: 'acct_teacher',
      idempotencyKey: expect.stringContaining('pi_late'),
    }));
    // The student hears that the time was taken, not that it's confirmed.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toBe('late@example.com');
    expect(mockSendEmail.mock.calls[0][1]).not.toMatch(/Confirmed/);
    expect(mockFinish).toHaveBeenCalledWith('evt_pi', true);
  });

  it('treats a payment that is already refunded as done', async () => {
    routeQueries(() => Promise.reject(slotTakenError()));
    mockRefundsCreate.mockRejectedValue(Object.assign(new Error('already refunded'), { code: 'charge_already_refunded' }));

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockFinish).toHaveBeenCalledWith('evt_pi', true);
  });

  it('answers 500 when the refund fails, so the event is retried', async () => {
    routeQueries(() => Promise.reject(slotTakenError()));
    mockRefundsCreate.mockRejectedValue(new Error('network'));

    const res = await post();

    expect(res.status).toBe(500);
    expect(mockFinish).toHaveBeenCalledWith('evt_pi', false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not refund on other database errors', async () => {
    routeQueries(() => Promise.reject(Object.assign(new Error('boom'), { code: '23503', constraint_name: 'lesson_bookings_private_lesson_id_fkey' })));

    const res = await post();

    expect(res.status).toBe(500);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  it('does nothing for a redelivered payment whose booking already exists', async () => {
    routeQueries(() => Promise.resolve(null));

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
