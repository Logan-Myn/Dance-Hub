import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyEmailPage from '@/app/auth/verify-email/page';
import VerifySignupPage from '@/app/auth/verify-signup/page';

const mockPush = jest.fn();
let mockToken: string | null = 'tok';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => ({ get: () => mockToken }),
}));

const mockVerifyEmail = jest.fn();
jest.mock('@/lib/auth-client', () => ({
  authClient: { verifyEmail: (...a: unknown[]) => mockVerifyEmail(...a) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  localStorage.clear();
  mockToken = 'tok';
  mockVerifyEmail.mockResolvedValue({ data: { status: true }, error: null });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ redirectTo: '/dashboard' }),
  }) as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  (console.log as jest.Mock).mockRestore();
});

async function finishVerification() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
}

describe.each([
  ['verify-email', VerifyEmailPage],
  ['verify-signup', VerifySignupPage],
])('%s page', (_name, Page) => {
  it('follows a stored same-origin redirect', async () => {
    localStorage.setItem('auth_redirect_url', '/salsa');
    render(<Page />);
    await finishVerification();
    expect(mockPush).toHaveBeenCalledWith('/salsa');
  });

  it('ignores a stored external redirect and goes to the dashboard', async () => {
    localStorage.setItem('auth_redirect_url', 'https://evil.example/login');
    render(<Page />);
    await finishVerification();
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(mockPush).not.toHaveBeenCalledWith('https://evil.example/login');
    expect(localStorage.getItem('auth_redirect_url')).toBeNull();
  });
});

it('verify-email sends "Go to Login" to the login modal, not a missing page', async () => {
  jest.useRealTimers();
  mockToken = null;
  render(<VerifyEmailPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Go to Login' }));
  expect(mockPush).toHaveBeenCalledWith('/?auth=login&redirect=%2Fdashboard');
});
