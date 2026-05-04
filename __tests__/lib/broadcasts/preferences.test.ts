import {
  setCommunityBroadcastsEnabled,
  getCommunityPreferencesForUser,
} from '@/lib/broadcasts/preferences';
import { sql, query } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  query: jest.fn(),
}));

const mockedSql = sql as unknown as jest.Mock;
const mockedQuery = query as unknown as jest.Mock;

describe('setCommunityBroadcastsEnabled', () => {
  beforeEach(() => mockedSql.mockReset());

  it('upserts the row with broadcasts_enabled and stamps unsubscribed_at when false', async () => {
    mockedSql.mockResolvedValueOnce(undefined);
    await setCommunityBroadcastsEnabled('user-1', 'community-1', false);
    expect(mockedSql).toHaveBeenCalledTimes(1);
    const sqlText = mockedSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/INSERT INTO community_email_preferences/);
    expect(sqlText).toMatch(/ON CONFLICT \(user_id, community_id\)/);
  });

  it('clears unsubscribed_at when re-enabling', async () => {
    mockedSql.mockResolvedValueOnce(undefined);
    await setCommunityBroadcastsEnabled('user-1', 'community-1', true);
    const params = mockedSql.mock.calls[0].slice(1);
    // params: [userId, communityId, enabled, unsubscribedAt]
    expect(params).toEqual(['user-1', 'community-1', true, null]);
  });
});

describe('getCommunityPreferencesForUser', () => {
  beforeEach(() => mockedQuery.mockReset());

  it('returns one row per community the user is a member of', async () => {
    mockedQuery.mockResolvedValueOnce([
      { community_id: 'c1', name: 'Alpha', slug: 'alpha', broadcasts_enabled: true },
      { community_id: 'c2', name: 'Beta', slug: 'beta', broadcasts_enabled: false },
    ]);
    const rows = await getCommunityPreferencesForUser('user-1');
    expect(rows).toEqual([
      { communityId: 'c1', name: 'Alpha', slug: 'alpha', broadcastsEnabled: true },
      { communityId: 'c2', name: 'Beta', slug: 'beta', broadcastsEnabled: false },
    ]);
  });
});
