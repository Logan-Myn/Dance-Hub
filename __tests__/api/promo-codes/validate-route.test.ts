import { POST } from '@/app/api/community/[communitySlug]/promo-codes/validate/route';

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockValidate = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({ validatePromoCode: (...a: unknown[]) => mockValidate(...a) }));

const params = Promise.resolve({ communitySlug: 'salsa' });
beforeEach(() => { mockQueryOne.mockReset(); mockValidate.mockReset(); });

it('returns the validation result for a known community', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValueOnce({ valid: true, promotionCodeId: 'promo_1', preview: { label: '20% off for 3 months' } });
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'MARCELA20' }) }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ valid: true, promotionCodeId: 'promo_1' });
  expect(mockValidate).toHaveBeenCalledWith({ stripeAccountId: 'acct_1', code: 'MARCELA20' });
});

it('returns a generic invalid result when the community has no payments set up', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_account_id: null });
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'X' }) }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockValidate).not.toHaveBeenCalled();
});
