/**
 * A community being deleted is marked inactive first. No join route may
 * create a membership (or a subscription) in it meanwhile.
 */
import { POST as joinPaidPOST } from '@/app/api/community/[communitySlug]/join-paid/route';
import { POST as joinPOST } from '@/app/api/community/[communitySlug]/join/route';
import { POST as confirmPreRegPOST } from '@/app/api/community/[communitySlug]/confirm-pre-registration/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const mockStripe = {
  customers: { create: jest.fn() },
  subscriptions: { create: jest.fn(), retrieve: jest.fn(), cancel: jest.fn() },
  setupIntents: { create: jest.fn(), retrieve: jest.fn() },
};
jest.mock('@/lib/stripe', () => ({ get stripe() { return mockStripe; } }));
jest.mock('@/lib/resend/email-service', () => ({
  getEmailService: () => ({ sendTransactionalEmail: jest.fn() }),
}));
jest.mock('@/lib/resend/templates/community/pre-registration-confirmation', () => ({
  PreRegistrationConfirmationEmail: () => null,
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const req = (body: object = {}) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });

const closedCommunity = {
  id: 'c1', name: 'Salsa', status: 'inactive', membership_enabled: true, membership_price: 20,
  stripe_account_id: 'acct_1', stripe_price_id: 'price_1', stripe_yearly_price_id: null, yearly_enabled: false,
  active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
  opening_date: '2020-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'u1', email: 'u1@x.com' } });
  mockSql.mockResolvedValue([{ id: 'm1' }]);
  mockQueryOne.mockImplementation((strings: string[]) =>
    Promise.resolve(/FROM communities/.test(strings.join('?')) ? closedCommunity : null),
  );
});

const noMembershipWritten = () =>
  expect(mockSql.mock.calls.some((c) => /INSERT INTO community_members/.test((c[0] as string[]).join('?')))).toBe(false);

it('join-paid refuses an inactive community before touching Stripe', async () => {
  const res = await joinPaidPOST(req(), { params });
  expect(res.status).toBe(400);
  expect(mockStripe.customers.create).not.toHaveBeenCalled();
  expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  noMembershipWritten();
});

it('free join refuses an inactive community', async () => {
  mockQueryOne.mockImplementation((strings: string[]) =>
    Promise.resolve(/FROM communities/.test(strings.join('?')) ? { ...closedCommunity, membership_enabled: false } : null),
  );
  const res = await joinPOST(req(), { params });
  expect(res.status).toBe(400);
  noMembershipWritten();
});

it('confirming a pre-registration refuses an inactive community', async () => {
  const res = await confirmPreRegPOST(req({ setupIntentId: 'seti_1' }), { params });
  expect(res.status).toBe(400);
  expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  noMembershipWritten();
});
