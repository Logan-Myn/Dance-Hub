import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '@/components/auth/AuthModal';
import { signIn, signInWithGoogle } from '@/lib/auth';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock('@/lib/auth', () => ({
  signIn: jest.fn().mockResolvedValue({}),
  signUp: jest.fn().mockResolvedValue({}),
  resetPassword: jest.fn(),
  signInWithGoogle: jest.fn().mockResolvedValue({}),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

async function signInWithPassword() {
  await userEvent.type(screen.getByPlaceholderText('Email'), 'a@b.co');
  await userEvent.type(screen.getByPlaceholderText('Password'), 'password123');
  await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(signIn).toHaveBeenCalled());
}

describe('AuthModal redirect', () => {
  it('goes back to a same-origin path after sign-in', async () => {
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signin" redirectUrl="/salsa/admin" />);
    expect(localStorage.getItem('auth_redirect_url')).toBe('/salsa/admin');
    await signInWithPassword();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/salsa/admin'));
  });

  it('never stores or follows an external redirect', async () => {
    render(
      <AuthModal isOpen onClose={jest.fn()} initialTab="signin" redirectUrl="https://evil.example/login" />
    );
    expect(localStorage.getItem('auth_redirect_url')).toBeNull();
    await signInWithPassword();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends Google sign-in back to our own origin only', async () => {
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signin" redirectUrl="@evil.example" />);
    await userEvent.click(screen.getAllByRole('button', { name: /Continue with Google/ })[0]);
    await waitFor(() =>
      expect(signInWithGoogle).toHaveBeenCalledWith(`${window.location.origin}/dashboard`)
    );
  });
});
