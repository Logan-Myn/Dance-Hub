import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { query } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  sql: jest.fn().mockResolvedValue(undefined),
}));

const mockedQuery = query as unknown as jest.Mock;

describe('getActiveRecipientsForCommunity', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('returns active members who opted in to teacher_broadcast', async () => {
    mockedQuery.mockResolvedValueOnce([
      { user_id: 'u1', email: 'a@example.com', full_name: 'Alice', unsubscribe_token: 'tok1' },
      { user_id: 'u2', email: 'b@example.com', full_name: 'Bob', unsubscribe_token: 'tok2' },
    ]);

    const result = await getActiveRecipientsForCommunity('community-123');

    expect(result).toEqual([
      { userId: 'u1', email: 'a@example.com', displayName: 'Alice', unsubscribeToken: 'tok1' },
      { userId: 'u2', email: 'b@example.com', displayName: 'Bob', unsubscribeToken: 'tok2' },
    ]);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    // Spot-check query content
    const sqlText = mockedQuery.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/status = 'active'/);
    expect(sqlText).toMatch(/teacher_broadcast/);
    expect(sqlText).toMatch(/unsubscribed_all/);
  });

  it('returns empty array when no members match', async () => {
    mockedQuery.mockResolvedValueOnce([]);
    const result = await getActiveRecipientsForCommunity('community-123');
    expect(result).toEqual([]);
  });

  it('defaults displayName to "there" when full_name is null', async () => {
    mockedQuery.mockResolvedValueOnce([
      { user_id: 'u1', email: 'a@example.com', full_name: null, unsubscribe_token: null },
    ]);
    const result = await getActiveRecipientsForCommunity('c1');
    expect(result[0].displayName).toBe('there');
    expect(result[0].unsubscribeToken).toBeNull();
  });

  it('SQL filters out members with broadcasts_enabled=false in this community', async () => {
    mockedQuery.mockResolvedValueOnce([]);
    await getActiveRecipientsForCommunity('community-123');
    const sqlText = mockedQuery.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/community_email_preferences/);
    expect(sqlText).toMatch(/cep\.broadcasts_enabled IS DISTINCT FROM false/);
  });
});
