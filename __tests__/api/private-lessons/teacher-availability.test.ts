/**
 * Availability marks a slot as taken only through a booking in the same
 * community, and hides every slot the book route would refuse.
 */
import { GET } from '@/app/api/community/[communitySlug]/teacher-availability/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
jest.mock('@/lib/community-auth', () => ({ requireCommunityManager: jest.fn() }));

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

const baseSlot = {
  teacher_id: 't1',
  community_id: 'c1',
  availability_date: '2026-11-10',
  start_time: '18:00:00',
  end_time: '19:00:00',
  is_active: true,
  created_at: '',
  updated_at: '',
  teacher_timezone: 'UTC',
};

function get(search: string) {
  return GET(
    new Request(`http://x/api/community/salsa/teacher-availability${search}`) as never,
    { params: Promise.resolve({ communitySlug: 'salsa' }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'student-1' } });
  mockQueryOne.mockResolvedValue({ id: 'c1' });
  mockQuery.mockResolvedValue([]);
});

describe('GET teacher-availability', () => {
  it.each([
    ['both dates', '?teacher_id=t1&startDate=2026-11-01&endDate=2026-11-30'],
    ['start date only', '?teacher_id=t1&startDate=2026-11-01'],
    ['end date only', '?teacher_id=t1&endDate=2026-11-30'],
    ['no dates', '?teacher_id=t1'],
  ])('joins bookings on the slot and the community (%s)', async (_label, search) => {
    await get(search);

    const text = (mockQuery.mock.calls[0][0] as string[]).join('?');
    expect(text).toMatch(/lb\.availability_slot_id = tas\.id\s+AND lb\.community_id = tas\.community_id/);
    expect(text).toMatch(/lb\.lesson_status <> 'canceled'/);
  });

  it('hides a slot with any booking that is not canceled, paid or not', async () => {
    mockQuery.mockResolvedValue([
      { ...baseSlot, id: 'free', booking_id: null, payment_status: null },
      { ...baseSlot, id: 'paid', booking_id: 'b1', payment_status: 'succeeded' },
      { ...baseSlot, id: 'pending', booking_id: 'b2', payment_status: 'pending' },
    ]);

    const res = await get('?teacher_id=t1&startDate=2026-11-01&endDate=2026-11-30');
    const body = await res.json();

    expect(body.map((s: { id: string }) => s.id)).toEqual(['free']);
  });
});
