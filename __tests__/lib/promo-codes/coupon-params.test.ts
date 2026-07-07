import { buildCouponParams, buildPromotionCodeParams, validateCreateInput } from '@/lib/promo-codes/coupon-params';
import type { CreatePromoCodeInput } from '@/lib/promo-codes/types';

const base: CreatePromoCodeInput = {
  code: 'MARCELA20',
  discountType: 'percent',
  discountValue: 20,
  duration: 'repeating',
  durationInMonths: 3,
  maxRedemptions: 50,
  expiresAt: '2026-12-31T00:00:00.000Z',
};

describe('validateCreateInput', () => {
  it('accepts a valid percent repeating input', () => {
    expect(validateCreateInput(base)).toBeNull();
  });
  it('rejects empty code', () => {
    expect(validateCreateInput({ ...base, code: '  ' })).toMatch(/code/i);
  });
  it('rejects percent out of 1-100', () => {
    expect(validateCreateInput({ ...base, discountValue: 0 })).toMatch(/percent/i);
    expect(validateCreateInput({ ...base, discountValue: 150 })).toMatch(/percent/i);
  });
  it('rejects non-positive amount', () => {
    expect(validateCreateInput({ ...base, discountType: 'amount', discountValue: 0 })).toMatch(/amount/i);
  });
  it('rejects repeating without months', () => {
    expect(validateCreateInput({ ...base, durationInMonths: null })).toMatch(/months/i);
  });
  it('accepts a valid plan scope', () => {
    expect(validateCreateInput({ ...base, appliesToPlan: 'yearly' })).toBeNull();
  });
  it('rejects an invalid plan scope', () => {
    expect(validateCreateInput({ ...base, appliesToPlan: 'weekly' as unknown as 'both' }))
      .toMatch(/plan/i);
  });
});

describe('buildCouponParams', () => {
  it('maps a percent repeating code', () => {
    expect(buildCouponParams(base, null)).toEqual({
      percent_off: 20,
      duration: 'repeating',
      duration_in_months: 3,
    });
  });
  it('maps a fixed-amount once code into minor units with currency', () => {
    expect(buildCouponParams(
      { ...base, discountType: 'amount', discountValue: 10, duration: 'once', durationInMonths: null },
      'eur',
    )).toEqual({
      amount_off: 1000,
      currency: 'eur',
      duration: 'once',
    });
  });
  it('maps a free (100%) code', () => {
    expect(buildCouponParams({ ...base, discountValue: 100 }, null)).toMatchObject({ percent_off: 100 });
  });
});

describe('buildPromotionCodeParams', () => {
  it('nests the coupon under promotion, with code, expiry (unix), and max redemptions', () => {
    expect(buildPromotionCodeParams(base, 'coupon_1')).toEqual({
      promotion: { type: 'coupon', coupon: 'coupon_1' },
      code: 'MARCELA20',
      max_redemptions: 50,
      expires_at: Math.floor(new Date('2026-12-31T00:00:00.000Z').getTime() / 1000),
    });
  });
  it('omits optional limits when null', () => {
    expect(buildPromotionCodeParams(
      { ...base, maxRedemptions: null, expiresAt: null }, 'coupon_1',
    )).toEqual({ promotion: { type: 'coupon', coupon: 'coupon_1' }, code: 'MARCELA20' });
  });
});
