import { GET } from '@/app/api/community/[communitySlug]/broadcasts/quota/route';
import { getSession } from '@/lib/auth-session';
import { getQuota } from '@/lib/broadcasts/quota';
import { queryOne } from '@/lib/db';

jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/broadcasts/quota', () => ({ getQuota: jest.fn() }));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn() }));

const mockedSession = getSession as jest.Mock;
const mockedQuota = getQuota as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;

const makeReq = () => new Request('http://localhost/api/community/salsa/broadcasts/quota');

describe('GET broadcasts/quota', () => {
  beforeEach(() => {
    mockedSession.mockReset();
    mockedQuota.mockReset();
    mockedQueryOne.mockReset();
  });

  it('returns 401 when not logged in', async () => {
    mockedSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(401);
  });

  it('returns 403 when not the community owner', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: 'user-2' } });
    mockedQueryOne.mockResolvedValueOnce({ id: 'c1', created_by: 'user-1' });
    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });

  it('returns quota when owner', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockedQueryOne.mockResolvedValueOnce({ id: 'c1', created_by: 'user-1' });
    mockedQuota.mockResolvedValueOnce({ tier: 'free', used: 3, limit: 10 });
    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tier: 'free', used: 3, limit: 10 });
  });
});
