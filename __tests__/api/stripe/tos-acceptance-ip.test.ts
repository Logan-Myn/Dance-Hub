/**
 * The IP recorded with Stripe ToS acceptance comes from the header nginx sets
 * (X-Real-IP), not from X-Forwarded-For, whose first entry the client controls.
 */
import { PUT } from '@/app/api/stripe/custom-account/[accountId]/update/route';

const mockRetrieve = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      retrieve: (...a: unknown[]) => mockRetrieve(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

jest.mock('@/lib/db', () => {
  const sql = jest.fn().mockResolvedValue([]) as jest.Mock & { json: (v: unknown) => unknown };
  sql.json = (v: unknown) => v;
  return { sql };
});

jest.mock('@/lib/community-auth', () => ({
  requireStripeAccountManager: jest.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue({ metadata: { community_id: 'c1' }, requirements: {} });
  mockUpdate.mockResolvedValue({});
});

it('records the proxy-set client IP, not a spoofed X-Forwarded-For', async () => {
  const req = new Request('http://localhost/api/stripe/custom-account/acct_1/update', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '6.6.6.6, 203.0.113.9',
      'x-real-ip': '203.0.113.9',
    },
    body: JSON.stringify({
      step: 'business_info',
      businessInfo: { type: 'individual', name: 'Ana Lopez' },
      tosAcceptance: { accepted: true, date: '2026-10-01T10:00:00Z', userAgent: 'UA' },
    }),
  });

  const res = await PUT(req, { params: Promise.resolve({ accountId: 'acct_1' }) });
  expect(res.status).toBe(200);
  expect(mockUpdate).toHaveBeenCalledWith(
    'acct_1',
    expect.objectContaining({
      tos_acceptance: expect.objectContaining({ ip: '203.0.113.9' }),
    })
  );
});
