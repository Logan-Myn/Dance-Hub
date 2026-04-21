import React from 'react';
import { render, screen } from '@testing-library/react';
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
