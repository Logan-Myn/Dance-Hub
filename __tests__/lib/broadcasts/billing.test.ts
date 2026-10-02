/**
 * @jest-environment node
 */
import {
  createBroadcastSubscriptionIntent,
  upsertBroadcastSubscription,
  markBroadcastSubscriptionStatus,
  recordBroadcastSubscription,
  toBroadcastStatus,
  BroadcastSubscriptionError,
} from '@/lib/broadcasts/billing';

const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsCancel = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => mockCustomersCreate(...a) },
    subscriptions: {
      create: (...a: unknown[]) => mockSubscriptionsCreate(...a),
      retrieve: (...a: unknown[]) => mockSubscriptionsRetrieve(...a),
      cancel: (...a: unknown[]) => mockSubscriptionsCancel(...a),
    },
  },
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}));

const PERIOD_END = 1767225600; // 2026-01-01

/** A subscription as Stripe returns it with latest_invoice.confirmation_secret expanded. */
function stripeSub(over: Record<string, unknown> = {}, invoice: Record<string, unknown> | null = {}) {
  return {
    id: 'sub_new',
    status: 'incomplete',
    customer: 'cus_1',
    items: { data: [{ current_period_end: PERIOD_END }] },
    latest_invoice:
      invoice === null
        ? null
        : { id: 'in_1', status: 'open', confirmation_secret: { client_secret: 'pi_new_secret', type: 'payment_intent' }, ...invoice },
    ...over,
  };
}

const upserts = () =>
  mockSql.mock.calls.filter((c) => /INSERT INTO community_broadcast_subscriptions/.test((c[0] as string[]).join('?')));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_BROADCAST_PRICE_ID = 'price_test_123';
  mockSql.mockResolvedValue([]);
  mockQueryOne.mockResolvedValue(null);
  mockCustomersCreate.mockResolvedValue({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValue(stripeSub());
  mockSubscriptionsCancel.mockResolvedValue({});
});

describe('createBroadcastSubscriptionIntent', () => {
  it("creates a subscription and returns its own invoice's confirmation secret", async () => {
    const result = await createBroadcastSubscriptionIntent({ communityId: 'c1', ownerEmail: 'owner@example.com' });

    expect(result).toEqual({ clientSecret: 'pi_new_secret', subscriptionId: 'sub_new' });
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        metadata: expect.objectContaining({ communityId: 'c1', purpose: 'broadcast_subscription' }),
      }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('c1') })
    );
    const [params, options] = mockSubscriptionsCreate.mock.calls[0];
    expect(params).toEqual(
      expect.objectContaining({
        customer: 'cus_1',
        items: [{ price: 'price_test_123' }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.confirmation_secret'],
        metadata: expect.objectContaining({ communityId: 'c1', purpose: 'broadcast_subscription' }),
      })
    );
    expect(options).toEqual({ idempotencyKey: expect.stringContaining('c1') });

    // Row written with the mapped status and the period end from the item.
    const [upsert] = upserts();
    expect(upsert.slice(1)).toEqual(['c1', 'cus_1', 'sub_new', 'incomplete', new Date(PERIOD_END * 1000)]);
  });

  it('reuses an unpaid incomplete subscription instead of starting a second one', async () => {
    mockQueryOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_old', status: 'incomplete' });
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      stripeSub({ id: 'sub_old' }, { confirmation_secret: { client_secret: 'pi_old_secret', type: 'payment_intent' } })
    );

    const result = await createBroadcastSubscriptionIntent({ communityId: 'c1', ownerEmail: 'o@o.com' });

    expect(result).toEqual({ clientSecret: 'pi_old_secret', subscriptionId: 'sub_old' });
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_old', { expand: ['latest_invoice.confirmation_secret'] });
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it('lets the owner pay the open invoice of a past_due subscription', async () => {
    mockQueryOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_old', status: 'past_due' });
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      stripeSub({ id: 'sub_old', status: 'past_due' }, { confirmation_secret: { client_secret: 'pi_due', type: 'payment_intent' } })
    );

    const result = await createBroadcastSubscriptionIntent({ communityId: 'c1', ownerEmail: 'o@o.com' });

    expect(result.clientSecret).toBe('pi_due');
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it('refuses when the community already has an active subscription', async () => {
    mockQueryOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_old', status: 'active' });
    mockSubscriptionsRetrieve.mockResolvedValueOnce(stripeSub({ id: 'sub_old', status: 'active' }, { status: 'paid' }));

    const attempt = createBroadcastSubscriptionIntent({ communityId: 'c1', ownerEmail: 'o@o.com' });
    await expect(attempt).rejects.toBeInstanceOf(BroadcastSubscriptionError);
    await expect(attempt).rejects.toMatchObject({ httpStatus: 409 });
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it('cancels a subscription that can no longer be paid before starting a new one on the same customer', async () => {
    mockQueryOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_old', status: 'past_due' });
    mockSubscriptionsRetrieve.mockResolvedValueOnce(stripeSub({ id: 'sub_old', status: 'unpaid' }, { status: 'uncollectible' }));

    const result = await createBroadcastSubscriptionIntent({ communityId: 'c1', ownerEmail: 'o@o.com' });

    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_old');
    expect(mockSubscriptionsCancel.mock.invocationCallOrder[0]).toBeLessThan(mockSubscriptionsCreate.mock.invocationCallOrder[0]);
    expect(mockSubscriptionsCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ customer: 'cus_1' }));
    expect(mockSubscriptionsCreate.mock.calls[0][1].idempotencyKey).toContain('sub_old');
    expect(result.subscriptionId).toBe('sub_new');
  });

  it('starts a new subscription after an expired one without cancelling anything', async () => {
    mockQueryOne.mockResolvedValueOnce({ stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_old', status: 'incomplete' });
    mockSubscriptionsRetrieve.mockResolvedValueOnce(stripeSub({ id: 'sub_old', status: 'incomplete_expired' }, { status: 'void' }));

    await createBroadcastSubscriptionIntent({ communityId: 'c1', ownerEmail: 'o@o.com' });

    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    expect(mockSubscriptionsCreate).toHaveBeenCalledTimes(1);
  });

  it('throws when STRIPE_BROADCAST_PRICE_ID is missing', async () => {
    delete process.env.STRIPE_BROADCAST_PRICE_ID;
    await expect(createBroadcastSubscriptionIntent({
      communityId: 'c1', ownerEmail: 'o@o.com',
    })).rejects.toThrow(/STRIPE_BROADCAST_PRICE_ID/);
  });
});

describe('toBroadcastStatus', () => {
  it.each([
    ['active', 'active'],
    ['trialing', 'active'],
    ['incomplete', 'incomplete'],
    ['past_due', 'past_due'],
    ['unpaid', 'past_due'],
    ['paused', 'past_due'],
    ['canceled', 'canceled'],
    ['incomplete_expired', 'canceled'],
  ])('%s -> %s', (stripeStatus, expected) => {
    expect(toBroadcastStatus(stripeStatus)).toBe(expected);
  });
});

describe('recordBroadcastSubscription', () => {
  const stored = (id: string) => mockQueryOne.mockResolvedValueOnce({ stripe_subscription_id: id });

  it('records the stored subscription with a mapped status and the item period end', async () => {
    stored('sub_1');
    const outcome = await recordBroadcastSubscription('c1', stripeSub({ id: 'sub_1', status: 'incomplete_expired' }) as never);
    expect(outcome).toBe('recorded');
    expect(upserts()[0].slice(1)).toEqual(['c1', 'cus_1', 'sub_1', 'canceled', new Date(PERIOD_END * 1000)]);
  });

  it('ignores a stale subscription ending, so the live one keeps the community on the paid tier', async () => {
    stored('sub_live');
    const outcome = await recordBroadcastSubscription('c1', stripeSub({ id: 'sub_stale', status: 'canceled' }) as never);
    expect(outcome).toBe('ignored');
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('takes over when another subscription of the community becomes active', async () => {
    stored('sub_abandoned');
    const outcome = await recordBroadcastSubscription('c1', stripeSub({ id: 'sub_paid', status: 'active' }) as never);
    expect(outcome).toBe('recorded');
    expect(upserts()[0].slice(1)).toEqual(['c1', 'cus_1', 'sub_paid', 'active', new Date(PERIOD_END * 1000)]);
  });

  it('records the first subscription of a community', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    expect(await recordBroadcastSubscription('c1', stripeSub({ id: 'sub_1', status: 'active' }) as never)).toBe('recorded');
    expect(upserts()).toHaveLength(1);
  });

  it('updates by subscription id when the event has no community id', async () => {
    await recordBroadcastSubscription(undefined, stripeSub({ id: 'sub_1', status: 'unpaid' }) as never);
    const [update] = mockSql.mock.calls;
    expect((update[0] as string[]).join('?')).toMatch(/WHERE stripe_subscription_id = \?/);
    expect(update.slice(1)).toEqual(['past_due', new Date(PERIOD_END * 1000), 'sub_1']);
  });
});

describe('upsertBroadcastSubscription', () => {
  it('inserts a new subscription row with ON CONFLICT update', async () => {
    await upsertBroadcastSubscription({
      communityId: 'c1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      status: 'active',
      currentPeriodEnd: new Date('2026-05-01'),
    });
    const sqlText = mockSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/INSERT INTO community_broadcast_subscriptions/);
    expect(sqlText).toMatch(/ON CONFLICT/);
  });
});

describe('markBroadcastSubscriptionStatus', () => {
  it('updates by stripe_subscription_id', async () => {
    await markBroadcastSubscriptionStatus('sub_1', 'canceled', null);
    const sqlText = mockSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/UPDATE community_broadcast_subscriptions/);
    expect(sqlText).toMatch(/stripe_subscription_id/);
  });
});
