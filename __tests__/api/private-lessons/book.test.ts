/**
 * The private-lesson book route creates the PaymentIntent the webhook later
 * turns into a booking. It must take the lesson time from the teacher's own
 * availability slot (never from the client), refuse a slot from another
 * community or teacher, and refuse a slot that is already booked.
 */
import { POST } from '@/app/api/community/[communitySlug]/private-lessons/[lessonId]/book/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const mockPaymentIntentsCreate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: (...a: unknown[]) => mockPaymentIntentsCreate(...a) },
  },
}));

const SLOT_ID = '11111111-1111-4111-8111-111111111111';
const LESSON_ID = 'lesson-1';

const community = {
  id: 'c1',
  name: 'Salsa',
  stripe_account_id: 'acct_teacher',
  created_by: 'teacher-1',
  created_at: '2020-01-01T00:00:00.000Z',
  active_member_count: 10,
};
const lesson = {
  id: LESSON_ID,
  title: 'Bachata basics',
  teacher_id: 'teacher-1',
  regular_price: '50.00',
  member_price: null,
  is_active: true,
  max_bookings_per_month: null,
};
// 2026-11-10 18:00 in New York is 23:00 UTC.
const slot = {
  id: SLOT_ID,
  availability_date: '2026-11-10',
  start_time: '18:00:00',
  teacher_timezone: 'America/New_York',
};

type Rows = {
  community?: unknown;
  lesson?: unknown;
  membership?: unknown;
  slot?: unknown;
  taken?: unknown;
  monthCount?: unknown;
};

function routeQueries(rows: Rows = {}) {
  const r = {
    community,
    lesson,
    membership: null,
    slot,
    taken: null,
    monthCount: { count: 0 },
    ...rows,
  };
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/FROM communities/.test(text)) return Promise.resolve(r.community);
    if (/FROM private_lessons/.test(text)) return Promise.resolve(r.lesson);
    if (/FROM community_members/.test(text)) return Promise.resolve(r.membership);
    if (/FROM teacher_availability_slots/.test(text)) return Promise.resolve(r.slot);
    if (/COUNT\(\*\)/i.test(text)) return Promise.resolve(r.monthCount);
    if (/FROM lesson_bookings/.test(text)) return Promise.resolve(r.taken);
    return Promise.resolve(null);
  });
}

const queriesMatching = (re: RegExp) =>
  mockQueryOne.mock.calls
    .map(([strings, ...values]) => ({ text: (strings as string[]).join('?'), values }))
    .filter((c) => re.test(c.text));

function book(body: Record<string, unknown>) {
  return POST(
    new Request('http://x', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ communitySlug: 'salsa', lessonId: LESSON_ID }) },
  );
}

const validBody = {
  student_email: 'stu@example.com',
  availability_slot_id: SLOT_ID,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T12:00:00Z'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetSession.mockResolvedValue({ user: { id: 'student-1', email: 'stu@example.com' } });
  mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret' });
  routeQueries();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('POST /private-lessons/[lessonId]/book: slot checks', () => {
  it('takes the lesson time from the slot, not from the request', async () => {
    const res = await book({ ...validBody, scheduled_at: '2030-01-01T00:00:00.000Z' });

    expect(res.status).toBe(200);
    const [params, opts] = mockPaymentIntentsCreate.mock.calls[0];
    expect(params.metadata.scheduled_at).toBe('2026-11-10T23:00:00.000Z');
    expect(params.metadata.availability_slot_id).toBe(SLOT_ID);
    expect(opts).toEqual({ stripeAccount: 'acct_teacher' });
  });

  it("loads the slot scoped to this community, the lesson's teacher and active slots", async () => {
    await book(validBody);

    const [slotQuery] = queriesMatching(/FROM teacher_availability_slots/);
    expect(slotQuery.text).toMatch(/community_id = \?/);
    expect(slotQuery.text).toMatch(/teacher_id = \?/);
    expect(slotQuery.text).toMatch(/is_active = true/);
    expect(slotQuery.values).toEqual(expect.arrayContaining([SLOT_ID, 'c1', 'teacher-1']));
  });

  it('refuses a slot that does not belong to this community and teacher', async () => {
    routeQueries({ slot: null });

    const res = await book(validBody);

    expect(res.status).toBe(404);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('requires a slot', async () => {
    const res = await book({ student_email: 'stu@example.com', scheduled_at: '2026-11-10T23:00:00Z' });

    expect(res.status).toBe(400);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('refuses a slot id that is not a uuid without querying it', async () => {
    const res = await book({ ...validBody, availability_slot_id: "x' OR 1=1" });

    expect(res.status).toBe(400);
    expect(queriesMatching(/FROM teacher_availability_slots/)).toHaveLength(0);
  });

  it('refuses a slot that is already booked', async () => {
    routeQueries({ taken: { id: 'booking-9' } });

    const res = await book(validBody);

    expect(res.status).toBe(409);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    const [takenQuery] = queriesMatching(/FROM lesson_bookings[\s\S]*availability_slot_id/);
    expect(takenQuery.text).toMatch(/lesson_status <> 'canceled'/);
    expect(takenQuery.values).toContain(SLOT_ID);
  });

  it('refuses a slot that has already started', async () => {
    jest.setSystemTime(new Date('2026-11-10T23:30:00Z'));

    const res = await book(validBody);

    expect(res.status).toBe(400);
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });
});
