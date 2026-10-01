import { createPromoCode } from '@/lib/promo-codes/service';

const mockCouponsCreate = jest.fn();
const mockCouponsDel = jest.fn();
const mockPromoCreate = jest.fn();
const mockPromoUpdate = jest.fn();
const mockPricesRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    coupons: { create: (...a: unknown[]) => mockCouponsCreate(...a), del: (...a: unknown[]) => mockCouponsDel(...a) },
    promotionCodes: {
      create: (...a: unknown[]) => mockPromoCreate(...a),
      update: (...a: unknown[]) => mockPromoUpdate(...a),
    },
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
  [mockCouponsCreate, mockCouponsDel, mockPromoCreate, mockPromoUpdate, mockPricesRetrieve, mockSql, mockQueryOne]
    .forEach((m) => m.mockReset());
});

/** No existing code with that name, then the INSERT returns `row`. */
function stubInsert(row: unknown) {
  mockQueryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
}

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
  stubInsert({
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
    expect.objectContaining({ promotion: { type: 'coupon', coupon: 'coupon_1' }, code: 'MARCELA20', max_redemptions: 50 }),
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
  stubInsert({
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

it('persists the plan scope and reflects it on the record', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_3' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_3' });
  stubInsert({
    id: 'row_3', community_id: 'c1', code: 'YEARONLY',
    stripe_coupon_id: 'coupon_3', stripe_promotion_code_id: 'promo_3',
    discount_type: 'percent', discount_value: 20, duration: 'once',
    duration_in_months: null, max_redemptions: null, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-07T00:00:00.000Z',
    applies_to_plan: 'yearly',
  });

  const rec = await createPromoCode({
    ...args,
    input: { ...args.input, duration: 'once', durationInMonths: null, appliesToPlan: 'yearly' },
  });

  expect(rec.appliesToPlan).toBe('yearly');
  // the scope value is passed into the INSERT tagged-template call
  expect(mockQueryOne.mock.calls[1]).toContain('yearly');
});

it('defaults appliesToPlan to both when the row has none', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_4' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_4' });
  stubInsert({
    id: 'row_4', community_id: 'c1', code: 'PLAIN',
    stripe_coupon_id: 'coupon_4', stripe_promotion_code_id: 'promo_4',
    discount_type: 'percent', discount_value: 20, duration: 'once',
    duration_in_months: null, max_redemptions: null, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-07T00:00:00.000Z',
  });

  const rec = await createPromoCode({
    ...args,
    input: { ...args.input, duration: 'once', durationInMonths: null },
  });

  expect(rec.appliesToPlan).toBe('both');
});

it('refuses a name already used in the community, in any case, before calling Stripe', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: 'row_old', active: false });

  await expect(createPromoCode({ ...args, input: { ...args.input, code: 'marcela20' } }))
    .rejects.toThrow(/already have a code called marcela20/i);

  const [strings, ...values] = mockQueryOne.mock.calls[0];
  expect((strings as string[]).join('?')).toMatch(/lower\(code\) = lower\(\?\)/);
  expect(values).toEqual(expect.arrayContaining(['c1', 'marcela20']));
  expect(mockCouponsCreate).not.toHaveBeenCalled();
  expect(mockPromoCreate).not.toHaveBeenCalled();
});

it('switches off the promotion code and deletes the coupon when the row cannot be saved', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_9' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_9' });
  mockQueryOne.mockResolvedValueOnce(null).mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(createPromoCode(args)).rejects.toThrow(/already have a code called MARCELA20/);

  expect(mockPromoUpdate).toHaveBeenCalledWith('promo_9', { active: false }, { stripeAccount: 'acct_1' });
  expect(mockCouponsDel).toHaveBeenCalledWith('coupon_9', { stripeAccount: 'acct_1' });
});

it('deletes the coupon when the promotion code cannot be created', async () => {
  mockQueryOne.mockResolvedValueOnce(null);
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_8' });
  mockPromoCreate.mockRejectedValueOnce(new Error('stripe says no'));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(createPromoCode(args)).rejects.toThrow('stripe says no');

  expect(mockCouponsDel).toHaveBeenCalledWith('coupon_8', { stripeAccount: 'acct_1' });
});
