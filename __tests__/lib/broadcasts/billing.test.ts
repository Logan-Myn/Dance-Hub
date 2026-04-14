import {
  createBroadcastCheckoutSession,
  upsertBroadcastSubscription,
  markBroadcastSubscriptionStatus,
} from '@/lib/broadcasts/billing';

const mockCreateCheckout = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: (...a: unknown[]) => mockCreateCheckout(...a) } } },
}));

const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  queryOne: jest.fn(),
}));

describe('createBroadcastCheckoutSession', () => {
  beforeEach(() => {
    mockCreateCheckout.mockReset();
    process.env.STRIPE_BROADCAST_PRICE_ID = 'price_test_123';
  });

  it('creates a Stripe Checkout session with community metadata', async () => {
    mockCreateCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/test', id: 'cs_1' });

    const result = await createBroadcastCheckoutSession({
      communityId: 'c1',
      communitySlug: 'salsa',
      ownerEmail: 'owner@example.com',
      returnUrl: 'https://app/admin/emails',
    });

    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/test', sessionId: 'cs_1' });
    expect(mockCreateCheckout).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      line_items: [{ price: 'price_test_123', quantity: 1 }],
      customer_email: 'owner@example.com',
      metadata: expect.objectContaining({ communityId: 'c1', purpose: 'broadcast_subscription' }),
      success_url: expect.stringContaining('salsa'),
      cancel_url: expect.stringContaining('salsa'),
    }));
  });

  it('throws when STRIPE_BROADCAST_PRICE_ID is missing', async () => {
    delete process.env.STRIPE_BROADCAST_PRICE_ID;
    await expect(createBroadcastCheckoutSession({
      communityId: 'c1', communitySlug: 'salsa', ownerEmail: 'o@o.com', returnUrl: '',
    })).rejects.toThrow(/STRIPE_BROADCAST_PRICE_ID/);
  });
});

describe('upsertBroadcastSubscription', () => {
  beforeEach(() => mockSql.mockReset());

  it('inserts a new subscription row with ON CONFLICT update', async () => {
    mockSql.mockResolvedValueOnce([]);
    await upsertBroadcastSubscription({
      communityId: 'c1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      status: 'active',
      currentPeriodEnd: new Date('2026-05-01'),
    });
    expect(mockSql).toHaveBeenCalled();
    const sqlText = mockSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/INSERT INTO community_broadcast_subscriptions/);
    expect(sqlText).toMatch(/ON CONFLICT/);
  });
});

describe('markBroadcastSubscriptionStatus', () => {
  beforeEach(() => mockSql.mockReset());

  it('updates by stripe_subscription_id', async () => {
    mockSql.mockResolvedValueOnce([]);
    await markBroadcastSubscriptionStatus('sub_1', 'canceled', null);
    const sqlText = mockSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/UPDATE community_broadcast_subscriptions/);
    expect(sqlText).toMatch(/stripe_subscription_id/);
  });
});
