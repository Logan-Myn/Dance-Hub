/**
 * Deleting a lesson must keep its booking history: lesson_bookings cascades
 * on a hard delete, so the route only hides the lesson (is_active = false).
 */
import { DELETE } from '@/app/api/community/[communitySlug]/private-lessons/[lessonId]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
jest.mock('@/lib/community-auth', () => ({ userCanManageCommunity: jest.fn() }));

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

const texts = () => mockQueryOne.mock.calls.map(([strings]) => (strings as string[]).join('?'));

function del() {
  return DELETE(new Request('http://x', { method: 'DELETE' }), {
    params: Promise.resolve({ communitySlug: 'salsa', lessonId: 'lesson-1' }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'teacher-1' } });
  mockQuery.mockResolvedValue([]);
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/FROM communities/.test(text)) return Promise.resolve({ id: 'c1', created_by: 'teacher-1' });
    if (/UPDATE private_lessons/.test(text)) return Promise.resolve({ id: 'lesson-1', is_active: false });
    return Promise.resolve(null);
  });
});

it('hides the lesson instead of deleting it, so its bookings are kept', async () => {
  const res = await del();

  expect(res.status).toBe(200);
  const update = texts().find((t) => /UPDATE private_lessons/.test(t));
  expect(update).toMatch(/SET is_active = false/);
  expect(update).toMatch(/community_id = \?/);
  expect(texts().some((t) => /DELETE FROM private_lessons/.test(t))).toBe(false);
});

it('still refuses while the lesson has upcoming bookings', async () => {
  mockQuery.mockResolvedValue([{ id: 'b1' }]);

  const res = await del();

  expect(res.status).toBe(400);
  expect(texts().some((t) => /UPDATE private_lessons/.test(t))).toBe(false);
});

it('answers 404 for a lesson outside this community', async () => {
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/FROM communities/.test(text)) return Promise.resolve({ id: 'c1', created_by: 'teacher-1' });
    return Promise.resolve(null);
  });

  const res = await del();

  expect(res.status).toBe(404);
});
