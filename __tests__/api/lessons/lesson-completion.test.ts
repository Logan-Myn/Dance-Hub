/**
 * Lesson completion: members only, the lesson must belong to the community,
 * and { completed } sets the state (so a double click can't undo it).
 */
import { POST } from '@/app/api/community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/[lessonId]/completion/route';

const mockGuard = jest.fn();
jest.mock('@/lib/community-auth', () => ({ requireCommunityViewer: (...a: unknown[]) => mockGuard(...a) }));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const params = Promise.resolve({ communitySlug: 'salsa', courseSlug: 'a1', lessonId: 'l1' });
const post = (body?: unknown) =>
  POST(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params }
  );
const sqlText = () => mockSql.mock.calls.map((c) => (c[0] as string[]).join('?')).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard.mockResolvedValue({ ok: true, session: { user: { id: 'u1' } }, community: { id: 'c1' } });
});

it('refuses visitors who are not members', async () => {
  mockGuard.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  expect((await post({ completed: true })).status).toBe(403);
  expect(mockSql).not.toHaveBeenCalled();
});

it('refuses a lesson from another community', async () => {
  mockQueryOne.mockResolvedValue(null);
  expect((await post({ completed: true })).status).toBe(404);
  expect(mockSql).not.toHaveBeenCalled();
});

it('sets the state it is given, idempotently', async () => {
  mockQueryOne.mockResolvedValue({ id: 'l1' });
  const res = await post({ completed: true });
  expect(await res.json()).toEqual({ completed: true });
  expect(sqlText()).toContain('ON CONFLICT');

  mockSql.mockClear();
  const off = await post({ completed: false });
  expect(await off.json()).toEqual({ completed: false });
  expect(sqlText()).toContain('DELETE FROM lesson_completions');
});

it('still toggles without a body', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: 'l1' }).mockResolvedValueOnce({ id: 'existing' });
  expect(await (await post()).json()).toEqual({ completed: false });
});
