/**
 * The calendar asks for a week as UTC instants (half-open). The server must
 * use them as instants, not re-read local dates as UTC days, or classes near
 * the week boundary fall out of every week for viewers west/east of UTC.
 */
import { GET } from '@/app/api/community/[communitySlug]/live-classes/route';

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  query: (...a: unknown[]) => mockQuery(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));
jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/stream-hub', () => ({ createRoom: jest.fn() }));

const params = Promise.resolve({ communitySlug: 'salsa' });
const get = (qs: string) => GET(new Request(`http://x/api/community/salsa/live-classes${qs}`) as never, { params });

const queryText = () => (mockQuery.mock.calls[0][0] as string[]).join('?');
const queryValues = () => mockQuery.mock.calls[0].slice(1);

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([]);
  mockQueryOne.mockReset().mockResolvedValue({ id: 'c1' });
});

it('filters on the exact UTC instants the client sends, end exclusive', async () => {
  const start = '2026-09-27T04:00:00.000Z';
  const end = '2026-10-04T04:00:00.000Z';
  const res = await get(`?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);

  expect(res.status).toBe(200);
  expect(queryText()).toMatch(/scheduled_start_time >= \?/);
  expect(queryText()).toMatch(/scheduled_start_time < \?/);
  expect(queryText()).not.toMatch(/scheduled_start_time <= \?/);
  expect(queryValues()).toEqual(['c1', start, end]);
});

it('still accepts bare dates from older clients as whole UTC days', async () => {
  await get('?start=2026-09-27&end=2026-10-03');
  expect(queryValues()).toEqual(['c1', '2026-09-27T00:00:00.000Z', '2026-10-04T00:00:00.000Z']);
});

it('rejects a malformed range instead of guessing', async () => {
  const res = await get('?start=2026-09-27T00:00:00&end=nope');
  expect(res.status).toBe(400);
  expect(mockQuery).not.toHaveBeenCalled();
});
