/**
 * Membership-flow routes must act on the signed-in user only. Any userId or
 * email in the request body is ignored. Also covers the extra checks: free
 * join refuses paid / pre-registration communities, confirm-pre-registration
 * only accepts the caller's own SetupIntent, and reactivate only restores
 * access when the subscription is in good standing.
 */
import { POST as joinPOST } from '@/app/api/community/[communitySlug]/join/route';
import { POST as joinPreRegPOST } from '@/app/api/community/[communitySlug]/join-pre-registration/route';
import { POST as confirmPreRegPOST } from '@/app/api/community/[communitySlug]/confirm-pre-registration/route';
import { POST as cancelPreRegPOST } from '@/app/api/community/[communitySlug]/cancel-pre-registration/route';
import { POST as leavePOST } from '@/app/api/community/[communitySlug]/leave/route';
import { POST as reactivatePOST } from '@/app/api/community/[communitySlug]/reactivate/route';
import * as checkSubscription from '@/app/api/community/[communitySlug]/check-subscription/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const mockCustomersCreate = jest.fn();
const mockSetupIntentsCreate = jest.fn();
const mockSetupIntentsRetrieve = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsCancel = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => mockCustomersCreate(...a), del: jest.fn() },
    setupIntents: {
      create: (...a: unknown[]) => mockSetupIntentsCreate(...a),
      retrieve: (...a: unknown[]) => mockSetupIntentsRetrieve(...a),
    },
    subscriptions: {
      create: (...a: unknown[]) => mockSubscriptionsCreate(...a),
      update: (...a: unknown[]) => mockSubscriptionsUpdate(...a),
      retrieve: (...a: unknown[]) => mockSubscriptionsRetrieve(...a),
      cancel: (...a: unknown[]) => mockSubscriptionsCancel(...a),
    },
    invoices: { voidInvoice: jest.fn() },
    paymentMethods: { detach: jest.fn() },
  },
}));

jest.mock('@/lib/resend/email-service', () => ({
  getEmailService: () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@/lib/resend/templates/community/pre-registration-confirmation', () => ({
  PreRegistrationConfirmationEmail: () => null,
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const SESSION = { user: { id: 'u1', email: 'u1@x.com' } };

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

/** Interpolated values of every sql`...` / queryOne`...` call (strings dropped). */
const sqlValues = () => mockSql.mock.calls.flatMap((c) => c.slice(1));
const queryValues = () => mockQueryOne.mock.calls.flatMap((c) => c.slice(1));
/** SQL text of the nth sql`...` call. */
const sqlText = (n: number) => (mockSql.mock.calls[n][0] as string[]).join('?');
/** members_count is kept by a trigger on community_members; no route writes it by hand. */
const countsByHand = () => mockSql.mock.calls.some((c) => /members_count/.test((c[0] as string[]).join('?')));

beforeEach(() => {
  [
    mockGetSession, mockSql, mockQueryOne, mockCustomersCreate, mockSetupIntentsCreate,
    mockSetupIntentsRetrieve, mockSubscriptionsCreate, mockSubscriptionsUpdate, mockSubscriptionsRetrieve, mockSubscriptionsCancel,
  ].forEach((m) => m.mockReset());
  mockGetSession.mockResolvedValue(SESSION);
  mockSql.mockResolvedValue([]);
});

describe('signed-out callers get 401 and nothing is touched', () => {
  type Handler = (r: Request, p: { params: Promise<{ communitySlug: string }> }) => Promise<Response>;
  const cases: Array<[string, Handler]> = [
    ['join', joinPOST],
    ['join-pre-registration', joinPreRegPOST],
    ['confirm-pre-registration', confirmPreRegPOST],
    ['cancel-pre-registration', cancelPreRegPOST],
    ['leave', leavePOST],
    ['reactivate', reactivatePOST],
    ['check-subscription', checkSubscription.POST],
  ];
  it.each(cases)('%s', async (_name, handler) => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await handler(req({ userId: 'u1', email: 'u1@x.com', setupIntentId: 'seti_1' }), { params });
    expect(res.status).toBe(401);
    expect(mockQueryOne).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('join (free)', () => {
  const free = { id: 'c1', status: 'active', membership_enabled: false, membership_price: null };

  it('adds the session user, ignoring userId in the body', async () => {
    mockQueryOne.mockResolvedValueOnce(free).mockResolvedValueOnce(null);
    const res = await joinPOST(req({ userId: 'victim' }), { params });
    expect(res.status).toBe(200);
    expect(sqlValues()).toContain('u1');
    expect([...sqlValues(), ...queryValues()]).not.toContain('victim');
  });

  it('refuses a paid community (enabled and price > 0)', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...free, membership_enabled: true, membership_price: '20.00' });
    const res = await joinPOST(req({}), { params });
    expect(res.status).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('allows a community with membership enabled but a zero price', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...free, membership_enabled: true, membership_price: '0.00' }).mockResolvedValueOnce(null);
    const res = await joinPOST(req({}), { params });
    expect(res.status).toBe(200);
  });

  it('allows a community with a price set but membership disabled (matches the client)', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...free, membership_enabled: false, membership_price: 20 }).mockResolvedValueOnce(null);
    const res = await joinPOST(req({}), { params });
    expect(res.status).toBe(200);
  });

  it('refuses a pre-registration community', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...free, status: 'pre_registration' });
    const res = await joinPOST(req({}), { params });
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('only inserts the member row', async () => {
    mockQueryOne.mockResolvedValueOnce(free).mockResolvedValueOnce(null);
    const res = await joinPOST(req({}), { params });
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(sqlText(0)).toMatch(/INSERT INTO community_members/);
    expect(countsByHand()).toBe(false);
  });
});

describe('join-pre-registration', () => {
  it('creates the customer and SetupIntent for the session user', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'c1', membership_price: 20, stripe_account_id: 'acct_1', stripe_price_id: 'price_1',
        active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
        status: 'pre_registration', opening_date: '2999-01-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(null);
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
    mockSetupIntentsCreate.mockResolvedValueOnce({ id: 'seti_1', client_secret: 'seti_secret' });

    const res = await joinPreRegPOST(req({ userId: 'victim', email: 'victim@x.com' }), { params });

    expect(res.status).toBe(200);
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'u1@x.com', metadata: expect.objectContaining({ user_id: 'u1' }) }),
      { stripeAccount: 'acct_1' },
    );
    expect(mockSetupIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ user_id: 'u1', community_id: 'c1' }) }),
      { stripeAccount: 'acct_1' },
    );
  });
});

describe('confirm-pre-registration', () => {
  const community = {
    id: 'c1', name: 'Salsa', membership_price: 20, stripe_account_id: 'acct_1',
    stripe_price_id: 'price_1', opening_date: '2999-01-01T00:00:00.000Z',
  };
  const setupIntent = (metadata: Record<string, string>) => ({
    status: 'succeeded',
    payment_method: 'pm_1',
    metadata: { stripe_customer_id: 'cus_1', platform_fee_percentage: '8', ...metadata },
  });

  it("rejects another user's SetupIntent", async () => {
    mockQueryOne.mockResolvedValueOnce(community);
    mockSetupIntentsRetrieve.mockResolvedValueOnce(setupIntent({ user_id: 'victim', community_id: 'c1' }));
    const res = await confirmPreRegPOST(req({ setupIntentId: 'seti_1' }), { params });
    expect(res.status).toBe(403);
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("rejects a SetupIntent from another community", async () => {
    mockQueryOne.mockResolvedValueOnce(community);
    mockSetupIntentsRetrieve.mockResolvedValueOnce(setupIntent({ user_id: 'u1', community_id: 'c2' }));
    const res = await confirmPreRegPOST(req({ setupIntentId: 'seti_1' }), { params });
    expect(res.status).toBe(403);
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it("confirms the caller's own SetupIntent for the session user", async () => {
    mockQueryOne
      .mockResolvedValueOnce(community)
      .mockResolvedValueOnce(null) // no existing member
      .mockResolvedValueOnce({ full_name: 'U One', email: 'u1@x.com' });
    mockSetupIntentsRetrieve.mockResolvedValueOnce(setupIntent({ user_id: 'u1', community_id: 'c1' }));
    mockSubscriptionsCreate.mockResolvedValueOnce({ id: 'sub_1' });

    const res = await confirmPreRegPOST(req({ userId: 'victim', setupIntentId: 'seti_1' }), { params });

    expect(res.status).toBe(200);
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', metadata: expect.objectContaining({ user_id: 'u1' }) }),
      { stripeAccount: 'acct_1' },
    );
    expect(sqlValues()).toContain('u1');
    expect(sqlValues()).not.toContain('victim');
  });
});

describe('cancel-pre-registration', () => {
  it("looks up and deletes only the session user's row", async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({
        id: 'm1', community_id: 'c1', user_id: 'u1', status: 'pre_registered',
        stripe_invoice_id: null, pre_registration_payment_method_id: null, stripe_customer_id: null,
      });
    const res = await cancelPreRegPOST(req({ userId: 'victim' }), { params });
    expect(res.status).toBe(200);
    expect(queryValues()).toContain('u1');
    expect(sqlValues()).toContain('u1');
    expect([...sqlValues(), ...queryValues()]).not.toContain('victim');
  });
});

describe('leave', () => {
  it('removes the session user, ignoring userId in the body', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({ user_id: 'u1', community_id: 'c1', role: 'member', status: 'active', stripe_subscription_id: null });
    const res = await leavePOST(req({ userId: 'victim' }), { params });
    expect(res.status).toBe(200);
    expect(queryValues()).toContain('u1');
    expect([...sqlValues(), ...queryValues()]).not.toContain('victim');
  });

  it('only deletes the row of a free member who leaves', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({ user_id: 'u1', community_id: 'c1', role: 'member', status: 'active', stripe_subscription_id: null });
    const res = await leavePOST(req({}), { params });
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(sqlText(0)).toMatch(/DELETE FROM community_members/);
    expect(countsByHand()).toBe(false);
  });

  it('returns the stored membership when cancelling at period end', async () => {
    const periodEnd = new Date(Date.now() + 30 * 86400_000);
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      .mockResolvedValueOnce({ user_id: 'u1', community_id: 'c1', role: 'member', status: 'active', stripe_subscription_id: 'sub_1' });
    mockSubscriptionsUpdate.mockResolvedValueOnce({
      id: 'sub_1',
      items: { data: [{ current_period_end: Math.floor(periodEnd.getTime() / 1000) }] },
    });
    mockSql.mockResolvedValueOnce([
      { status: 'active', subscription_status: 'canceling', current_period_end: periodEnd },
    ]);
    const res = await leavePOST(req({}), { params });
    expect(res.status).toBe(200);
    expect(sqlText(0)).toMatch(/RETURNING/);
    expect(await res.json()).toMatchObject({
      gracePeriod: true,
      membership: {
        isMember: true,
        status: 'active',
        subscriptionStatus: 'canceling',
        currentPeriodEnd: periodEnd.toISOString(),
      },
    });
  });

  describe('when Stripe already ended the subscription', () => {
    const setup = () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
        .mockResolvedValueOnce({ user_id: 'u1', community_id: 'c1', role: 'member', status: 'active', stripe_subscription_id: 'sub_1' });
      mockSubscriptionsUpdate.mockRejectedValueOnce(new Error('subscription is canceled'));
      mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_1', status: 'canceled' });
    };

    it('marks the member inactive', async () => {
      setup();
      mockSql.mockResolvedValueOnce([{ status: 'inactive', subscription_status: 'canceled', current_period_end: null }]);
      const res = await leavePOST(req({}), { params });
      expect(await res.json()).toMatchObject({ success: true, reconciled: true });
      expect(sqlText(0)).toMatch(/status = 'inactive'/);
      expect(mockSql).toHaveBeenCalledTimes(1);
      expect(countsByHand()).toBe(false);
    });

    it('does not touch a row that is already inactive', async () => {
      setup();
      mockSql.mockResolvedValueOnce([]); // row was already inactive
      const res = await leavePOST(req({}), { params });
      expect(await res.json()).toMatchObject({ success: true, reconciled: true });
      expect(mockSql).toHaveBeenCalledTimes(1);
    });
  });
});

describe('reactivate', () => {
  const setup = () =>
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' })
      // An active member who cancelled and is still in the paid period.
      .mockResolvedValueOnce({
        id: 'm1', user_id: 'u1', community_id: 'c1', stripe_subscription_id: 'sub_1',
        status: 'active', subscription_status: 'canceling',
        current_period_end: new Date(Date.now() + 30 * 86400_000),
      });

  it.each(['active', 'trialing'])('restores access when the subscription is %s', async (status) => {
    setup();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_1', status });
    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: 'sub_1', status });
    const res = await reactivatePOST(req({ userId: 'victim' }), { params });
    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledTimes(1);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(sqlValues()).toContain('u1');
    expect([...sqlValues(), ...queryValues()]).not.toContain('victim');
  });

  it('returns the stored membership, keeping the period end', async () => {
    const periodEnd = new Date(Date.now() + 30 * 86400_000);
    setup();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_1', status: 'active' });
    mockSubscriptionsUpdate.mockResolvedValueOnce({ id: 'sub_1', status: 'active' });
    mockSql.mockResolvedValueOnce([
      { status: 'active', subscription_status: 'active', current_period_end: periodEnd },
    ]);
    const res = await reactivatePOST(req({}), { params });
    expect(res.status).toBe(200);
    expect(sqlText(0)).toMatch(/RETURNING/);
    expect((await res.json()).membership).toMatchObject({
      isMember: true,
      status: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: periodEnd.toISOString(),
    });
  });

  it.each(['canceled', 'incomplete_expired'])('ends the membership and says so when the subscription is %s', async (status) => {
    setup();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_1', status });
    mockSql.mockResolvedValueOnce([{ status: 'inactive', subscription_status: status, current_period_end: null }]);
    const res = await reactivatePOST(req({}), { params });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: 'Your membership has ended. Join again to continue.',
      membership: { isMember: false, status: 'inactive' },
    });
    expect(sqlText(0)).toMatch(/status = 'inactive'/);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it.each(['past_due', 'unpaid', 'incomplete'])('does not mark the member active when the subscription is %s', async (status) => {
    setup();
    mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_1', status });
    const res = await reactivatePOST(req({}), { params });
    expect(res.status).toBe(409);
    expect(mockSql).not.toHaveBeenCalled();
    // Refused before touching the subscription, so it stays cancelled.
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });
});

describe('check-subscription', () => {
  it('no longer exposes a GET handler', () => {
    expect((checkSubscription as Record<string, unknown>).GET).toBeUndefined();
  });

  it('reports on the session user, ignoring userId in the body', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'c1' })
      .mockResolvedValueOnce({ status: 'active', subscription_status: 'active', current_period_end: null });
    const res = await checkSubscription.POST(req({ userId: 'victim' }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hasSubscription: true });
    expect(queryValues()).toContain('u1');
    expect(queryValues()).not.toContain('victim');
  });
});
