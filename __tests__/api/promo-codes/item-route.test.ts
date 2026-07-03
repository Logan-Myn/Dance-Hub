import { PATCH, DELETE } from '@/app/api/community/[communitySlug]/promo-codes/[id]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockSetActive = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({
  setPromoCodeActive: (...a: unknown[]) => mockSetActive(...a),
  deletePromoCode: (...a: unknown[]) => mockDelete(...a),
}));

const params = Promise.resolve({ communitySlug: 'salsa', id: 'row_1' });
const community = { id: 'c1', created_by: 'owner1', stripe_account_id: 'acct_1' };

beforeEach(() => { mockGetSession.mockReset(); mockQueryOne.mockReset(); mockSetActive.mockReset(); mockDelete.mockReset(); });

it('PATCH deactivates for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockSetActive.mockResolvedValueOnce(undefined);
  const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ active: false }) }), { params });
  expect(res.status).toBe(200);
  expect(mockSetActive).toHaveBeenCalledWith({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1', active: false });
});

it('PATCH returns 403 for a non-owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'intruder' } });
  mockQueryOne.mockResolvedValueOnce(community);
  const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ active: false }) }), { params });
  expect(res.status).toBe(403);
  expect(mockSetActive).not.toHaveBeenCalled();
});

it('DELETE removes the code for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockDelete.mockResolvedValueOnce(undefined);
  const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params });
  expect(res.status).toBe(200);
  expect(mockDelete).toHaveBeenCalledWith({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1' });
});
