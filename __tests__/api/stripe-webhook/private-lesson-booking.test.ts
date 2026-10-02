/**
 * payment_intent.succeeded for a private lesson creates the booking. A
 * PaymentIntent doesn't expire, so the webhook rechecks what the book route
 * checked (lesson and slot still active, slot not started, monthly limit) and
 * refunds the payment instead when the lesson can no longer be booked. When
 * another payment for the same slot was recorded first, the database refuses
 * the second booking (lesson_bookings_active_slot_key) and the webhook
 * refunds that payment too, on the teacher's connected account.
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
jest.mock('@/lib/resend/templates/booking/booking-not-completed', () => ({ BookingNotCompletedEmail: () => null }));
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
        scheduled_at: '2099-11-10T23:00:00.000Z',
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

// 18:00 in New York on 10 Nov 2099 is 23:00 UTC.
const slot = {
  id: 'slot-1',
  availability_date: '2099-11-10',
  start_time: '18:00:00',
  teacher_timezone: 'America/New_York',
};
const lesson = {
  id: 'lesson-1',
  title: 'Bachata basics',
  duration: 60,
  teacher_id: 'teacher-1',
  is_active: true,
  max_bookings_per_month: null as number | null,
};
const profiles: Record<string, unknown> = {
  'teacher-1': { display_name: 'Teacher', full_name: 'Teacher', email: 'teacher@example.com', timezone: 'Europe/Tallinn' },
  'student-2': { display_name: 'Late', full_name: 'Late Student', email: 'late@example.com', timezone: 'America/New_York' },
};

type Rows = { lesson?: unknown; slot?: unknown; existing?: unknown; monthCount?: unknown };

/** Routes queryOne by SQL text; `insert` decides what the booking INSERT does. */
function routeQueries(insert: () => Promise<unknown>, rows: Rows = {}) {
  const r = { lesson, slot, existing: null, monthCount: { count: 0 }, ...rows };
  mockQueryOne.mockImplementation((strings: string[], ...values: unknown[]) => {
    const text = strings.join('?');
    if (/INSERT INTO lesson_bookings/.test(text)) return insert();
    if (/COUNT\(\*\)/i.test(text)) return Promise.resolve(r.monthCount);
    if (/FROM lesson_bookings[\s\S]*stripe_payment_intent_id = /.test(text)) return Promise.resolve(r.existing);
    if (/FROM teacher_availability_slots/.test(text)) return Promise.resolve(r.slot);
    if (/FROM private_lessons/.test(text)) return Promise.resolve(r.lesson);
    if (/FROM profiles/.test(text)) return Promise.resolve(profiles[values[0] as string] ?? null);
    return Promise.resolve(null);
  });
}

const inserts = () =>
  mockQueryOne.mock.calls.filter(([strings]) => /INSERT INTO lesson_bookings/.test((strings as string[]).join('?')));
const emailTo = (to: string) => mockSendEmail.mock.calls.filter(([addr]) => addr === to);

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

  it('does nothing when a concurrent delivery recorded the booking first (ON CONFLICT)', async () => {
    routeQueries(() => Promise.resolve(null));

    const res = await post();

    expect(res.status).toBe(200);
    expect((inserts()[0][0] as string[]).join('?')).toMatch(/ON CONFLICT \(stripe_payment_intent_id\) DO NOTHING/);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('payment_intent.succeeded rechecks the lesson before booking it', () => {
  const ok = () => Promise.resolve({ id: 'booking-1' });

  function expectRefundedWithoutBooking(reasonSubject: RegExp) {
    expect(inserts()).toHaveLength(0);
    expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = mockRefundsCreate.mock.calls[0];
    expect(params).toEqual(expect.objectContaining({ payment_intent: 'pi_late', refund_application_fee: true }));
    expect(opts).toEqual(expect.objectContaining({ stripeAccount: 'acct_teacher', idempotencyKey: expect.stringContaining('pi_late') }));
    const [mail] = emailTo('late@example.com');
    expect(mail[1]).toMatch(reasonSubject);
    expect(mockFinish).toHaveBeenCalledWith('evt_pi', true);
  }

  it('refunds when the slot was deactivated or no longer belongs to the teacher', async () => {
    routeQueries(ok, { slot: null });

    const res = await post();

    expect(res.status).toBe(200);
    expectRefundedWithoutBooking(/could not be completed/i);
    expect(mockSendEmail.mock.calls[0][2].props.reason).toBe('unavailable');
  });

  it('refunds when the slot has already started', async () => {
    routeQueries(ok, { slot: { ...slot, availability_date: '2020-01-01' } });

    await post();

    expectRefundedWithoutBooking(/could not be completed/i);
    expect(mockSendEmail.mock.calls[0][2].props.reason).toBe('unavailable');
  });

  it('refunds when the lesson was deleted (inactive)', async () => {
    routeQueries(ok, { lesson: { ...lesson, is_active: false } });

    await post();

    expectRefundedWithoutBooking(/could not be completed/i);
    expect(mockSendEmail.mock.calls[0][2].props.reason).toBe('unavailable');
  });

  it("refunds when the lesson's monthly limit filled up, not counting this payment", async () => {
    routeQueries(ok, { lesson: { ...lesson, max_bookings_per_month: 2 }, monthCount: { count: 2 } });

    await post();

    expectRefundedWithoutBooking(/could not be completed/i);
    expect(mockSendEmail.mock.calls[0][2].props.reason).toBe('monthly_limit');
    const countCall = mockQueryOne.mock.calls.find(([strings]) => /COUNT\(\*\)/i.test((strings as string[]).join('?')))!;
    expect((countCall[0] as string[]).join('?')).toMatch(/stripe_payment_intent_id IS DISTINCT FROM \?/);
    expect(countCall.slice(1)).toContain('pi_late');
  });

  it('books normally under the monthly limit', async () => {
    routeQueries(ok, { lesson: { ...lesson, max_bookings_per_month: 2 }, monthCount: { count: 1 } });

    await post();

    expect(inserts()).toHaveLength(1);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  it('never refunds a payment whose booking is already recorded (redelivery)', async () => {
    routeQueries(ok, { existing: { id: 'booking-1' }, slot: { ...slot, availability_date: '2020-01-01' } });

    const res = await post();

    expect(res.status).toBe(200);
    expect(mockRefundsCreate).not.toHaveBeenCalled();
    expect(inserts()).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('flags a failed refund for ops with the payment intent and account, and answers 500', async () => {
    routeQueries(ok, { slot: null });
    mockRefundsCreate.mockRejectedValue(new Error('card network down'));

    const res = await post();

    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[REFUND_FAILED]'),
      expect.objectContaining({ paymentIntentId: 'pi_late', accountId: 'acct_teacher' }),
    );
    expect(mockFinish).toHaveBeenCalledWith('evt_pi', false);
  });
});

describe('booking emails show the lesson time in each recipient\'s timezone', () => {
  it("uses the student's and the teacher's profile timezones, with a label", async () => {
    routeQueries(() => Promise.resolve({ id: 'booking-1' }));

    await post();

    const [studentMail] = emailTo('late@example.com').filter(([, subject]) => /Booking Confirmed/.test(subject as string));
    expect(studentMail[2].props.lessonDate).toBe('Tuesday, November 10, 2099');
    expect(studentMail[2].props.lessonTime).toBe('6:00 PM EST');
    const [teacherMail] = emailTo('teacher@example.com');
    expect(teacherMail[2].props.lessonDate).toBe('Wednesday, November 11, 2099');
    expect(teacherMail[2].props.lessonTime).toBe('1:00 AM GMT+2');
  });

  it("dates the not-completed email in the student's timezone", async () => {
    routeQueries(() => Promise.reject(slotTakenError()));

    await post();

    const [mail] = emailTo('late@example.com');
    expect(mail[2].props.reason).toBe('slot_taken');
    expect(mail[2].props.lessonDate).toBe('Tuesday, November 10, 2099 at 6:00 PM EST');
  });
});
