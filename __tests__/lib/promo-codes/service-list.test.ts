import { listPromoCodes } from '@/lib/promo-codes/service';

const mockPromoRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { promotionCodes: { retrieve: (...a: unknown[]) => mockPromoRetrieve(...a) } },
}));
const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: jest.fn() }));

beforeEach(() => { mockPromoRetrieve.mockReset(); mockSql.mockReset(); });

it('returns rows enriched with live times_redeemed from Stripe', async () => {
  mockSql.mockResolvedValueOnce([
    { id: 'row_1', community_id: 'c1', code: 'A', stripe_coupon_id: 'co_1',
      stripe_promotion_code_id: 'promo_1', discount_type: 'percent', discount_value: 20,
      duration: 'once', duration_in_months: null, max_redemptions: 50, expires_at: null,
      active: true, created_by: 'u1', created_at: '2026-07-03T00:00:00.000Z' },
  ]);
  mockPromoRetrieve.mockResolvedValueOnce({ id: 'promo_1', times_redeemed: 7 });

  const list = await listPromoCodes({ communityId: 'c1', stripeAccountId: 'acct_1' });

  expect(mockPromoRetrieve).toHaveBeenCalledWith('promo_1', { stripeAccount: 'acct_1' });
  expect(list[0]).toMatchObject({ code: 'A', timesRedeemed: 7, maxRedemptions: 50 });
});

it('falls back to 0 redemptions if a Stripe lookup fails', async () => {
  mockSql.mockResolvedValueOnce([
    { id: 'row_2', community_id: 'c1', code: 'B', stripe_coupon_id: 'co_2',
      stripe_promotion_code_id: 'promo_2', discount_type: 'percent', discount_value: 10,
      duration: 'once', duration_in_months: null, max_redemptions: null, expires_at: null,
      active: true, created_by: 'u1', created_at: '2026-07-03T00:00:00.000Z' },
  ]);
  mockPromoRetrieve.mockRejectedValueOnce(new Error('stripe down'));

  const list = await listPromoCodes({ communityId: 'c1', stripeAccountId: 'acct_1' });
  expect(list[0].timesRedeemed).toBe(0);
});
