import {
  createBroadcastSubscriptionIntent,
  upsertBroadcastSubscription,
  markBroadcastSubscriptionStatus,
} from '@/lib/broadcasts/billing';

const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockPaymentIntentsList = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => mockCustomersCreate(...a) },
    subscriptions: { create: (...a: unknown[]) => mockSubscriptionsCreate(...a) },
    paymentIntents: { list: (...a: unknown[]) => mockPaymentIntentsList(...a) },
  },
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}));

describe('createBroadcastSubscriptionIntent', () => {
  beforeEach(() => {
    mockCustomersCreate.mockReset();
    mockSubscriptionsCreate.mockReset();
    mockPaymentIntentsList.mockReset();
    mockSql.mockReset();
    mockQueryOne.mockReset();
    process.env.STRIPE_BROADCAST_PRICE_ID = 'price_test_123';
  });

  it('creates a Stripe Subscription with PaymentIntent client_secret and upserts the DB row', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // no existing subscription -> create new customer
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
    mockSubscriptionsCreate.mockResolvedValueOnce({
      id: 'sub_1',
      current_period_end: 1735689600, // 2025-01-01
    });
    mockPaymentIntentsList.mockResolvedValueOnce({
      data: [{ client_secret: 'pi_secret_abc' }],
    });
    mockSql.mockResolvedValueOnce([]);

    const result = await createBroadcastSubscriptionIntent({
      communityId: 'c1',
      ownerEmail: 'owner@example.com',
    });

    expect(result).toEqual({ clientSecret: 'pi_secret_abc', subscriptionId: 'sub_1' });
    expect(mockCustomersCreate).toHaveBeenCalledWith(expect.objectContaining({
      email: 'owner@example.com',
      metadata: expect.objectContaining({ communityId: 'c1', purpose: 'broadcast_subscription' }),
    }));
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1',
      items: [{ price: 'price_test_123' }],
      payment_behavior: 'default_incomplete',
      metadata: expect.objectContaining({ communityId: 'c1', purpose: 'broadcast_subscription' }),
    }));
    expect(mockPaymentIntentsList).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1',
    }));
    // The DB upsert is invoked as part of the intent creation
    expect(mockSql).toHaveBeenCalled();
    const sqlText = mockSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/INSERT INTO community_broadcast_subscriptions/);
  });

  it('throws when STRIPE_BROADCAST_PRICE_ID is missing', async () => {
    delete process.env.STRIPE_BROADCAST_PRICE_ID;
    await expect(createBroadcastSubscriptionIntent({
      communityId: 'c1', ownerEmail: 'o@o.com',
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
