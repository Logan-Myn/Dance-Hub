import { formatDiscountLabel, formatDurationLabel, buildPreview, describePromo } from '@/lib/promo-codes/format';

describe('formatDiscountLabel', () => {
  it('formats a percentage', () => {
    expect(formatDiscountLabel({ discountType: 'percent', discountValue: 20, currency: 'eur' })).toBe('20% off');
  });
  it('formats a free code', () => {
    expect(formatDiscountLabel({ discountType: 'percent', discountValue: 100, currency: 'eur' })).toBe('Free');
  });
  it('formats a fixed amount in the community currency', () => {
    expect(formatDiscountLabel({ discountType: 'amount', discountValue: 10, currency: 'eur' })).toBe('€10 off');
  });
});

describe('formatDurationLabel', () => {
  it('labels once', () => {
    expect(formatDurationLabel({ duration: 'once', durationInMonths: null })).toBe('first payment');
  });
  it('labels repeating', () => {
    expect(formatDurationLabel({ duration: 'repeating', durationInMonths: 3 })).toBe('3 months');
    expect(formatDurationLabel({ duration: 'repeating', durationInMonths: 1 })).toBe('1 month');
  });
});

describe('buildPreview', () => {
  it('joins discount and duration without em dashes', () => {
    const p = buildPreview({ discountType: 'percent', discountValue: 20, currency: 'eur', duration: 'repeating', durationInMonths: 3 });
    expect(p.label).toBe('20% off for 3 months');
    expect(p.label).not.toMatch(/—/);
  });
  it('labels a first-payment discount', () => {
    expect(buildPreview({ discountType: 'amount', discountValue: 10, currency: 'eur', duration: 'once', durationInMonths: null }).label)
      .toBe('€10 off first payment');
  });
});

describe('describePromo', () => {
  it('says what the code does in one line', () => {
    expect(describePromo({ discountType: 'percent', discountValue: 20, duration: 'once', durationInMonths: null })).toBe('20% off the first payment');
    expect(describePromo({ discountType: 'amount', discountValue: 5, duration: 'repeating', durationInMonths: 3, appliesToPlan: 'monthly', maxRedemptions: 10 })).toBe(
      '€5 off the first 3 months, monthly plan only, up to 10 uses'
    );
    expect(describePromo({ discountType: 'percent', discountValue: 100, duration: 'repeating', durationInMonths: 1, expiresAt: '2026-12-31T00:00:00.000Z' })).toBe(
      'Free for the first month, until 31 Dec 2026'
    );
  });
});
