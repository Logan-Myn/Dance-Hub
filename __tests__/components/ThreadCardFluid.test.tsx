import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreadCardFluid from '@/components/community/ThreadCardFluid';
import { getCommunityThreads } from '@/lib/community-data';
import { query } from '@/lib/db';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  };
});

jest.mock('@/lib/db', () => ({ query: jest.fn(), queryOne: jest.fn() }));

const props = {
  id: 't1',
  title: 'Hello world',
  author: { name: 'Jane', image: '' },
  created_at: '2026-04-20T10:00:00.000Z',
  likes_count: 0,
  comments_count: 0,
  onClick: jest.fn(),
};

afterEach(() => jest.clearAllMocks());

describe('ThreadCardFluid preview', () => {
  it('keeps the formatting of the post', () => {
    render(
      <ThreadCardFluid
        {...props}
        content={'<p>Class moved to <strong>Friday</strong>, <em>bring</em> <s>old</s> <u>new</u> shoes</p><ul class="list-disc list-inside"><li><p>one</p></li></ul>'}
      />
    );

    const preview = screen.getByTestId('thread-preview');
    expect(preview.querySelector('strong')?.textContent).toBe('Friday');
    expect(preview.querySelector('em')?.textContent).toBe('bring');
    expect(preview.querySelector('s')?.textContent).toBe('old');
    expect(preview.querySelector('u')?.textContent).toBe('new');
    expect(preview.querySelector('ul li')?.textContent).toBe('one');
  });

  it('shows links as text, so a click anywhere opens the thread', async () => {
    const onClick = jest.fn();
    render(
      <ThreadCardFluid
        {...props}
        onClick={onClick}
        content={'<p>See <a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">the schedule</a> here</p>'}
      />
    );

    const preview = screen.getByTestId('thread-preview');
    expect(preview.querySelector('a')).toBeNull();
    expect(preview.textContent).toBe('See the schedule here');

    await userEvent.click(screen.getByText('the schedule'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows markup typed as text literally', () => {
    render(<ThreadCardFluid {...props} content={'<p>&lt;b&gt;not bold&lt;/b&gt;</p>'} />);
    const preview = screen.getByTestId('thread-preview');
    expect(preview.textContent).toBe('<b>not bold</b>');
    expect(preview.querySelector('b')).toBeNull();
  });

  it('cannot run script from a stored body that reaches the feed', async () => {
    // The card renders thread HTML, so it must only ever get bodies that went
    // through the server loader. Feed a hostile stored row through that path.
    (query as jest.Mock).mockResolvedValueOnce([
      {
        id: 't1',
        title: 'Hello',
        content:
          '<p onclick="window.__xss = 1">Hi <strong>there</strong></p>' +
          '<img src="x" onerror="window.__xss = 1"><script>window.__xss = 1</script>' +
          '<a href="javascript:window.__xss = 1">x</a><svg onload="window.__xss = 1"></svg>',
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
      },
    ]);
    const [thread] = await getCommunityThreads('c1');

    render(<ThreadCardFluid {...props} content={thread.content} />);

    const preview = screen.getByTestId('thread-preview');
    expect(preview.querySelector('strong')?.textContent).toBe('there');
    expect(preview.querySelector('img, script, svg, a')).toBeNull();
    const handlers = Array.from(preview.querySelectorAll('*')).flatMap((el) =>
      Array.from(el.attributes).filter((a) => /^on/i.test(a.name) || /javascript:/i.test(a.value))
    );
    expect(handlers).toEqual([]);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});
