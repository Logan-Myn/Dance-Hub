/**
 * Live-class moderation on the server:
 * - GET  /participants?ids=  names for the room's identities (user ids), from
 *   the database, so nobody can pick their own label in chat or on a tile.
 * - PATCH /participants/[identity]  grant or revoke publishing. Only the
 *   class teacher can grant; anyone can step down themselves.
 */
import { GET } from '@/app/api/live-classes/[classId]/participants/route';
import { PATCH } from '@/app/api/live-classes/[classId]/participants/[identity]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockQueryOne = jest.fn();
const mockQuery = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

const mockSetCanPublish = jest.fn();
jest.mock('@/lib/stream-hub', () => ({
  setParticipantCanPublish: (...a: unknown[]) => mockSetCanPublish(...a),
}));

let membershipStatus: string | null = 'active';

beforeEach(() => {
  membershipStatus = 'active';
  mockGetSession.mockReset();
  mockQuery.mockReset().mockResolvedValue([]);
  mockSetCanPublish.mockReset().mockResolvedValue(undefined);
  mockQueryOne.mockReset().mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (text.includes('FROM live_classes')) {
      return Promise.resolve({ id: 'lc1', community_id: 'c1', teacher_id: 'u-teacher', community_created_by: 'u-owner' });
    }
    if (text.includes('FROM community_members')) {
      return Promise.resolve(membershipStatus ? { status: membershipStatus } : null);
    }
    return Promise.resolve(null);
  });
});

const as = (id: string | null) =>
  mockGetSession.mockResolvedValue(id ? { user: { id, email: `${id}@x.com` } } : null);

describe('GET names', () => {
  const get = (qs: string) =>
    GET(new Request(`http://x/api/live-classes/lc1/participants${qs}`) as never, {
      params: Promise.resolve({ classId: 'lc1' }),
    });

  it('requires a session', async () => {
    as(null);
    expect((await get('?ids=a')).status).toBe(401);
  });

  it('refuses people who are not in the class community', async () => {
    as('u-stranger');
    membershipStatus = null;
    expect((await get('?ids=u-teacher')).status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns names from profiles, limited to people allowed in the class', async () => {
    as('u-student');
    mockQuery.mockResolvedValue([
      { id: 'u-teacher', display_name: 'Anna', full_name: 'Anna T', email: 'anna@x.com' },
      { id: 'u-b', display_name: null, full_name: 'Bea Full', email: 'bea@x.com' },
      { id: 'u-c', display_name: null, full_name: null, email: 'carl.dancer@x.com' },
    ]);

    const res = await get('?ids=u-teacher,u-b,u-c');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      names: { 'u-teacher': 'Anna', 'u-b': 'Bea Full', 'u-c': 'carl.dancer' },
    });

    const [strings, ...values] = mockQuery.mock.calls[0];
    const text = (strings as string[]).join('?');
    expect(text).toMatch(/auth_user_id = ANY\(\?\)/);
    expect(text).toMatch(/community_members/);
    expect(text).toMatch(/status = 'active'/);
    expect(values).toContainEqual(['u-teacher', 'u-b', 'u-c']);
  });
});

describe('PATCH publish permission', () => {
  const patch = (identity: string, body: unknown) =>
    PATCH(
      new Request(`http://x/api/live-classes/lc1/participants/${identity}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }) as never,
      { params: Promise.resolve({ classId: 'lc1', identity }) }
    );

  it('lets the teacher grant and revoke a student', async () => {
    as('u-teacher');
    expect((await patch('u-student', { canPublish: true })).status).toBe(200);
    expect((await patch('u-student', { canPublish: false })).status).toBe(200);
    expect(mockSetCanPublish).toHaveBeenNthCalledWith(1, 'live-class-lc1', 'u-student', true);
    expect(mockSetCanPublish).toHaveBeenNthCalledWith(2, 'live-class-lc1', 'u-student', false);
  });

  it('does not let a student grant themselves or revoke someone else', async () => {
    as('u-student');
    expect((await patch('u-student', { canPublish: true })).status).toBe(403);
    expect((await patch('u-other', { canPublish: false })).status).toBe(403);
    expect(mockSetCanPublish).not.toHaveBeenCalled();
  });

  it('does not let the community owner act as the teacher', async () => {
    as('u-owner');
    expect((await patch('u-student', { canPublish: true })).status).toBe(403);
  });

  it('lets a student step down', async () => {
    as('u-student');
    expect((await patch('u-student', { canPublish: false })).status).toBe(200);
    expect(mockSetCanPublish).toHaveBeenCalledWith('live-class-lc1', 'u-student', false);
  });

  it("never changes the teacher's own access", async () => {
    as('u-teacher');
    expect((await patch('u-teacher', { canPublish: false })).status).toBe(400);
    expect(mockSetCanPublish).not.toHaveBeenCalled();
  });

  it('requires a session and a boolean', async () => {
    as(null);
    expect((await patch('u-student', { canPublish: true })).status).toBe(401);
    as('u-teacher');
    expect((await patch('u-student', { canPublish: 'yes' })).status).toBe(400);
    expect(mockSetCanPublish).not.toHaveBeenCalled();
  });

  it('reports a media server failure as 502', async () => {
    as('u-teacher');
    mockSetCanPublish.mockRejectedValue(new Error('not found'));
    expect((await patch('u-student', { canPublish: true })).status).toBe(502);
  });
});
