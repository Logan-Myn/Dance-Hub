import { POST } from '@/app/api/community/[communitySlug]/join-paid/route';

const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSetupIntentsCreate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => mockCustomersCreate(...a) },
    subscriptions: { create: (...a: unknown[]) => mockSubscriptionsCreate(...a), cancel: (...a: unknown[]) => mockSubscriptionsCancel(...a) },
    setupIntents: { create: (...a: unknown[]) => mockSetupIntentsCreate(...a) },
  },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = {
  id: 'c1', membership_price: 20, stripe_account_id: 'acct_1', stripe_price_id: 'price_1',
  active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
};

beforeEach(() => {
  [mockCustomersCreate, mockSubscriptionsCreate, mockSubscriptionsCancel, mockSetupIntentsCreate, mockSql, mockQueryOne]
    .forEach((m) => m.mockReset());
});

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

it('attaches the promotion code to the subscription when provided', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null); // community, then no existing member
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1',
    latest_invoice: { id: 'in_1', amount_due: 1600, confirmation_secret: { client_secret: 'pi_secret' } },
  });
  mockSql.mockResolvedValue([]);

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', promotionCodeId: 'promo_1' }), { params });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ clientSecret: 'pi_secret', subscriptionId: 'sub_1' });
  expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ discounts: [{ promotion_code: 'promo_1' }] }),
    { stripeAccount: 'acct_1' },
  );
});

it('returns requiresSetup with a SetupIntent secret when the first invoice is €0', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1',
    latest_invoice: { id: 'in_1', amount_due: 0, confirmation_secret: null },
  });
  mockSetupIntentsCreate.mockResolvedValueOnce({ client_secret: 'seti_secret' });
  mockSql.mockResolvedValue([]);

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', promotionCodeId: 'promo_free' }), { params });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ requiresSetup: true, clientSecret: 'seti_secret', subscriptionId: 'sub_1' });
  expect(mockSetupIntentsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ customer: 'cus_1', usage: 'off_session', metadata: expect.objectContaining({ subscription_id: 'sub_1' }) }),
    { stripeAccount: 'acct_1' },
  );
});

it('rejects a code scoped to a different plan before creating anything in Stripe', async () => {
  // community, then no existing member, then the mirror row scoped to 'yearly'
  mockQueryOne
    .mockResolvedValueOnce(community)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ applies_to_plan: 'yearly' });

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', plan: 'monthly', promotionCodeId: 'promo_yr' }), { params });

  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: 'This code does not apply to the selected plan.' });
  expect(mockCustomersCreate).not.toHaveBeenCalled();
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
});

it('does not attach discounts when no promotion code is given', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1', latest_invoice: { id: 'in_1', amount_due: 2000, confirmation_secret: { client_secret: 'pi_secret' } },
  });
  mockSql.mockResolvedValue([]);

  await POST(req({ userId: 'u1', email: 'u1@x.com' }), { params });

  const createArg = mockSubscriptionsCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(createArg.discounts).toBeUndefined();
});
