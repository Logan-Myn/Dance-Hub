/**
 * Removing a member, deleting a community or deleting a user must cancel the
 * Stripe subscriptions those rows link to first. Once the rows are gone
 * nothing in the app can cancel them, and the member keeps being charged.
 */
import { DELETE as removeMember } from '@/app/api/community/[communitySlug]/members/route';
import { DELETE as deleteCommunity } from '@/app/api/admin/communities/[communityId]/route';
import { DELETE as deleteUser } from '@/app/api/admin/users/[userId]/route';
import { cancelMemberSubscriptions, cancelSubscriptionNow } from '@/lib/subscription-cancel';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockRequireManager = jest.fn();
jest.mock('@/lib/community-auth', () => ({
  requireCommunityManager: (...a: unknown[]) => mockRequireManager(...a),
  requireCommunityViewer: jest.fn(),
  userCanManageCommunity: jest.fn(),
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
const mockQuery = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

jest.mock('@/lib/subscription-cancel', () => ({
  cancelMemberSubscriptions: jest.fn(),
  cancelSubscriptionNow: jest.fn(),
}));
const mockCancelMembers = cancelMemberSubscriptions as jest.Mock;
const mockCancelOne = cancelSubscriptionNow as jest.Mock;

const text = (call: unknown[]) => (call[0] as string[]).join('?');
const deletes = () => mockSql.mock.calls.filter((c) => /DELETE FROM|delete_community/.test(text(c)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSql.mockResolvedValue([{ id: 'm1' }]);
  mockCancelMembers.mockResolvedValue([]);
  mockCancelOne.mockResolvedValue(undefined);
});

describe('owner removes a member', () => {
  const params = Promise.resolve({ communitySlug: 'salsa' });
  const req = () => new Request('http://x', { method: 'DELETE', body: JSON.stringify({ memberId: 'm1' }) });

  beforeEach(() => {
    mockRequireManager.mockResolvedValue({
      ok: true,
      session: { user: { id: 'owner' } },
      community: { id: 'c1', slug: 'salsa', name: 'Salsa', created_by: 'owner', stripe_account_id: 'acct_1' },
    });
  });

  it('cancels the member subscription on the community account before removing the row', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'm1', stripe_subscription_id: 'sub_1', subscription_status: 'active' });

    const res = await removeMember(req(), { params });

    expect(res.status).toBe(200);
    expect(mockCancelMembers).toHaveBeenCalledWith([
      { stripe_subscription_id: 'sub_1', subscription_status: 'active', stripe_account_id: 'acct_1' },
    ]);
    expect(deletes()).toHaveLength(1);
    expect(mockCancelMembers.mock.invocationCallOrder[0]).toBeLessThan(mockSql.mock.invocationCallOrder[0]);
    // The lookup is scoped to this community.
    expect(mockQueryOne.mock.calls[0].slice(1)).toEqual(expect.arrayContaining(['m1', 'c1']));
  });

  it('keeps the member when the subscription could not be cancelled', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'm1', stripe_subscription_id: 'sub_1', subscription_status: 'active' });
    mockCancelMembers.mockResolvedValueOnce(['sub_1']);

    const res = await removeMember(req(), { params });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/not removed/);
    expect(deletes()).toHaveLength(0);
  });

  it('returns 404 for a member of another community', async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    const res = await removeMember(req(), { params });

    expect(res.status).toBe(404);
    expect(mockCancelMembers).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });
});

describe('platform admin deletes a community', () => {
  const params = Promise.resolve({ communityId: 'c1' });
  const req = () => new Request('http://x', { method: 'DELETE' });

  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin' } });
  });

  /** queryOne answers: admin profile, upcoming paid bookings, community, broadcast subscription. */
  function stubQueryOne({ upcoming = 0, broadcast = null as null | { stripe_subscription_id: string; status: string } }) {
    mockQueryOne.mockImplementation((strings: string[]) => {
      const t = strings.join('?');
      if (/FROM profiles/.test(t)) return Promise.resolve({ id: 'p1', is_admin: true });
      if (/FROM lesson_bookings/.test(t)) return Promise.resolve({ count: upcoming });
      if (/FROM communities/.test(t)) return Promise.resolve({ id: 'c1', stripe_account_id: 'acct_1', status: 'active' });
      if (/FROM community_broadcast_subscriptions/.test(t)) return Promise.resolve(broadcast);
      return Promise.resolve(null);
    });
  }

  it('cancels every member subscription and the broadcast subscription before deleting', async () => {
    stubQueryOne({ broadcast: { stripe_subscription_id: 'sub_bc', status: 'active' } });
    mockQuery.mockResolvedValueOnce([
      { stripe_subscription_id: 'sub_1', subscription_status: 'active' },
      { stripe_subscription_id: 'sub_2', subscription_status: 'canceling' },
    ]);

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(200);
    expect(mockCancelMembers).toHaveBeenCalledWith([
      { stripe_subscription_id: 'sub_1', subscription_status: 'active', stripe_account_id: 'acct_1' },
      { stripe_subscription_id: 'sub_2', subscription_status: 'canceling', stripe_account_id: 'acct_1' },
    ]);
    // The broadcast tier is billed on the platform account.
    expect(mockCancelOne).toHaveBeenCalledWith('sub_bc', null);
    expect(deletes()).toHaveLength(1);
  });

  const statusUpdates = () =>
    mockSql.mock.calls
      .filter((c) => /UPDATE communities/.test(text(c)))
      .map((c) => ({ text: text(c), values: c.slice(1) }));

  it('closes the community to new members before cancelling, then deletes it', async () => {
    stubQueryOne({});
    mockQuery.mockResolvedValueOnce([{ stripe_subscription_id: 'sub_1', subscription_status: 'active' }]);

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(200);
    const [close, ...rest] = statusUpdates();
    expect(close.text).toMatch(/SET status = 'inactive'/);
    expect(close.values).toContain('c1');
    expect(rest).toHaveLength(0);
    const closeOrder = mockSql.mock.invocationCallOrder[mockSql.mock.calls.findIndex((c) => /UPDATE communities/.test(text(c)))];
    expect(closeOrder).toBeLessThan(mockQuery.mock.invocationCallOrder[0]);
    expect(closeOrder).toBeLessThan(mockCancelMembers.mock.invocationCallOrder[0]);
  });

  it('reopens the community when a cancel fails and the delete is abandoned', async () => {
    stubQueryOne({});
    mockQuery.mockResolvedValueOnce([{ stripe_subscription_id: 'sub_1', subscription_status: 'active' }]);
    mockCancelMembers.mockResolvedValueOnce(['sub_1']);

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(502);
    const updates = statusUpdates();
    expect(updates).toHaveLength(2);
    expect(updates[1].text).toMatch(/SET status = \?/);
    expect(updates[1].values).toEqual(expect.arrayContaining(['active', 'c1']));
    expect(deletes()).toHaveLength(0);
  });

  it('refuses while paid private lessons are still to come', async () => {
    stubQueryOne({ upcoming: 2 });

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/2 paid private lessons/);
    expect(statusUpdates()).toHaveLength(0);
    expect(mockCancelMembers).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });

  it('does not delete when a subscription could not be cancelled', async () => {
    stubQueryOne({});
    mockQuery.mockResolvedValueOnce([{ stripe_subscription_id: 'sub_1', subscription_status: 'active' }]);
    mockCancelMembers.mockResolvedValueOnce(['sub_1']);

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(502);
    expect(deletes()).toHaveLength(0);
  });

  it('does not delete when the broadcast subscription could not be cancelled', async () => {
    stubQueryOne({ broadcast: { stripe_subscription_id: 'sub_bc', status: 'past_due' } });
    mockQuery.mockResolvedValueOnce([]);
    mockCancelOne.mockRejectedValueOnce(new Error('stripe down'));

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(502);
    expect(deletes()).toHaveLength(0);
  });

  it('skips a broadcast subscription that is already canceled', async () => {
    stubQueryOne({ broadcast: { stripe_subscription_id: 'sub_bc', status: 'canceled' } });
    mockQuery.mockResolvedValueOnce([]);

    const res = await deleteCommunity(req(), { params });

    expect(res.status).toBe(200);
    expect(mockCancelOne).not.toHaveBeenCalled();
  });
});

describe('platform admin deletes a user', () => {
  const params = Promise.resolve({ userId: 'u1' });
  const req = () => new Request('http://x', { method: 'DELETE' });

  /** queryOne answers: admin profile, then how many communities the user owns. */
  function stubQueryOne(ownedCommunities = 0) {
    mockQueryOne.mockImplementation((strings: string[]) => {
      const t = strings.join('?');
      if (/FROM profiles/.test(t)) return Promise.resolve({ id: 'p1', is_admin: true });
      if (/FROM communities/.test(t)) return Promise.resolve({ count: ownedCommunities });
      return Promise.resolve(null);
    });
  }

  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'admin' } });
    stubQueryOne();
  });

  it('refuses to delete a user who owns a community, before cancelling anything', async () => {
    stubQueryOne(2);

    const res = await deleteUser(req(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/owns 2 communities/);
    const ownerLookup = mockQueryOne.mock.calls.find((c) => /FROM communities/.test(text(c)));
    expect(text(ownerLookup!)).toMatch(/created_by = \?/);
    expect(ownerLookup!.slice(1)).toContain('u1');
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockCancelMembers).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
  });

  it("cancels the user's membership subscriptions, each on its community account, before deleting", async () => {
    const memberships = [
      { stripe_subscription_id: 'sub_1', subscription_status: 'active', stripe_account_id: 'acct_1' },
      { stripe_subscription_id: 'sub_2', subscription_status: 'active', stripe_account_id: 'acct_2' },
    ];
    mockQuery.mockResolvedValueOnce(memberships);

    const res = await deleteUser(req(), { params });

    expect(res.status).toBe(200);
    expect(mockCancelMembers).toHaveBeenCalledWith(memberships);
    expect(mockQuery.mock.calls[0].slice(1)).toContain('u1');
    expect(deletes().length).toBeGreaterThan(0);
    expect(mockCancelMembers.mock.invocationCallOrder[0]).toBeLessThan(mockSql.mock.invocationCallOrder[0]);
  });

  it('does not delete the user when a subscription could not be cancelled', async () => {
    mockQuery.mockResolvedValueOnce([{ stripe_subscription_id: 'sub_1', subscription_status: 'active', stripe_account_id: 'acct_1' }]);
    mockCancelMembers.mockResolvedValueOnce(['sub_1']);

    const res = await deleteUser(req(), { params });

    expect(res.status).toBe(502);
    expect(deletes()).toHaveLength(0);
  });
});
