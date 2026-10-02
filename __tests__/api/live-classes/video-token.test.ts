/**
 * The video identity must be unique per user. It used to be the display name,
 * so a member who took the teacher's name kicked the teacher out of the room
 * on every join (the media server drops the older connection of an identity).
 * Students also join subscribe-only; the teacher grants publishing.
 */
import { GET } from '@/app/api/live-classes/[classId]/video-token/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockQueryOne = jest.fn();
const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const mockGenerateToken = jest.fn();
jest.mock('@/lib/stream-hub', () => ({
  getRoom: jest.fn().mockResolvedValue({ name: 'live-class-lc1' }),
  createRoom: jest.fn(),
  startRecording: jest.fn(),
  generateToken: (...a: unknown[]) => mockGenerateToken(...a),
}));

const params = Promise.resolve({ classId: 'lc1' });
const call = () => GET(new Request('http://x') as never, { params });

const profiles: Record<string, { display_name: string | null; full_name: string | null }> = {
  'u-teacher': { display_name: 'Anna', full_name: 'Anna Teacher' },
  'u-copycat': { display_name: 'Anna', full_name: null },
  'u-other-anna': { display_name: 'Anna', full_name: null },
};

beforeEach(() => {
  mockGetSession.mockReset();
  mockSql.mockReset().mockResolvedValue([]);
  mockGenerateToken.mockReset().mockResolvedValue({ token: 'jwt', serverUrl: 'wss://lk' });
  mockQueryOne.mockReset().mockImplementation((strings: string[], ...values: unknown[]) => {
    const text = strings.join('?');
    if (text.includes('FROM live_classes')) {
      return Promise.resolve({
        id: 'lc1',
        community_id: 'c1',
        teacher_id: 'u-teacher',
        community_created_by: 'u-teacher',
        scheduled_start_time: new Date().toISOString(),
        duration_minutes: 60,
        livekit_room_name: 'live-class-lc1',
        status: 'live',
        enable_recording: false,
        recording_id: null,
      });
    }
    if (text.includes('FROM profiles')) return Promise.resolve(profiles[values[0] as string] ?? null);
    if (text.includes('FROM community_members')) return Promise.resolve({ status: 'active' });
    return Promise.resolve(null);
  });
});

const as = (id: string) => mockGetSession.mockResolvedValue({ user: { id, email: `${id}@x.com` } });

it('uses the user id as the identity, so a member named like the teacher gets their own', async () => {
  as('u-copycat');
  const res = await call();
  const body = await res.json();

  expect(res.status).toBe(200);
  const [room, identity, role, name] = mockGenerateToken.mock.calls[0];
  expect(room).toBe('live-class-lc1');
  expect(identity).toBe('u-copycat');
  expect(identity).not.toBe('Anna');
  expect(name).toBe('Anna');
  expect(role).toBe('viewer');
  expect(body).toMatchObject({
    token: 'jwt',
    isTeacher: false,
    identity: 'u-copycat',
    displayName: 'Anna',
    teacherIdentity: 'u-teacher',
  });
});

it('gives two members with the same name different identities', async () => {
  as('u-copycat');
  await call();
  as('u-other-anna');
  await call();
  expect(mockGenerateToken.mock.calls[0][1]).not.toBe(mockGenerateToken.mock.calls[1][1]);
});

it('gives the teacher an admin token under their user id', async () => {
  as('u-teacher');
  const body = await (await call()).json();
  expect(mockGenerateToken).toHaveBeenCalledWith('live-class-lc1', 'u-teacher', 'admin', 'Anna');
  expect(body).toMatchObject({ isTeacher: true, identity: 'u-teacher', teacherIdentity: 'u-teacher' });
});
