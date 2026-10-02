/**
 * Platform admin user and community edits: deletes report "not found"
 * instead of a fake success, optional fields never reach postgres.js as
 * undefined, an email change keeps "user", profiles and email_preferences in
 * step, and an admin slug edit follows the same rule as create.
 */
import { DELETE as deleteUser, PATCH as patchUser } from '@/app/api/admin/users/[userId]/route';
import { PATCH as patchCommunity } from '@/app/api/admin/communities/[communityId]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

jest.mock('@/lib/subscription-cancel', () => ({
  cancelMemberSubscriptions: jest.fn().mockResolvedValue([]),
  cancelSubscriptionNow: jest.fn(),
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
const mockQuery = jest.fn();
// Like postgres.js, refuse undefined parameters.
const strict = (fn: jest.Mock) => (strings: string[], ...values: unknown[]) => {
  if (values.some((v) => v === undefined)) {
    return Promise.reject(new Error('UNDEFINED_VALUE: Undefined values are not allowed'));
  }
  return fn(strings, ...values);
};
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => strict(mockSql)(...(a as [string[], ...unknown[]])),
  queryOne: (...a: unknown[]) => strict(mockQueryOne)(...(a as [string[], ...unknown[]])),
  query: (...a: unknown[]) => strict(mockQuery)(...(a as [string[], ...unknown[]])),
}));

const text = (call: unknown[]) => (call[0] as string[]).join('?');
const sqlCalls = (re: RegExp) => mockSql.mock.calls.filter((c) => re.test(text(c)));

let targetUser: { id: string; email: string } | null;
let emailTakenBy: string | null;
let community: { id: string } | null;
let slugTakenBy: string | null;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetSession.mockResolvedValue({ user: { id: 'admin' } });
  targetUser = { id: 'u1', email: 'old@example.com' };
  emailTakenBy = null;
  community = { id: 'c1' };
  slugTakenBy = null;
  mockSql.mockResolvedValue([{ id: 'row' }]);
  mockQuery.mockResolvedValue([]);
  mockQueryOne.mockImplementation(async (strings: string[]) => {
    const t = strings.join('?');
    if (/FROM profiles/.test(t)) return { id: 'p-admin', is_admin: true };
    if (/FROM "user"/.test(t) && /id != /.test(t)) return emailTakenBy ? { id: emailTakenBy } : null;
    if (/FROM "user"/.test(t)) return targetUser;
    if (/COUNT\(\*\)/.test(t) && /FROM communities/.test(t)) return { count: 0 };
    if (/FROM communities/.test(t) && /id != /.test(t)) return slugTakenBy ? { id: slugTakenBy } : null;
    if (/UPDATE communities/.test(t)) return community;
    return null;
  });
});

describe('DELETE /api/admin/users/[userId]', () => {
  const del = (userId: string) =>
    deleteUser(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ userId }) });

  it('returns 404 and deletes nothing for an unknown user id (e.g. a profile id)', async () => {
    targetUser = null;
    const res = await del('profile-uuid');
    expect(res.status).toBe(404);
    expect(sqlCalls(/DELETE FROM/)).toHaveLength(0);
  });

  it('deletes an existing user', async () => {
    const res = await del('u1');
    expect(res.status).toBe(200);
    expect(sqlCalls(/DELETE FROM "user"/)).toHaveLength(1);
  });
});

describe('PATCH /api/admin/users/[userId]', () => {
  const patch = (body: object, userId = 'u1') =>
    patchUser(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), {
      params: Promise.resolve({ userId }),
    });

  it('updates only the fields sent (no undefined reaches the database)', async () => {
    const res = await patch({ display_name: 'Ana' });
    expect(res.status).toBe(200);
    const [update] = sqlCalls(/UPDATE profiles/);
    expect(text(update)).toMatch(/COALESCE/);
    expect(update.slice(1)).toContain('Ana');
    expect(sqlCalls(/UPDATE "user"/)).toHaveLength(0);
  });

  it('returns 404 for an unknown user', async () => {
    targetUser = null;
    const res = await patch({ display_name: 'Ana' }, 'nope');
    expect(res.status).toBe(404);
    expect(sqlCalls(/UPDATE/)).toHaveLength(0);
  });

  it('changes the email on the auth user and copies it to profiles and email_preferences', async () => {
    const res = await patch({ full_name: 'Ana B', display_name: 'Ana', email: '  New@Example.com ' });
    expect(res.status).toBe(200);

    const [userUpdate] = sqlCalls(/UPDATE "user"/);
    expect(userUpdate.slice(1)).toContain('new@example.com');
    const profileEmail = sqlCalls(/UPDATE profiles/).find((c) => /SET email/.test(text(c)));
    expect(profileEmail!.slice(1)).toContain('new@example.com');
    const prefs = sqlCalls(/UPDATE email_preferences/);
    expect(prefs).toHaveLength(1);
    expect(prefs[0].slice(1)).toContain('new@example.com');
    // "user" first: it holds the unique constraint and is what sign-in reads.
    expect(mockSql.mock.calls.indexOf(userUpdate)).toBeLessThan(mockSql.mock.calls.indexOf(prefs[0]));
  });

  it('refuses an email that belongs to another user', async () => {
    emailTakenBy = 'u2';
    const res = await patch({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
    expect(sqlCalls(/UPDATE/)).toHaveLength(0);
  });

  it('refuses an invalid email', async () => {
    const res = await patch({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(sqlCalls(/UPDATE/)).toHaveLength(0);
  });

  it('does not touch "user" when the email is unchanged', async () => {
    const res = await patch({ email: 'old@example.com', display_name: 'Ana' });
    expect(res.status).toBe(200);
    expect(sqlCalls(/UPDATE "user"/)).toHaveLength(0);
    expect(sqlCalls(/UPDATE email_preferences/)).toHaveLength(0);
  });

  it('refuses addToCommunity instead of ignoring it', async () => {
    const res = await patch({ addToCommunity: 'c1' });
    expect(res.status).toBe(400);
    expect(sqlCalls(/UPDATE|INSERT/)).toHaveLength(0);
  });

  it('refuses non-admins', async () => {
    mockQueryOne.mockImplementationOnce(async () => ({ id: 'p', is_admin: false }));
    const res = await patch({ display_name: 'Ana' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/communities/[communityId]', () => {
  const patch = (body: object) =>
    patchCommunity(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), {
      params: Promise.resolve({ communityId: 'c1' }),
    });
  const update = () => mockQueryOne.mock.calls.find((c) => /UPDATE communities/.test(text(c)));

  it('keeps the description when it is omitted', async () => {
    const res = await patch({ name: 'Salsa', slug: 'salsa' });
    expect(res.status).toBe(200);
    expect(text(update()!)).toMatch(/COALESCE/);
  });

  it('normalises the slug like create', async () => {
    const res = await patch({ name: 'Salsa', slug: 'Salsa Paris', description: 'd' });
    expect(res.status).toBe(200);
    expect(update()!.slice(1)).toContain('salsa-paris');
  });

  it.each(['dashboard', 'Admin', '!!!'])('refuses the slug %j', async (slug) => {
    const res = await patch({ name: 'Salsa', slug, description: 'd' });
    expect(res.status).toBe(400);
    expect(update()).toBeUndefined();
  });

  it('refuses a slug another community has, ignoring case', async () => {
    slugTakenBy = 'c2';
    const res = await patch({ name: 'Salsa', slug: 'Salsa-Paris', description: 'd' });
    expect(res.status).toBe(400);
    const check = mockQueryOne.mock.calls.find((c) => /id != /.test(text(c)) && /communities/.test(text(c)))!;
    expect(text(check)).toMatch(/LOWER\(slug\)/);
    expect(update()).toBeUndefined();
  });

  it('returns 404 for an unknown community', async () => {
    community = null;
    const res = await patch({ name: 'Salsa', slug: 'salsa', description: 'd' });
    expect(res.status).toBe(404);
  });
});
