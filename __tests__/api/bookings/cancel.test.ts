import { POST } from '@/app/api/bookings/[bookingId]/cancel/route';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { stripe } from '@/lib/stripe';
import { getEmailService } from '@/lib/resend/email-service';

jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/stripe', () => ({
  stripe: { refunds: { create: jest.fn() } },
}));
jest.mock('@/lib/resend/email-service', () => ({
  getEmailService: jest.fn(() => ({
    sendNotificationEmail: jest.fn().mockResolvedValue({ id: 'em_1' }),
  })),
}));

const mockedQueryOne = queryOne as jest.Mock;
const mockedSql = sql as unknown as jest.Mock;
const mockedSession = getSession as jest.Mock;
const mockedRefund = stripe.refunds.create as jest.Mock;

const STUDENT_ID = 'usr_student';
const TEACHER_ID = 'usr_teacher';
const BOOKING_ID = 'bk_1';

const futureScheduledAt = (hoursAhead: number) =>
  new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();

const bookingRow = (overrides: Partial<any> = {}) => ({
  id: BOOKING_ID,
  student_id: STUDENT_ID,
  scheduled_at: futureScheduledAt(48),
  lesson_status: 'booked',
  payment_status: 'succeeded',
  price_paid: 50,
  stripe_payment_intent_id: 'pi_123',
  availability_slot_id: 'slot_1',
  community_created_by: TEACHER_ID,
  community_stripe_account_id: 'acct_x',
  community_name: 'Salsa Studio',
  lesson_title: 'Bachata Basics',
  cancellation_cutoff_hours: 24,
  late_refund_policy: 'no_refund',
  student_email: 'stu@x.com',
  student_name: 'Stu',
  teacher_email: 'teacher@x.com',
  teacher_name: 'Teacher',
  duration_minutes: 60,
  ...overrides,
});

const makeReq = () =>
  new Request(`http://localhost/api/bookings/${BOOKING_ID}/cancel`, {
    method: 'POST',
  });

const callRoute = () =>
  POST(makeReq(), { params: Promise.resolve({ bookingId: BOOKING_ID }) } as any);

beforeEach(() => {
  jest.clearAllMocks();
  mockedSql.mockResolvedValue(undefined);
});

describe('POST /api/bookings/[bookingId]/cancel — guards', () => {
  test('401 when no session', async () => {
    mockedSession.mockResolvedValueOnce(null);
    const res = await callRoute();
    expect(res.status).toBe(401);
  });

  test('404 when booking missing', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(null);
    const res = await callRoute();
    expect(res.status).toBe(404);
  });

  test('403 when caller is neither student nor community owner', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: 'usr_other' } });
    mockedQueryOne.mockResolvedValueOnce(bookingRow());
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  test('409 when lesson_status is not cancelable', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(bookingRow({ lesson_status: 'canceled' }));
    const res = await callRoute();
    expect(res.status).toBe(409);
  });

  test('409 when scheduled_at is at or past now', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({ scheduled_at: futureScheduledAt(-1) }) // 1h ago
    );
    const res = await callRoute();
    expect(res.status).toBe(409);
  });

  test('409 when scheduled_at is exactly now (no grace)', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({ scheduled_at: new Date().toISOString() })
    );
    const res = await callRoute();
    expect(res.status).toBe(409);
  });
});

describe('POST /api/bookings/[bookingId]/cancel — refund decisions', () => {
  test('student before cutoff: full refund with application_fee returned', async () => {
    const mockSend = jest.fn().mockResolvedValue({ id: 'em_1' });
    (getEmailService as jest.Mock).mockReturnValueOnce({
      sendNotificationEmail: mockSend,
    });

    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(48),
        cancellation_cutoff_hours: 24,
        teacher_email: 'teacher@x.com',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_1', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_123',
        refund_application_fee: true,
      }),
      { stripeAccount: 'acct_x' }
    );
    expect(mockSend).toHaveBeenCalledWith(
      'teacher@x.com',
      expect.stringMatching(/canceled/i),
      expect.anything()
    );
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });

  test('student after cutoff with no_refund policy: cancel without Stripe call', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(2),
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'no_refund',
      })
    );

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(0);
  });

  test('student after cutoff with refund policy: full refund', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(2),
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'refund',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_2', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });

  test('teacher anytime: always full refund', async () => {
    const mockSend = jest.fn().mockResolvedValue({ id: 'em_1' });
    (getEmailService as jest.Mock).mockReturnValueOnce({
      sendNotificationEmail: mockSend,
    });

    mockedSession.mockResolvedValueOnce({ user: { id: TEACHER_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(1), // way past cutoff
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'no_refund',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_3', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      'stu@x.com',
      expect.stringMatching(/canceled/i),
      expect.anything()
    );
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });

  test('no-payment edge (no stripe_payment_intent_id): skip Stripe, still cancel', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({ stripe_payment_intent_id: null, price_paid: 0 })
    );

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(0);
  });

  test('Stripe refund failure: 502 and DB untouched', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(bookingRow());
    mockedRefund.mockRejectedValueOnce(new Error('charge_too_old'));

    const res = await callRoute();
    expect(res.status).toBe(502);
    expect(mockedSql).not.toHaveBeenCalled();
  });
});
