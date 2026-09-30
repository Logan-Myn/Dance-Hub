/**
 * Route guards in lib/community-auth.ts.
 *
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), query: jest.fn() }));
jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/community-data', () => ({
  getMembershipStatus: jest.fn(),
  getUserIsAdmin: jest.fn(),
}));

import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { getMembershipStatus, getUserIsAdmin } from '@/lib/community-data';
import {
  requireCommunityManager,
  requireCommunityViewer,
  requirePlatformAdmin,
  requireStripeAccountManager,
} from '@/lib/community-auth';

const mockQueryOne = queryOne as jest.Mock;
const mockSession = getSession as jest.Mock;
const mockMembership = getMembershipStatus as jest.Mock;
const mockIsAdmin = getUserIsAdmin as jest.Mock;

const community = {
  id: 'c1',
  slug: 'salsa',
  name: 'Salsa',
  created_by: 'owner',
  stripe_account_id: 'acct_1',
};
const signedInAs = (id: string) => mockSession.mockResolvedValue({ user: { id } });
const notMember = { isMember: false, isPreRegistered: false };

beforeEach(() => {
  jest.resetAllMocks();
  mockIsAdmin.mockResolvedValue(false);
  mockMembership.mockResolvedValue(notMember);
});

// userCanManageCommunity reads created_by with its own query, after the
// guard's community lookup.
const communityThenOwnerLookup = () =>
  mockQueryOne
    .mockResolvedValueOnce(community)
    .mockResolvedValueOnce({ created_by: community.created_by });

describe('requireCommunityManager', () => {
  it('401s when signed out, before touching the database', async () => {
    mockSession.mockResolvedValue(null);
    const guard = await requireCommunityManager('salsa');
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('404s for an unknown community', async () => {
    signedInAs('owner');
    mockQueryOne.mockResolvedValueOnce(null);
    const guard = await requireCommunityManager('nope');
    if (!guard.ok) expect(guard.response.status).toBe(404);
    else throw new Error('expected denial');
  });

  it('403s a signed-in user who does not own the community', async () => {
    signedInAs('stranger');
    communityThenOwnerLookup();
    const guard = await requireCommunityManager('salsa');
    if (!guard.ok) expect(guard.response.status).toBe(403);
    else throw new Error('expected denial');
  });

  it('allows the owner', async () => {
    signedInAs('owner');
    communityThenOwnerLookup();
    const guard = await requireCommunityManager('salsa');
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.community.id).toBe('c1');
  });

  it('allows a platform admin who does not own it', async () => {
    signedInAs('admin');
    communityThenOwnerLookup();
    mockIsAdmin.mockResolvedValue(true);
    expect((await requireCommunityManager('salsa')).ok).toBe(true);
  });
});

describe('requireCommunityViewer', () => {
  beforeEach(() => mockQueryOne.mockResolvedValue(community));

  it('403s a signed-in non-member', async () => {
    signedInAs('stranger');
    const guard = await requireCommunityViewer('salsa');
    if (!guard.ok) expect(guard.response.status).toBe(403);
    else throw new Error('expected denial');
  });

  it('allows an active member', async () => {
    signedInAs('member');
    mockMembership.mockResolvedValue({ isMember: true, isPreRegistered: false });
    expect((await requireCommunityViewer('salsa')).ok).toBe(true);
  });

  it('allows the owner without a membership row', async () => {
    signedInAs('owner');
    expect((await requireCommunityViewer('salsa')).ok).toBe(true);
  });

  it('keeps pre-registered users out unless the route opts in', async () => {
    signedInAs('early');
    mockMembership.mockResolvedValue({ isMember: false, isPreRegistered: true });
    expect((await requireCommunityViewer('salsa')).ok).toBe(false);
    expect((await requireCommunityViewer('salsa', { allowPreRegistered: true })).ok).toBe(true);
  });
});

describe('requireStripeAccountManager', () => {
  it('401s when signed out', async () => {
    mockSession.mockResolvedValue(null);
    const guard = await requireStripeAccountManager('acct_1');
    if (!guard.ok) expect(guard.response.status).toBe(401);
    else throw new Error('expected denial');
  });

  it("404s (not 403) on someone else's account so it does not confirm it exists", async () => {
    signedInAs('stranger');
    communityThenOwnerLookup();
    const guard = await requireStripeAccountManager('acct_1');
    if (!guard.ok) expect(guard.response.status).toBe(404);
    else throw new Error('expected denial');
  });

  it("allows the owner of the account's community", async () => {
    signedInAs('owner');
    communityThenOwnerLookup();
    const guard = await requireStripeAccountManager('acct_1');
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.community.stripe_account_id).toBe('acct_1');
  });
});

describe('requirePlatformAdmin', () => {
  it('403s a signed-in non-admin', async () => {
    signedInAs('user');
    const guard = await requirePlatformAdmin();
    if (!guard.ok) expect(guard.response.status).toBe(403);
    else throw new Error('expected denial');
  });

  it('allows an admin', async () => {
    signedInAs('admin');
    mockIsAdmin.mockResolvedValue(true);
    expect((await requirePlatformAdmin()).ok).toBe(true);
  });
});
