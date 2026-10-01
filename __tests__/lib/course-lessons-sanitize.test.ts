/**
 * The classroom page loader returns lesson content sanitized, for rows stored
 * before lesson saves were sanitized.
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

import { getCourseWithChapters } from '@/lib/community-data';
import { query, queryOne } from '@/lib/db';

it('getCourseWithChapters returns sanitized lesson content', async () => {
  (queryOne as jest.Mock).mockResolvedValueOnce({
    id: 'co1',
    title: 'Basics',
    slug: 'basics',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  (query as jest.Mock)
    .mockResolvedValueOnce([{ id: 'ch1', course_id: 'co1', chapter_position: 0 }])
    .mockResolvedValueOnce([
      { id: 'l1', chapter_id: 'ch1', content: '<p>Hi<img src=x onerror="alert(1)"></p>' },
      { id: 'l2', chapter_id: 'ch1', content: null },
    ]);

  const course = await getCourseWithChapters('c1', 'basics', null);
  const [l1, l2] = course!.chapters[0].lessons;
  expect(l1.content).toBe('<p>Hi</p>');
  expect(l2.content).toBeNull();
});
