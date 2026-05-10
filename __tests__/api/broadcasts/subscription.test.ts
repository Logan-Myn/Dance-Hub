import { POST } from '@/app/api/community/[communitySlug]/broadcasts/subscription/route';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { createBroadcastSubscriptionIntent } from '@/lib/broadcasts/billing';
import { NextResponse } from 'next/server';

jest.mock('@/lib/broadcasts/auth', () => ({
  authorizeBroadcastAccess: jest.fn(),
}));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), sql: jest.fn() }));
jest.mock('@/lib/broadcasts/billing', () => ({
  createBroadcastSubscriptionIntent: jest.fn(),
}));
jest.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { update: jest.fn().mockResolvedValue({}) } },
}));

const mockedAuthz = authorizeBroadcastAccess as jest.Mock;
const mockedIntent = createBroadcastSubscriptionIntent as jest.Mock;

describe('POST subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns subscription client_secret for owner', async () => {
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
    mockedIntent.mockResolvedValueOnce({
      clientSecret: 'pi_secret_abc',
      subscriptionId: 'sub_1',
    });
    const req = new Request('http://localhost', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ communitySlug: 'salsa' }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ clientSecret: 'pi_secret_abc' });
    expect(mockedIntent).toHaveBeenCalledWith({
      communityId: 'c1',
      ownerEmail: 'o@o.com',
    });
  });

  it('returns auth response when access denied', async () => {
    mockedAuthz.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const req = new Request('http://localhost', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ communitySlug: 'salsa' }) });
    expect(res.status).toBe(403);
  });
});
