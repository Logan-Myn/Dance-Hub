import { POST } from '@/app/api/community/[communitySlug]/broadcasts/subscription/route';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { createBroadcastCheckoutSession } from '@/lib/broadcasts/billing';
import { NextResponse } from 'next/server';

jest.mock('@/lib/broadcasts/auth', () => ({
  authorizeBroadcastAccess: jest.fn(),
}));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), sql: jest.fn() }));
jest.mock('@/lib/broadcasts/billing', () => ({
  createBroadcastCheckoutSession: jest.fn(),
}));
jest.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { update: jest.fn().mockResolvedValue({}) } },
}));

const mockedAuthz = authorizeBroadcastAccess as jest.Mock;
const mockedCheckout = createBroadcastCheckoutSession as jest.Mock;

describe('POST subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns checkout URL for owner', async () => {
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
    mockedCheckout.mockResolvedValueOnce({
      checkoutUrl: 'https://checkout.url',
      sessionId: 'cs_1',
    });
    const req = new Request('http://localhost', { method: 'POST' });
    const res = await POST(req, { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ checkoutUrl: 'https://checkout.url' });
  });

  it('returns auth response when access denied', async () => {
    mockedAuthz.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const req = new Request('http://localhost', { method: 'POST' });
    const res = await POST(req, { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });
});
