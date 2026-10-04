import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreadView from '@/components/ThreadView';

jest.mock('next/navigation', () => ({
  usePathname: () => '/bachataflow',
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1', email: 'u@example.com', name: 'U' } },
    user: { id: 'u1', email: 'u@example.com', name: 'U', image: '' },
    loading: false,
  }),
}));

// TipTap's useEditor doesn't render synchronously in jsdom; replace the
// Editor with a lightweight stand-in that just renders its content so we
// can assert thread body text is displayed.
jest.mock('@/components/Editor', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'editor-stub' }, content),
}));

const baseThread = {
  id: 't1',
  user_id: 'u1',
  title: 'Hello world',
  content: 'Body content here',
  author: { name: 'Jane', image: '' },
  created_at: '2026-04-20T10:00:00.000Z',
  likes_count: 2,
  comments_count: 1,
  category: 'Announcements',
  likes: ['u2'],
  comments: [
    {
      id: 'c1',
      thread_id: 't1',
      user_id: 'u2',
      content: 'Reply',
      created_at: '2026-04-20T10:05:00.000Z',
      parent_id: undefined,
      author: { name: 'Bob', image: '' },
      likes: [],
      likes_count: 0,
    },
  ],
  pinned: false,
};

describe('ThreadView', () => {
  it('renders the thread title and content in modal layout (default)', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Body content here')).toBeInTheDocument();
  });

  it('renders comments', () => {
    const threadWithDistinctReply = {
      ...baseThread,
      comments: [
        {
          ...baseThread.comments[0],
          content: 'This is a unique comment body',
        },
      ],
    };
    render(
      <ThreadView
        thread={threadWithDistinctReply as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
      />,
    );
    expect(
      screen.getByText('This is a unique comment body'),
    ).toBeInTheDocument();
  });

  it('renders headerSlot when provided in page layout', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
        layout="page"
        headerSlot={<div>Back to feed</div>}
      />,
    );
    expect(screen.getByText('Back to feed')).toBeInTheDocument();
  });

  it('does not render headerSlot in modal layout', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
        layout="modal"
        headerSlot={<div>Should not appear</div>}
      />,
    );
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });
});

describe('ThreadView comment loading', () => {
  const emptyThread = { ...baseThread, comments: [], comments_count: 0 };
  let commentFetches: number;

  beforeEach(() => {
    commentFetches = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/comments')) {
        commentFetches += 1;
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: true, json: async () => null } as Response;
    }) as unknown as typeof fetch;
  });

  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

  it('fetches comments exactly once for a thread with zero comments when the parent stores updates', async () => {
    // Mirrors FeedClient: the parent merges every update into a new thread object.
    function Parent() {
      const [thread, setThread] = React.useState(emptyThread);
      return (
        <ThreadView
          thread={thread as never}
          onClose={() => {}}
          onLikeUpdate={() => {}}
          onThreadUpdate={(_id, updates) =>
            setThread((prev) => ({ ...prev, ...updates }) as typeof prev)
          }
        />
      );
    }

    render(<Parent />);
    await waitFor(() => expect(commentFetches).toBe(1));
    await settle();
    expect(commentFetches).toBe(1);
  });

  it('fetches once when the parent rebuilds the thread object on every render', async () => {
    // Mirrors the thread page: a fresh object (and comments array) per render,
    // with every update causing another render (router.refresh in production).
    const onThreadUpdate = jest.fn();
    function Parent() {
      const [, setTick] = React.useState(0);
      return (
        <ThreadView
          thread={{ ...emptyThread, comments: [] } as never}
          onClose={() => {}}
          onLikeUpdate={() => {}}
          onThreadUpdate={(...args) => {
            onThreadUpdate(...args);
            setTick((t) => t + 1);
          }}
        />
      );
    }

    const { rerender } = render(<Parent />);
    await waitFor(() => expect(commentFetches).toBe(1));
    rerender(<Parent />);
    await settle();
    expect(commentFetches).toBe(1);
    // Nothing changed (still no comments), so the parent is not told to update.
    expect(onThreadUpdate).not.toHaveBeenCalled();
  });

  it('still loads comments under Strict Mode double mounting', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/comments')) {
        commentFetches += 1;
        return {
          ok: true,
          json: async () => [{ ...baseThread.comments[0], content: 'Loaded later' }],
        } as Response;
      }
      return { ok: true, json: async () => null } as Response;
    }) as unknown as typeof fetch;
    const onThreadUpdate = jest.fn();

    render(
      <React.StrictMode>
        <ThreadView
          thread={emptyThread as never}
          onClose={() => {}}
          onLikeUpdate={() => {}}
          onThreadUpdate={onThreadUpdate}
        />
      </React.StrictMode>,
    );
    expect(await screen.findByText('Loaded later')).toBeInTheDocument();
    expect(onThreadUpdate).toHaveBeenCalledWith('t1', {
      comments: [expect.objectContaining({ content: 'Loaded later' })],
    });
  });

  it('does not fetch when the thread already carries its comments', async () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
      />,
    );
    await settle();
    expect(commentFetches).toBe(0);
  });
});

describe('ThreadView edit', () => {
  it('hands the parent the body the server stored, not the editor HTML', async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ success: true, title: 'Hello world', content: '<p>Stored body</p>' }),
        } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    }) as unknown as typeof fetch;
    const onThreadUpdate = jest.fn();

    render(
      <ThreadView
        thread={{ ...baseThread, content: '<p>Editor body</p>' } as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
        onThreadUpdate={onThreadUpdate}
      />,
    );

    const user = userEvent.setup();
    const menuButton = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
    await user.click(menuButton);
    await user.click(await screen.findByRole('menuitem', { name: /Edit/ }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(onThreadUpdate).toHaveBeenCalledWith('t1', {
        title: 'Hello world',
        content: '<p>Stored body</p>',
      }),
    );
  });
});
