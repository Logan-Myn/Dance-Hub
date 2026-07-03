import { createPromoCode } from '@/lib/promo-codes/service';

const mockCouponsCreate = jest.fn();
const mockPromoCreate = jest.fn();
const mockPricesRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    coupons: { create: (...a: unknown[]) => mockCouponsCreate(...a) },
    promotionCodes: { create: (...a: unknown[]) => mockPromoCreate(...a) },
    prices: { retrieve: (...a: unknown[]) => mockPricesRetrieve(...a) },
  },
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

beforeEach(() => {
  [mockCouponsCreate, mockPromoCreate, mockPricesRetrieve, mockSql, mockQueryOne].forEach((m) => m.mockReset());
});

const args = {
  communityId: 'c1',
  stripeAccountId: 'acct_1',
  stripePriceId: 'price_1',
  createdBy: 'user_1',
  input: {
    code: 'MARCELA20', discountType: 'percent' as const, discountValue: 20,
    duration: 'repeating' as const, durationInMonths: 3, maxRedemptions: 50, expiresAt: null,
  },
};

it('creates coupon + promotion code on the connected account and inserts a row', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_1' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_1' });
  mockQueryOne.mockResolvedValueOnce({
    id: 'row_1', community_id: 'c1', code: 'MARCELA20',
    stripe_coupon_id: 'coupon_1', stripe_promotion_code_id: 'promo_1',
    discount_type: 'percent', discount_value: 20, duration: 'repeating',
    duration_in_months: 3, max_redemptions: 50, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-03T00:00:00.000Z',
  });

  const rec = await createPromoCode(args);

  expect(mockCouponsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ percent_off: 20, duration: 'repeating', duration_in_months: 3 }),
    { stripeAccount: 'acct_1' },
  );
  expect(mockPromoCreate).toHaveBeenCalledWith(
    expect.objectContaining({ coupon: 'coupon_1', code: 'MARCELA20', max_redemptions: 50 }),
    { stripeAccount: 'acct_1' },
  );
  expect(mockPricesRetrieve).not.toHaveBeenCalled(); // percent needs no currency
  expect(rec.stripePromotionCodeId).toBe('promo_1');
  expect(rec.code).toBe('MARCELA20');
});

it('resolves currency from the membership price for amount codes', async () => {
  mockPricesRetrieve.mockResolvedValueOnce({ currency: 'eur' });
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_2' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_2' });
  mockQueryOne.mockResolvedValueOnce({
    id: 'row_2', community_id: 'c1', code: 'TEN', stripe_coupon_id: 'coupon_2',
    stripe_promotion_code_id: 'promo_2', discount_type: 'amount', discount_value: 10,
    duration: 'once', duration_in_months: null, max_redemptions: null, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-03T00:00:00.000Z',
  });

  await createPromoCode({
    ...args,
    input: { ...args.input, discountType: 'amount', discountValue: 10, duration: 'once', durationInMonths: null },
  });

  expect(mockPricesRetrieve).toHaveBeenCalledWith('price_1', { stripeAccount: 'acct_1' });
  expect(mockCouponsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ amount_off: 1000, currency: 'eur', duration: 'once' }),
    { stripeAccount: 'acct_1' },
  );
});

it('rejects invalid input before calling Stripe', async () => {
  await expect(createPromoCode({ ...args, input: { ...args.input, code: '' } }))
    .rejects.toThrow(/code/i);
  expect(mockCouponsCreate).not.toHaveBeenCalled();
});
