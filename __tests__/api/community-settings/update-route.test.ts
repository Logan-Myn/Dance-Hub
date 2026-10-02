/**
 * Owner settings update: the opening-date lock and the pre-registration rules
 * are enforced on the server, statuses are allow-listed, and slugs are
 * normalised and checked like on create.
 */
import { PUT } from '@/app/api/community/[communitySlug]/update/route';
import { PRE_REGISTRATIONS_LOCK_MESSAGE } from '@/lib/community-status';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockCanManage = jest.fn();
jest.mock('@/lib/community-auth', () => ({
  userCanManageCommunity: (...a: unknown[]) => mockCanManage(...a),
}));

const mockQueryOne = jest.fn();
const mockSql = jest.fn();
jest.mock('@/lib/db', () => {
  const sql = (...a: unknown[]) => mockSql(...a);
  sql.json = (v: unknown) => ({ json: v });
  return { sql, queryOne: (...a: unknown[]) => mockQueryOne(...a), query: jest.fn() };
});

const FUTURE = new Date(Date.now() + 20 * 24 * 3600 * 1000);
const LATER = new Date(Date.now() + 40 * 24 * 3600 * 1000);

type Row = Record<string, unknown>;
let community: Row;
let preRegistrations: number;
let slugTakenBy: string | null;

const text = (call: unknown[]) => (call[0] as string[]).join('?');
const updateCall = () => mockQueryOne.mock.calls.find((c) => /UPDATE communities/.test(text(c)));
/** Value interpolated right after `column = ` in the UPDATE. */
function updated(column: string): unknown {
  const call = updateCall()!;
  const strings = call[0] as string[];
  const i = strings.findIndex((s) => new RegExp(`\\b${column}\\s*=\\s*$`).test(s));
  if (i < 0) throw new Error(`${column} is not set by the UPDATE`);
  return call[i + 1];
}

function put(body: Row) {
  return PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ communitySlug: 'salsa' }),
  });
}

const base = {
  name: 'Salsa',
  slug: 'salsa',
  description: 'd',
  imageUrl: 'https://img',
  customLinks: [],
};

beforeEach(() => {
  [mockGetSession, mockCanManage, mockQueryOne, mockSql].forEach((m) => m.mockReset());
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } });
  mockCanManage.mockResolvedValue(true);
  community = {
    id: 'c1',
    slug: 'salsa',
    status: 'pre_registration',
    opening_date: FUTURE,
    can_change_opening_date: true,
  };
  preRegistrations = 0;
  slugTakenBy = null;
  mockQueryOne.mockImplementation(async (strings: string[], ...values: unknown[]) => {
    const q = strings.join('?');
    if (/UPDATE communities/.test(q)) {
      const slug = values[strings.findIndex((s) => /\bslug\s*=\s*$/.test(s))];
      return { ...community, name: 'Salsa', slug, custom_links: [] };
    }
    if (/FROM community_members/.test(q)) return { count: preRegistrations };
    if (/FROM communities/.test(q) && /id != /.test(q)) return slugTakenBy ? { id: slugTakenBy } : null;
    if (/FROM communities/.test(q)) return community;
    return null;
  });
});

describe('opening date and status', () => {
  it('refuses a direct PUT that moves a locked opening date', async () => {
    community.can_change_opening_date = false;
    const res = await put({ ...base, status: 'pre_registration', opening_date: LATER.toISOString() });
    expect(res.status).toBe(403);
    expect(updateCall()).toBeUndefined();
  });

  it('refuses to move the opening date once people have pre-registered', async () => {
    preRegistrations = 2;
    const res = await put({ ...base, status: 'pre_registration', opening_date: LATER.toISOString() });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(PRE_REGISTRATIONS_LOCK_MESSAGE);
    expect(updateCall()).toBeUndefined();
  });

  it('refuses to open early once people have pre-registered', async () => {
    preRegistrations = 1;
    const res = await put({ ...base, status: 'active', opening_date: null });
    expect(res.status).toBe(409);
    expect(updateCall()).toBeUndefined();
  });

  it('still saves other settings while people are pre-registered', async () => {
    preRegistrations = 3;
    const res = await put({ ...base, name: 'Salsa Club', slug: 'salsa', status: 'pre_registration', opening_date: FUTURE.toISOString() });
    expect(res.status).toBe(200);
    expect(updateCall()).toBeDefined();
    expect(updated('status')).toBe('pre_registration');
    expect(updated('opening_date')).toEqual(FUTURE);
  });

  it('opens early and clears the date when nobody has pre-registered', async () => {
    const res = await put({ ...base, status: 'active', opening_date: null });
    expect(res.status).toBe(200);
    expect(updated('status')).toBe('active');
    expect(updated('opening_date')).toBeNull();
  });

  it('refuses an unknown status', async () => {
    const res = await put({ ...base, status: 'archived', opening_date: null });
    expect(res.status).toBe(400);
    expect(updateCall()).toBeUndefined();
  });

  it('refuses a pre-registration date in the past', async () => {
    community.status = 'active';
    community.opening_date = null;
    const res = await put({ ...base, status: 'pre_registration', opening_date: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(updateCall()).toBeUndefined();
  });
});

describe('slug', () => {
  it('normalises the slug before checking and storing it', async () => {
    const res = await put({ ...base, slug: 'Salsa-Paris', status: 'pre_registration', opening_date: FUTURE.toISOString() });
    expect(res.status).toBe(200);
    expect(updated('slug')).toBe('salsa-paris');
    expect((await res.json()).data.slug).toBe('salsa-paris');
  });

  it('refuses a slug that differs only in case from another community', async () => {
    slugTakenBy = 'c2';
    const res = await put({ ...base, slug: 'Salsa-Paris', status: 'pre_registration', opening_date: FUTURE.toISOString() });
    expect(res.status).toBe(400);
    const check = mockQueryOne.mock.calls.find((c) => /id != /.test(text(c)))!;
    expect(text(check)).toMatch(/LOWER\(slug\)/);
    expect(check).toContain('salsa-paris');
    expect(updateCall()).toBeUndefined();
  });

  it.each(['Dashboard', 'discovery', '../admin'])('refuses the reserved slug %j', async (slug) => {
    const res = await put({ ...base, slug, status: 'pre_registration', opening_date: FUTURE.toISOString() });
    expect(res.status).toBe(400);
    expect(updateCall()).toBeUndefined();
  });

  it('refuses a slug with no letters or digits', async () => {
    const res = await put({ ...base, slug: '!!!', status: 'pre_registration', opening_date: FUTURE.toISOString() });
    expect(res.status).toBe(400);
  });
});

describe('create uses the same slug rule', () => {
  // Loaded lazily so the create route shares this file's mocks.
  const create = () => require('@/app/api/community/create/route').POST as (r: Request) => Promise<Response>;
  const post = (body: Row) =>
    create()(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

  it('refuses a name that would take a reserved path', async () => {
    const res = await post({ name: 'Dashboard' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reserved/);
    expect(mockQueryOne.mock.calls.some((c) => /INSERT INTO communities/.test(text(c)))).toBe(false);
  });

  it('refuses a name that gives no slug', async () => {
    const res = await post({ name: '舞蹈' });
    expect(res.status).toBe(400);
  });
});
