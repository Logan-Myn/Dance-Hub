import { validatePromoCode } from '@/lib/promo-codes/service';
import { queryOne } from '@/lib/db';

const mockPromoList = jest.fn();
const mockCouponRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    promotionCodes: { list: (...a: unknown[]) => mockPromoList(...a) },
    coupons: { retrieve: (...a: unknown[]) => mockCouponRetrieve(...a) },
  },
}));
jest.mock('@/lib/db', () => ({ sql: jest.fn(), queryOne: jest.fn() }));
const mockQueryOne = queryOne as jest.Mock;

beforeEach(() => { mockPromoList.mockReset(); mockCouponRetrieve.mockReset(); mockQueryOne.mockReset(); });

it('returns a preview for a valid percent repeating code', async () => {
  // Clover API: promo carries the coupon id under promotion.coupon, no expanded coupon.
  mockPromoList.mockResolvedValueOnce({
    data: [{
      id: 'promo_1', active: true, expires_at: null, max_redemptions: null, times_redeemed: 0,
      promotion: { type: 'coupon', coupon: 'co_1' },
    }],
  });
  mockCouponRetrieve.mockResolvedValueOnce({
    valid: true, percent_off: 20, amount_off: null, currency: null, duration: 'repeating', duration_in_months: 3,
  });

  const res = await validatePromoCode({ stripeAccountId: 'acct_1', code: 'marcela20' });

  expect(mockPromoList).toHaveBeenCalledWith(
    { code: 'marcela20', active: true, limit: 1 },
    { stripeAccount: 'acct_1' },
  );
  expect(mockCouponRetrieve).toHaveBeenCalledWith('co_1', { stripeAccount: 'acct_1' });
  expect(res).toEqual({
    valid: true,
    promotionCodeId: 'promo_1',
    preview: { discountLabel: '20% off', durationLabel: '3 months', label: '20% off for 3 months' },
  });
});

it('is invalid when no code matches', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [] });
  const res = await validatePromoCode({ stripeAccountId: 'acct_1', code: 'nope' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

it('is invalid when max redemptions reached (without fetching the coupon)', async () => {
  mockPromoList.mockResolvedValueOnce({
    data: [{ id: 'p', active: true, expires_at: null, max_redemptions: 5, times_redeemed: 5,
      promotion: { type: 'coupon', coupon: 'co_x' } }],
  });
  const res = await validatePromoCode({ stripeAccountId: 'acct_1', code: 'maxed' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

const activePromo = {
  id: 'promo_1', active: true, expires_at: null, max_redemptions: null,
  times_redeemed: 0, promotion: { type: 'coupon', coupon: 'co_1' },
};
const validCoupon = {
  valid: true, percent_off: 20, amount_off: null, currency: null,
  duration: 'once', duration_in_months: null,
};

it('accepts a code whose scope matches the chosen plan', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce({ applies_to_plan: 'yearly' });
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'yr', communityId: 'c1', plan: 'yearly',
  });
  expect(res.valid).toBe(true);
});

it('accepts a both-scoped code for either plan', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce({ applies_to_plan: 'both' });
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'any', communityId: 'c1', plan: 'monthly',
  });
  expect(res.valid).toBe(true);
});

it('rejects a code scoped to a different plan, without fetching the coupon', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce({ applies_to_plan: 'yearly' });
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'yr', communityId: 'c1', plan: 'monthly',
  });
  expect(res).toEqual({ valid: false, reason: 'This code only applies to the yearly plan.' });
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

it('treats a missing mirror row as unrestricted', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce(null);
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'x', communityId: 'c1', plan: 'monthly',
  });
  expect(res.valid).toBe(true);
});
