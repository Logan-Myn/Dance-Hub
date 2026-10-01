import React from 'react';
import { render, screen } from '@testing-library/react';
import ThreadCardFluid from '@/components/community/ThreadCardFluid';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));

const props = {
  id: 't1',
  title: 'Hello world',
  author: { name: 'Jane', image: '' },
  created_at: '2026-04-20T10:00:00.000Z',
  likes_count: 0,
  comments_count: 0,
  onClick: jest.fn(),
};

describe('ThreadCardFluid preview', () => {
  it('shows the post as plain text, never as HTML', () => {
    const { container } = render(
      <ThreadCardFluid
        {...props}
        content={'<p>Class moved to <strong>Friday</strong></p><img src="x" onerror="window.__xss = 1"><p>See you &amp; bring shoes</p>'}
      />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
    const preview = screen.getByTestId('thread-preview');
    expect(preview.textContent).toBe('Class moved to Friday\nSee you & bring shoes');
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('shows markup typed as text literally', () => {
    render(<ThreadCardFluid {...props} content={'<p>&lt;b&gt;not bold&lt;/b&gt;</p>'} />);
    expect(screen.getByTestId('thread-preview').textContent).toBe('<b>not bold</b>');
  });
});
