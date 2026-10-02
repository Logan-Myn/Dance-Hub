import { POST } from '@/app/api/community/[communitySlug]/promo-codes/validate/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), query: jest.fn(), sql: jest.fn() }));
const mockValidate = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({ validatePromoCode: (...a: unknown[]) => mockValidate(...a) }));

// The route's limiters live for the whole test file, so each test uses its
// own user and community unless it is about the limits.
let n = 0;
let userId = '';
let communityId = '';
beforeEach(() => {
  mockQueryOne.mockReset();
  mockValidate.mockReset();
  mockGetSession.mockReset();
  n += 1;
  userId = `u${n}`;
  communityId = `c${n}`;
  mockGetSession.mockResolvedValue({ user: { id: userId } });
});

const params = Promise.resolve({ communitySlug: 'salsa' });
const req = (body: object) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });

it('returns the validation result for a known community', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: communityId, stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValueOnce({ valid: true, promotionCodeId: 'promo_1', preview: { label: '20% off for 3 months' } });
  const res = await POST(req({ code: 'MARCELA20', plan: 'yearly' }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ valid: true, promotionCodeId: 'promo_1' });
  expect(mockValidate).toHaveBeenCalledWith({ stripeAccountId: 'acct_1', code: 'MARCELA20', communityId, plan: 'yearly' });
});

it('defaults the plan to monthly when the body omits it', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: communityId, stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValueOnce({ valid: true, promotionCodeId: 'promo_1', preview: { label: 'x' } });
  await POST(req({ code: 'X' }), { params });
  expect(mockValidate).toHaveBeenCalledWith({ stripeAccountId: 'acct_1', code: 'X', communityId, plan: 'monthly' });
});

it('returns a generic invalid result when the community has no payments set up', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: communityId, stripe_account_id: null });
  const res = await POST(req({ code: 'X' }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockValidate).not.toHaveBeenCalled();
});

it('requires a signed-in user', async () => {
  mockGetSession.mockResolvedValueOnce(null);
  const res = await POST(req({ code: 'X' }), { params });
  expect(res.status).toBe(401);
  expect(mockQueryOne).not.toHaveBeenCalled();
  expect(mockValidate).not.toHaveBeenCalled();
});

it('limits how many codes one user can try', async () => {
  mockQueryOne.mockResolvedValue({ id: communityId, stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValue({ valid: false, reason: 'That code is not valid.' });

  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await POST(req({ code: `GUESS${i}` }), { params })).status);
  }

  expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
  const last = await POST(req({ code: 'GUESS11' }), { params });
  expect(last.status).toBe(429);
  expect(await last.json()).toEqual({ valid: false, reason: expect.stringMatching(/Too many attempts/) });
  expect(mockValidate).toHaveBeenCalledTimes(10);
});

it('limits how many codes can be tried against one community, across users', async () => {
  mockQueryOne.mockResolvedValue({ id: communityId, stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValue({ valid: false, reason: 'That code is not valid.' });

  let lastStatus = 0;
  let allowed = 0;
  for (let i = 0; i < 61; i++) {
    mockGetSession.mockResolvedValueOnce({ user: { id: `${userId}-${i}` } });
    lastStatus = (await POST(req({ code: `GUESS${i}` }), { params })).status;
    if (lastStatus === 200) allowed += 1;
  }

  expect(allowed).toBe(60);
  expect(lastStatus).toBe(429);
});
