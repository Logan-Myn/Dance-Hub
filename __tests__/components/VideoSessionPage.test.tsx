import React from 'react';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import VideoSessionPage from '@/components/VideoSessionPage';

// The booking-confirmation email links here; a signed-out student must get a
// way to sign in, not an endless spinner.
const mockAuth = { user: null as null | { id: string }, loading: false };
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('next/navigation', () => ({
  useParams: () => ({ bookingId: 'b1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('react-hot-toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <VideoSessionPage />
    </SWRConfig>,
  );
}

beforeEach(() => {
  global.fetch = jest.fn() as jest.Mock;
  mockAuth.user = null;
  mockAuth.loading = false;
});

test('a signed-out visitor gets a sign-in link that returns to this lesson', () => {
  renderPage();

  const link = screen.getByRole('link', { name: /sign in/i });
  expect(link).toHaveAttribute('href', '/?auth=login&redirect=%2Fvideo-session%2Fb1');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('shows the spinner while the session is still loading', () => {
  mockAuth.loading = true;
  renderPage();

  expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  expect(document.querySelector('.animate-spin')).not.toBeNull();
});
