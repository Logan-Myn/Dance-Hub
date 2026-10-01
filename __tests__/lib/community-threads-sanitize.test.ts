/**
 * Rows written before thread bodies were sanitized on write may still hold
 * unsafe HTML, so the loaders that send thread bodies to the browser
 * sanitize them on the way out too.
 *
 * @jest-environment node
 */
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  };
});

jest.mock('@/lib/db', () => ({ query: jest.fn(), queryOne: jest.fn() }));

import { getCommunityThreads, getThreadById } from '@/lib/community-data';
import { query, queryOne } from '@/lib/db';

const STORED = '<p onclick="steal()">Hi</p><img src=x onerror="alert(1)">';

const row = {
  id: 't1',
  title: 'Hello',
  content: STORED,
  created_at: '2026-04-20T10:00:00Z',
  user_id: 'u1',
  category_name: null,
  category_id: null,
  pinned: false,
  profile_id: 'p1',
  profile_full_name: 'Jane',
  profile_avatar_url: null,
  profile_display_name: null,
  likes: [],
  likes_count: 0,
  comments_count: 0,
};

afterEach(() => jest.clearAllMocks());

it('getCommunityThreads returns sanitized bodies', async () => {
  (query as jest.Mock).mockResolvedValueOnce([row]);
  const [thread] = await getCommunityThreads('c1');
  expect(thread.content).toBe('<p>Hi</p>');
});

it('getThreadById returns a sanitized body', async () => {
  (queryOne as jest.Mock).mockResolvedValueOnce(row);
  (query as jest.Mock).mockResolvedValueOnce([]);
  const thread = await getThreadById('c1', 't1');
  expect(thread?.content).toBe('<p>Hi</p>');
});
