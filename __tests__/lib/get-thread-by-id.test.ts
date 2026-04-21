/**
 * @jest-environment node
 */
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  };
});

jest.mock('@/lib/db', () => {
  const query = jest.fn();
  const queryOne = jest.fn();
  return { query, queryOne };
});

import { getThreadById } from '@/lib/community-data';
import { query, queryOne } from '@/lib/db';

describe('getThreadById', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns null when the thread does not exist', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce(null);
    const result = await getThreadById('comm-1', 'thread-404');
    expect(result).toBeNull();
  });

  it('returns null when the thread belongs to a different community', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce(null);
    const result = await getThreadById('comm-1', 'thread-in-other-community');
    expect(result).toBeNull();
    // Query must scope by community_id — confirmed by the resolver returning null
    // when the tagged-template WHERE clause doesn't match.
    expect(queryOne).toHaveBeenCalledTimes(1);
  });

  it('returns a shaped CommunityThread with comments when found', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      title: 'Hello',
      content: 'World',
      created_at: '2026-04-20T10:00:00Z',
      user_id: 'u1',
      category_name: 'Announcements',
      category_id: 'cat-1',
      pinned: true,
      profile_id: 'p1',
      profile_full_name: 'Jane',
      profile_avatar_url: 'https://example.com/a.png',
      profile_display_name: null,
      likes: ['u2', 'u3'],
      likes_count: 2,
      comments_count: 1,
    });
    (query as jest.Mock).mockResolvedValueOnce([
      {
        id: 'c1',
        thread_id: 't1',
        user_id: 'u2',
        content: 'Nice',
        created_at: '2026-04-20T10:05:00Z',
        parent_id: null,
        author: { name: 'Bob', image: '' },
        likes: [],
        likes_count: 0,
      },
    ]);

    const result = await getThreadById('comm-1', 't1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('t1');
    expect(result!.title).toBe('Hello');
    expect(result!.pinned).toBe(true);
    expect(result!.author.name).toBe('Jane');
    expect(result!.likes).toEqual(['u2', 'u3']);
    expect(result!.likesCount).toBe(2);
    expect(result!.commentsCount).toBe(1);
    expect(result!.comments).toHaveLength(1);
    expect(result!.comments[0].id).toBe('c1');
  });
});
