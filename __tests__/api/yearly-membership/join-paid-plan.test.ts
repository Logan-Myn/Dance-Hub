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
  id: 'c1', membership_price: 20, stripe_account_id: 'acct_1', stripe_price_id: 'price_month',
  stripe_yearly_price_id: 'price_year', yearly_enabled: true,
  active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
};

beforeEach(() => {
  [mockCustomersCreate, mockSubscriptionsCreate, mockSubscriptionsCancel, mockSetupIntentsCreate, mockSql, mockQueryOne]
    .forEach((m) => m.mockReset());
});

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

function stubSubscriptionOk() {
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1', latest_invoice: { id: 'in_1', amount_due: 20000, confirmation_secret: { client_secret: 'pi_secret' } },
  });
  mockSql.mockResolvedValue([]);
}

it('subscribes on the yearly price when plan is yearly', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  stubSubscriptionOk();

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', plan: 'yearly' }), { params });

  expect(res.status).toBe(200);
  expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ items: [{ price: 'price_year' }] }),
    { stripeAccount: 'acct_1' },
  );
});

it('subscribes on the monthly price when plan is omitted', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  stubSubscriptionOk();

  await POST(req({ userId: 'u1', email: 'u1@x.com' }), { params });

  expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ items: [{ price: 'price_month' }] }),
    { stripeAccount: 'acct_1' },
  );
});

it('rejects a yearly plan when the community has no yearly price configured', async () => {
  mockQueryOne.mockResolvedValueOnce({ ...community, yearly_enabled: false, stripe_yearly_price_id: null }).mockResolvedValueOnce(null);

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', plan: 'yearly' }), { params });

  expect(res.status).toBe(400);
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
});
