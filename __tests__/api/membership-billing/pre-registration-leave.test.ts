/**
 * A pre-registered user (nothing charged yet) must not turn /leave or
 * /reactivate into member access before the community opens.
 */
import { POST as leavePOST } from '@/app/api/community/[communitySlug]/leave/route';
import { POST as reactivatePOST } from '@/app/api/community/[communitySlug]/reactivate/route';
import { POST as cancelPreRegPOST } from '@/app/api/community/[communitySlug]/cancel-pre-registration/route';
import { POST as checkSubscriptionPOST } from '@/app/api/community/[communitySlug]/check-subscription/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const mockSubUpdate = jest.fn();
const mockSubRetrieve = jest.fn();
const mockSubCancel = jest.fn();
const mockCustomerDel = jest.fn();
const mockVoidInvoice = jest.fn();
const mockDetach = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      update: (...a: unknown[]) => mockSubUpdate(...a),
      retrieve: (...a: unknown[]) => mockSubRetrieve(...a),
      cancel: (...a: unknown[]) => mockSubCancel(...a),
    },
    customers: { del: (...a: unknown[]) => mockCustomerDel(...a) },
    invoices: { voidInvoice: (...a: unknown[]) => mockVoidInvoice(...a) },
    paymentMethods: { detach: (...a: unknown[]) => mockDetach(...a) },
  },
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const req = () => new Request('http://x', { method: 'POST', body: '{}' });
const sqlText = (call: unknown[]) => (call[0] as string[]).join('?');

const preRegisteredRow = {
  id: 'm1', user_id: 'u1', community_id: 'c1', role: 'member', status: 'pre_registered',
  subscription_status: null, stripe_subscription_id: 'sub_pre', stripe_customer_id: 'cus_1',
  stripe_invoice_id: null, pre_registration_payment_method_id: 'pm_1', current_period_end: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetSession.mockResolvedValue({ user: { id: 'u1', email: 'u1@x.com' } });
  mockSql.mockResolvedValue([]);
  mockSubCancel.mockResolvedValue({ id: 'sub_pre', status: 'canceled' });
});

describe('/leave', () => {
  it('cancels a pre-registration instead of starting a grace period', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' }).mockResolvedValueOnce(preRegisteredRow);

    const res = await leavePOST(req(), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, gracePeriod: false, membership: { isMember: false } });
    // No "cancel at period end" (that is what opened the grace period).
    expect(mockSubUpdate).not.toHaveBeenCalled();
    expect(mockSubCancel).toHaveBeenCalledWith('sub_pre', { stripeAccount: 'acct_1' });
    expect(mockSql.mock.calls.some((c) => /canceling/.test(sqlText(c)))).toBe(false);
    expect(mockSql.mock.calls.some((c) => /DELETE FROM community_members/.test(sqlText(c)))).toBe(true);
  });

  it('keeps the pre-registration when its subscription could not be cancelled', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' }).mockResolvedValueOnce(preRegisteredRow);
    mockSubCancel.mockRejectedValueOnce(Object.assign(new Error('stripe down'), { statusCode: 500 }));
    mockSubRetrieve.mockResolvedValueOnce({ id: 'sub_pre', status: 'active' });

    const res = await leavePOST(req(), { params });

    expect(res.status).toBe(500);
    expect(mockSql.mock.calls.some((c) => /DELETE FROM community_members/.test(sqlText(c)))).toBe(false);
  });

  it('refuses a row that is not an active membership', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({ ...preRegisteredRow, status: 'pending', stripe_subscription_id: 'sub_incomplete' });

    const res = await leavePOST(req(), { params });

    expect(res.status).toBe(400);
    expect(mockSubUpdate).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('/reactivate', () => {
  it.each(['pre_registered', 'pending'])('refuses a %s row without touching Stripe', async (status) => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({ ...preRegisteredRow, status, subscription_status: 'canceling' });

    const res = await reactivatePOST(req(), { params });

    expect(res.status).toBe(400);
    expect(mockSubRetrieve).not.toHaveBeenCalled();
    expect(mockSubUpdate).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('sends an ended membership to join again', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({ ...preRegisteredRow, status: 'inactive', subscription_status: 'canceled' });

    const res = await reactivatePOST(req(), { params });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ membership: { isMember: false } });
    expect(mockSubUpdate).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('/cancel-pre-registration', () => {
  it('cancels the subscription that would charge on the opening date', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' }).mockResolvedValueOnce(preRegisteredRow);

    const res = await cancelPreRegPOST(req(), { params });

    expect(res.status).toBe(200);
    expect(mockSubCancel).toHaveBeenCalledWith('sub_pre', { stripeAccount: 'acct_1' });
    expect(mockSubCancel.mock.invocationCallOrder[0]).toBeLessThan(mockSql.mock.invocationCallOrder[0]);
  });
});

describe('/check-subscription', () => {
  it('does not report a pre-registered row marked canceling as a member', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1' })
      .mockResolvedValueOnce({
        status: 'pre_registered',
        subscription_status: 'canceling',
        current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
      });

    const res = await checkSubscriptionPOST(req(), { params });

    expect(await res.json()).toMatchObject({ hasSubscription: false, isMember: false });
  });
});
