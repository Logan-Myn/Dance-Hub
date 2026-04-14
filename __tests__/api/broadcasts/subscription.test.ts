import { POST } from '@/app/api/community/[communitySlug]/broadcasts/subscription/route';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { createBroadcastCheckoutSession } from '@/lib/broadcasts/billing';

jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), sql: jest.fn() }));
jest.mock('@/lib/broadcasts/billing', () => ({ createBroadcastCheckoutSession: jest.fn() }));
jest.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { update: jest.fn().mockResolvedValue({}) } },
}));

describe('POST subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns checkout URL for owner', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', created_by: 'u1', slug: 'salsa' });
    (createBroadcastCheckoutSession as jest.Mock).mockResolvedValueOnce({
      checkoutUrl: 'https://checkout.url',
      sessionId: 'cs_1',
    });
    const req = new Request('http://localhost', { method: 'POST' });
    const res = await POST(req, { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ checkoutUrl: 'https://checkout.url' });
  });
});
