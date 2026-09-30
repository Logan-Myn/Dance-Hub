import { NextResponse } from 'next/server';
import { POST } from '@/app/api/community/[communitySlug]/update-price/route';

const mockProductsCreate = jest.fn();
const mockPricesCreate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    products: { create: (...a: unknown[]) => mockProductsCreate(...a) },
    prices: { create: (...a: unknown[]) => mockPricesCreate(...a) },
  },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: (...a: unknown[]) => mockQueryOne(...a) }));
const mockRequireCommunityManager = jest.fn();
jest.mock('@/lib/community-auth', () => ({
  requireCommunityManager: (...a: unknown[]) => mockRequireCommunityManager(...a),
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = {
  id: 'c1', name: 'Salsa', created_by: 'owner1',
  stripe_product_id: 'prod_1', stripe_account_id: 'acct_1',
};

beforeEach(() => {
  [mockProductsCreate, mockPricesCreate, mockSql, mockQueryOne, mockRequireCommunityManager].forEach((m) => m.mockReset());
  mockRequireCommunityManager.mockResolvedValue({
    ok: true,
    session: { user: { id: 'owner1' } },
    community: { id: 'c1', slug: 'salsa', name: 'Salsa', created_by: 'owner1', stripe_account_id: 'acct_1' },
  });
});

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

it('creates a yearly Stripe price on the existing product and persists it', async () => {
  mockQueryOne.mockResolvedValueOnce(community);
  mockPricesCreate
    .mockResolvedValueOnce({ id: 'price_month' })  // monthly
    .mockResolvedValueOnce({ id: 'price_year' });   // yearly
  mockSql.mockResolvedValue([]);

  const res = await POST(
    req({ price: 20, enabled: true, yearlyEnabled: true, yearlyPrice: 200, yearlyBenefits: '2 months free plus a private class.' }),
    { params },
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ stripe_yearly_price_id: 'price_year' });
  // yearly price uses the year interval and the same product
  expect(mockPricesCreate).toHaveBeenCalledWith(
    expect.objectContaining({ product: 'prod_1', unit_amount: 20000, recurring: { interval: 'year' } }),
    { stripeAccount: 'acct_1' },
  );
});

it('does not create a yearly price when yearlyEnabled is false', async () => {
  mockQueryOne.mockResolvedValueOnce(community);
  mockPricesCreate.mockResolvedValueOnce({ id: 'price_month' });
  mockSql.mockResolvedValue([]);

  await POST(req({ price: 20, enabled: true, yearlyEnabled: false, yearlyPrice: 0 }), { params });

  const intervals = mockPricesCreate.mock.calls.map((c) => (c[0] as any).recurring?.interval);
  expect(intervals).not.toContain('year');
});

it('rejects callers who do not manage the community before touching Stripe or the DB', async () => {
  mockRequireCommunityManager.mockResolvedValueOnce({
    ok: false,
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  });

  const res = await POST(req({ price: 1, enabled: true }), { params });

  expect(res.status).toBe(403);
  expect(mockRequireCommunityManager).toHaveBeenCalledWith('salsa');
  expect(mockQueryOne).not.toHaveBeenCalled();
  expect(mockPricesCreate).not.toHaveBeenCalled();
  expect(mockSql).not.toHaveBeenCalled();
});
