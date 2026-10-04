/**
 * A community without topics takes posts without one (16 of 19 prod
 * communities had none, so nobody could post there). With topics, one is
 * still required.
 */
import { POST as createPOST } from '@/app/api/threads/create/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));
jest.mock('@/lib/community-auth', () => ({
  canViewCommunity: jest.fn().mockResolvedValue(true),
}));

let categories: unknown[] = [];

function post(body: unknown) {
  return createPOST(
    new Request('http://localhost/api/threads/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

const insertValues = () =>
  mockQueryOne.mock.calls.find((c) => (c[0] as string[]).join('?').includes('INSERT INTO threads'))?.slice(1);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (text.includes('FROM communities')) return Promise.resolve({ created_by: 'owner', thread_categories: categories });
    if (text.includes('FROM profiles')) return Promise.resolve({ full_name: 'U One', display_name: null, avatar_url: null });
    if (text.includes('INSERT INTO threads')) return Promise.resolve({ id: 't1' });
    return Promise.resolve(null);
  });
});

it('posts without a topic when the community has none', async () => {
  categories = [];
  const res = await post({ title: 'Hello', content: '<p>Hi</p>', communityId: 'c1' });
  expect(res.status).toBe(200);
  const values = insertValues()!;
  // Values: title, content, community, user (x2), author name, image, category_id, category_name, pinned.
  expect(values[7]).toBeNull();
  expect(values[8]).toBeNull();
});

it('still requires a topic when the community has some', async () => {
  categories = [{ id: 'cat1', name: 'Q&A' }];
  const res = await post({ title: 'Hello', content: '<p>Hi</p>', communityId: 'c1' });
  expect(res.status).toBe(400);
  expect(insertValues()).toBeUndefined();
});

it('rejects a topic that is not in the community', async () => {
  categories = [{ id: 'cat1', name: 'Q&A' }];
  const res = await post({ title: 'Hello', content: '<p>Hi</p>', communityId: 'c1', categoryId: 'nope' });
  expect(res.status).toBe(404);
});
