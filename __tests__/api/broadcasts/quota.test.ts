import { GET } from '@/app/api/community/[communitySlug]/broadcasts/quota/route';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { getQuota } from '@/lib/broadcasts/quota';
import { NextResponse } from 'next/server';

jest.mock('@/lib/broadcasts/auth', () => ({
  authorizeBroadcastAccess: jest.fn(),
}));
jest.mock('@/lib/broadcasts/quota', () => ({ getQuota: jest.fn() }));

const mockedAuthz = authorizeBroadcastAccess as jest.Mock;
const mockedQuota = getQuota as jest.Mock;

const makeReq = () =>
  new Request('http://localhost/api/community/salsa/broadcasts/quota');

describe('GET broadcasts/quota', () => {
  beforeEach(() => {
    mockedAuthz.mockReset();
    mockedQuota.mockReset();
  });

  it('returns the auth response when access is denied', async () => {
    mockedAuthz.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });

  it('returns the quota when access is granted', async () => {
    mockedAuthz.mockResolvedValueOnce({
      ok: true,
      session: { user: { id: 'u1', email: 'o@o.com' } },
      community: {
        id: 'c1',
        name: 'Salsa',
        slug: 'salsa',
        created_by: 'u1',
        is_broadcast_vip: false,
      },
    });
    mockedQuota.mockResolvedValueOnce({ tier: 'free', used: 3, limit: 10 });

    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tier: 'free', used: 3, limit: 10 });
    expect(mockedQuota).toHaveBeenCalledWith('c1');
  });
});
