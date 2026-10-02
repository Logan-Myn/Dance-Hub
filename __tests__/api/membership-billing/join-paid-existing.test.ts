import { POST } from '@/app/api/community/[communitySlug]/join-paid/route';

// join-paid when the user already has a row: an earlier checkout may already
// be paid (the webhook just hasn't marked it yet), and two requests at once
// (a double click) must not both create a subscription.
const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSetupIntentsCreate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => mockCustomersCreate(...a) },
    subscriptions: {
      create: (...a: unknown[]) => mockSubscriptionsCreate(...a),
      cancel: (...a: unknown[]) => mockSubscriptionsCancel(...a),
      retrieve: (...a: unknown[]) => mockSubscriptionsRetrieve(...a),
    },
    setupIntents: { create: (...a: unknown[]) => mockSetupIntentsCreate(...a) },
  },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = {
  id: 'c1', membership_price: 20, stripe_account_id: 'acct_1', stripe_price_id: 'price_1',
  stripe_yearly_price_id: null, yearly_enabled: false,
  active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
};

const sqlText = (call: unknown[]) => (call[0] as string[]).join('?');
const sqlCalls = () => mockSql.mock.calls.map((c) => ({ text: sqlText(c), values: c.slice(1) }));

/** Answers the claim INSERT with `claimed` (a row id, or nothing when another request holds it). */
function stubSql({ claimed }: { claimed: boolean }) {
  mockSql.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/INSERT INTO community_members/.test(text)) return Promise.resolve(claimed ? [{ id: 'm_new' }] : []);
    if (/UPDATE community_members[\s\S]*stripe_subscription_id IS NULL/.test(text)) return Promise.resolve([{ id: 'm_new' }]);
    return Promise.resolve([]);
  });
}

function stubNewSubscription() {
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_new',
    latest_invoice: { id: 'in_new', amount_due: 2000, confirmation_secret: { client_secret: 'pi_secret_new' } },
  });
}

function req(body: object = {}) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetSession.mockResolvedValue({ user: { id: 'u1', email: 'u1@x.com' } });
});

it('reports "already a member" and keeps an earlier checkout that is already paid', async () => {
  mockQueryOne
    .mockResolvedValueOnce(community)
    .mockResolvedValueOnce({ id: 'm1', status: 'pending', subscription_status: 'incomplete', stripe_subscription_id: 'sub_paid' });
  mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_paid', status: 'active', cancel_at_period_end: false });
  stubSql({ claimed: true });

  const res = await POST(req(), { params });

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ alreadyMember: true });
  expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_paid', { stripeAccount: 'acct_1' });
  expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  // The row catches up with Stripe right away.
  const reconcile = sqlCalls().find((c) => /UPDATE community_members/.test(c.text));
  expect(reconcile?.text).toMatch(/status = 'active'/);
  expect(reconcile?.text).toMatch(/stripe_subscription_id = \?/);
  expect(reconcile?.values).toEqual(expect.arrayContaining(['m1', 'sub_paid', 'active']));
});

it('replaces an unpaid earlier checkout: cancels it and starts a new one', async () => {
  mockQueryOne
    .mockResolvedValueOnce(community)
    .mockResolvedValueOnce({ id: 'm1', status: 'pending', subscription_status: 'incomplete', stripe_subscription_id: 'sub_old' });
  mockSubscriptionsRetrieve.mockResolvedValueOnce({ id: 'sub_old', status: 'incomplete' });
  stubSql({ claimed: true });
  stubNewSubscription();

  const res = await POST(req(), { params });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ clientSecret: 'pi_secret_new', subscriptionId: 'sub_new' });
  expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_old', { stripeAccount: 'acct_1' });
  // The old row is only removed if it still holds the old subscription.
  const del = sqlCalls().find((c) => /DELETE FROM community_members/.test(c.text));
  expect(del?.text).toMatch(/stripe_subscription_id = \?/);
  expect(del?.values).toEqual(expect.arrayContaining(['m1', 'sub_old']));
  // The new subscription is written onto the claimed row.
  const attach = sqlCalls().find((c) => /UPDATE community_members/.test(c.text));
  expect(attach?.values).toEqual(expect.arrayContaining(['cus_new', 'sub_new', 'm_new']));
});

it('refuses a second request while the first is still setting up the checkout', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  stubSql({ claimed: false }); // the other request inserted the row first

  const res = await POST(req(), { params });

  expect(res.status).toBe(409);
  expect((await res.json()).alreadyMember).toBeUndefined();
  expect(mockCustomersCreate).not.toHaveBeenCalled();
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
});

it('only replaces a join still in progress once it has been abandoned', async () => {
  mockQueryOne
    .mockResolvedValueOnce(community)
    .mockResolvedValueOnce({ id: 'm1', status: 'pending', subscription_status: 'incomplete', stripe_subscription_id: null });
  stubSql({ claimed: false });

  const res = await POST(req(), { params });

  expect(res.status).toBe(409);
  const del = sqlCalls().find((c) => /DELETE FROM community_members/.test(c.text));
  expect(del?.text).toMatch(/stripe_subscription_id IS NULL/);
  expect(del?.text).toMatch(/INTERVAL '2 minutes'/);
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
});

it('releases the claimed row when Stripe fails, so the user can try again', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  stubSql({ claimed: true });
  mockCustomersCreate.mockRejectedValueOnce(new Error('stripe down'));

  const res = await POST(req(), { params });

  expect(res.status).toBe(500);
  const del = sqlCalls().find((c) => /DELETE FROM community_members/.test(c.text));
  expect(del?.values).toContain('m_new');
});

it('refuses a pre-registered user', async () => {
  mockQueryOne
    .mockResolvedValueOnce(community)
    .mockResolvedValueOnce({ id: 'm1', status: 'pre_registered', subscription_status: null, stripe_subscription_id: 'sub_pre' });

  const res = await POST(req(), { params });

  expect(res.status).toBe(400);
  expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
});
