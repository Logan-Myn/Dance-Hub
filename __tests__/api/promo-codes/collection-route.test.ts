import { GET, POST } from '@/app/api/community/[communitySlug]/promo-codes/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockCreate = jest.fn();
const mockList = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({
  createPromoCode: (...a: unknown[]) => mockCreate(...a),
  listPromoCodes: (...a: unknown[]) => mockList(...a),
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = { id: 'c1', created_by: 'owner1', stripe_account_id: 'acct_1', stripe_price_id: 'price_1' };

beforeEach(() => { mockGetSession.mockReset(); mockQueryOne.mockReset(); mockCreate.mockReset(); mockList.mockReset(); });

it('GET returns 401 without a session', async () => {
  mockGetSession.mockResolvedValueOnce(null);
  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(401);
});

it('GET returns 403 for a non-owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'someone' } });
  mockQueryOne.mockResolvedValueOnce(community);
  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(403);
});

it('GET returns the code list for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockList.mockResolvedValueOnce([{ id: 'row_1', code: 'A' }]);
  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ codes: [{ id: 'row_1', code: 'A' }] });
  expect(mockList).toHaveBeenCalledWith({ communityId: 'c1', stripeAccountId: 'acct_1' });
});

it('POST creates a code for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockCreate.mockResolvedValueOnce({ id: 'row_1', code: 'MARCELA20' });
  const body = {
    code: 'MARCELA20', discountType: 'percent', discountValue: 20,
    duration: 'repeating', durationInMonths: 3, maxRedemptions: 50, expiresAt: null,
  };
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params });
  expect(res.status).toBe(200);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    communityId: 'c1', stripeAccountId: 'acct_1', stripePriceId: 'price_1', createdBy: 'owner1',
    input: expect.objectContaining({ code: 'MARCELA20' }),
  }));
});

it('POST returns 400 when the service rejects invalid input', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockCreate.mockRejectedValueOnce(new Error('Percent must be between 1 and 100'));
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({}) }), { params });
  expect(res.status).toBe(400);
});
