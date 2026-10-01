import { validatePromoCode } from '@/lib/promo-codes/service';
import { queryOne } from '@/lib/db';

const mockPromoRetrieve = jest.fn();
const mockPromoList = jest.fn();
const mockCouponRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    promotionCodes: {
      retrieve: (...a: unknown[]) => mockPromoRetrieve(...a),
      list: (...a: unknown[]) => mockPromoList(...a),
    },
    coupons: { retrieve: (...a: unknown[]) => mockCouponRetrieve(...a) },
  },
}));
jest.mock('@/lib/db', () => ({ sql: jest.fn(), queryOne: jest.fn() }));
const mockQueryOne = queryOne as jest.Mock;

beforeEach(() => {
  mockPromoRetrieve.mockReset();
  mockPromoList.mockReset();
  mockCouponRetrieve.mockReset();
  mockQueryOne.mockReset();
});

const mirror = (appliesToPlan = 'both') => ({ stripe_promotion_code_id: 'promo_1', applies_to_plan: appliesToPlan });
// Clover API: promo carries the coupon id under promotion.coupon, no expanded coupon.
const activePromo = {
  id: 'promo_1', active: true, expires_at: null, max_redemptions: null,
  times_redeemed: 0, promotion: { type: 'coupon', coupon: 'co_1' },
};
const validCoupon = {
  valid: true, percent_off: 20, amount_off: null, currency: null,
  duration: 'once', duration_in_months: null,
};
const base = { stripeAccountId: 'acct_1', communityId: 'c1' };

it('returns a preview for a valid percent repeating code', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror());
  mockPromoRetrieve.mockResolvedValueOnce(activePromo);
  mockCouponRetrieve.mockResolvedValueOnce({
    valid: true, percent_off: 20, amount_off: null, currency: null, duration: 'repeating', duration_in_months: 3,
  });

  const res = await validatePromoCode({ ...base, code: 'marcela20' });

  expect(mockPromoRetrieve).toHaveBeenCalledWith('promo_1', { stripeAccount: 'acct_1' });
  expect(mockCouponRetrieve).toHaveBeenCalledWith('co_1', { stripeAccount: 'acct_1' });
  expect(res).toEqual({
    valid: true,
    promotionCodeId: 'promo_1',
    preview: { discountLabel: '20% off', durationLabel: '3 months', label: '20% off for 3 months' },
  });
});

it('looks the code up in the community mirror first, ignoring case, and only active codes', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror());
  mockPromoRetrieve.mockResolvedValueOnce(activePromo);
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);

  await validatePromoCode({ ...base, code: ' marcela20 ' });

  const [strings, ...values] = mockQueryOne.mock.calls[0];
  const text = (strings as string[]).join('?');
  expect(text).toMatch(/FROM community_promo_codes/);
  expect(text).toMatch(/lower\(code\) = lower\(\?\)/);
  expect(text).toMatch(/active = true/);
  expect(values).toEqual(expect.arrayContaining(['c1', 'marcela20']));
});

it('refuses a code the community does not have without calling Stripe', async () => {
  mockQueryOne.mockResolvedValueOnce(null);
  const res = await validatePromoCode({ ...base, code: 'nope' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockPromoRetrieve).not.toHaveBeenCalled();
  expect(mockPromoList).not.toHaveBeenCalled();
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

it('is invalid when Stripe reports the code inactive', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror());
  mockPromoRetrieve.mockResolvedValueOnce({ ...activePromo, active: false });
  const res = await validatePromoCode({ ...base, code: 'x' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

it('is invalid when max redemptions reached (without fetching the coupon)', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror());
  mockPromoRetrieve.mockResolvedValueOnce({ ...activePromo, max_redemptions: 5, times_redeemed: 5 });
  const res = await validatePromoCode({ ...base, code: 'maxed' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

it('accepts a code whose scope matches the chosen plan', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror('yearly'));
  mockPromoRetrieve.mockResolvedValueOnce(activePromo);
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({ ...base, code: 'yr', plan: 'yearly' });
  expect(res.valid).toBe(true);
});

it('accepts a both-scoped code for either plan', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror('both'));
  mockPromoRetrieve.mockResolvedValueOnce(activePromo);
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({ ...base, code: 'any', plan: 'monthly' });
  expect(res.valid).toBe(true);
});

it('rejects a code scoped to a different plan, without calling Stripe', async () => {
  mockQueryOne.mockResolvedValueOnce(mirror('yearly'));
  const res = await validatePromoCode({ ...base, code: 'yr', plan: 'monthly' });
  expect(res).toEqual({ valid: false, reason: 'This code only applies to the yearly plan.' });
  expect(mockPromoRetrieve).not.toHaveBeenCalled();
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});
