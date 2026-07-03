import { setPromoCodeActive, deletePromoCode } from '@/lib/promo-codes/service';

const mockPromoUpdate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { promotionCodes: { update: (...a: unknown[]) => mockPromoUpdate(...a) } },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

beforeEach(() => { mockPromoUpdate.mockReset(); mockSql.mockReset(); mockQueryOne.mockReset(); });

it('deactivates on Stripe and updates the row (scoped to community)', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_promotion_code_id: 'promo_1' });
  mockPromoUpdate.mockResolvedValueOnce({});
  mockSql.mockResolvedValueOnce([]);

  await setPromoCodeActive({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1', active: false });

  expect(mockPromoUpdate).toHaveBeenCalledWith('promo_1', { active: false }, { stripeAccount: 'acct_1' });
});

it('throws when the code does not belong to the community', async () => {
  mockQueryOne.mockResolvedValueOnce(null);
  await expect(setPromoCodeActive({ id: 'x', communityId: 'c1', stripeAccountId: 'acct_1', active: false }))
    .rejects.toThrow(/not found/i);
  expect(mockPromoUpdate).not.toHaveBeenCalled();
});

it('delete deactivates on Stripe then removes the row', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_promotion_code_id: 'promo_1' });
  mockPromoUpdate.mockResolvedValueOnce({});
  mockSql.mockResolvedValueOnce([]);

  await deletePromoCode({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1' });

  expect(mockPromoUpdate).toHaveBeenCalledWith('promo_1', { active: false }, { stripeAccount: 'acct_1' });
  const sqlText = mockSql.mock.calls[0][0].join('?');
  expect(sqlText).toMatch(/DELETE FROM community_promo_codes/);
});
