/**
 * "Repeat weekly for N weeks" creates every class at once, in one
 * transaction, at the same wall-clock time in the teacher's zone.
 */
import { POST } from '@/app/api/community/[communitySlug]/live-classes/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
jest.mock('@/lib/stream-hub', () => ({ createRoom: jest.fn() }));
jest.mock('@/lib/community-auth', () => ({ requireCommunityViewer: jest.fn() }));

const inserts: unknown[][] = [];
let clash: unknown = null;
const tx = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.join('?');
  if (text.includes('INSERT INTO live_classes')) {
    inserts.push(values);
    return Promise.resolve([{ id: `lc${inserts.length}`, scheduled_start_time: values[4] }]);
  }
  return Promise.resolve(clash ? [clash] : []);
});
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: Object.assign(jest.fn(), { begin: (fn: (t: typeof tx) => unknown) => fn(tx) }),
  query: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const post = (body: unknown) =>
  POST(new Request('http://x/api/community/salsa/live-classes', { method: 'POST', body: JSON.stringify(body) }) as never, { params });

const base = {
  title: 'Floorwork',
  scheduled_start_time: '2099-10-18T17:00:00.000Z',
  duration_minutes: 60,
  repeat_weeks: 3,
  time_zone: 'Europe/Berlin',
};

beforeEach(() => {
  inserts.length = 0;
  clash = null;
  tx.mockClear();
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } });
  mockQueryOne.mockResolvedValue({ id: 'c1', created_by: 'owner' });
});

it('creates every week in one series', async () => {
  const res = await post(base);
  expect(res.status).toBe(201);
  expect((await res.json()).classes).toHaveLength(3);
  expect(inserts).toHaveLength(3);
  const seriesIds = new Set(inserts.map((v) => v[7]));
  expect(seriesIds.size).toBe(1);
  expect([...seriesIds][0]).toEqual(expect.any(String));
});

it('refuses a repeat without a valid time zone, and times in the past', async () => {
  expect((await post({ ...base, time_zone: 'Nowhere/Land' })).status).toBe(400);
  expect((await post({ ...base, scheduled_start_time: '2020-01-01T10:00:00Z' })).status).toBe(400);
  expect(inserts).toHaveLength(0);
});

it('stops the whole series when one date overlaps another class', async () => {
  clash = { title: 'Salsa', scheduled_start_time: '2099-10-25T17:30:00Z' };
  const res = await post(base);
  expect(res.status).toBe(409);
  expect((await res.json()).conflict_at).toBe('2099-10-25T17:30:00.000Z');
});

it('only lets the owner schedule', async () => {
  mockGetSession.mockResolvedValue({ user: { id: 'someone' } });
  expect((await post(base)).status).toBe(403);
});
