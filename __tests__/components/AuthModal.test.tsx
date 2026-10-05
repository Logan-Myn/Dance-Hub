import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '@/components/auth/AuthModal';
import { resetPassword, signIn, signInWithGoogle, signUp } from '@/lib/auth';

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
  resetPassword: jest.fn().mockResolvedValue(undefined),
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
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
  await userEvent.type(screen.getByLabelText('Password'), 'password123');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
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
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signin" redirectUrl="https://evil.example/login" />);
    expect(localStorage.getItem('auth_redirect_url')).toBeNull();
    await signInWithPassword();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends Google sign-in back to our own origin only', async () => {
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signin" redirectUrl="@evil.example" />);
    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith(`${window.location.origin}/dashboard`));
  });
});

describe('AuthModal errors and confirmations', () => {
  it('shows a wrong password under the form, not only in a toast', async () => {
    (signIn as jest.Mock).mockRejectedValueOnce(new Error('Invalid email or password'));
    const onClose = jest.fn();
    render(<AuthModal isOpen onClose={onClose} initialTab="signin" />);
    await signInWithPassword();
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains an email that is not confirmed yet', async () => {
    (signIn as jest.Mock).mockRejectedValueOnce(new Error('Email not verified'));
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signin" />);
    await signInWithPassword();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Confirm your email first/);
  });

  it('refuses a short password before calling the server', async () => {
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signup" />);
    await userEvent.type(screen.getByLabelText('First name'), 'Ana');
    await userEvent.type(screen.getByLabelText('Last name'), 'Silva');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 8 characters for your password.');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('stays open after sign-up and says where the confirmation link went', async () => {
    const onClose = jest.fn();
    render(<AuthModal isOpen onClose={onClose} initialTab="signup" />);
    await userEvent.type(screen.getByLabelText('First name'), 'Ana');
    await userEvent.type(screen.getByLabelText('Last name'), 'Silva');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'longenough');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith('ana@b.co', 'longenough', 'Ana Silva', undefined));
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
    expect(screen.getByText('ana@b.co')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('confirms a reset request without saying whether the account exists', async () => {
    render(<AuthModal isOpen onClose={jest.fn()} initialTab="signin" />);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.type(screen.getByLabelText('Email'), 'ana@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('ana@b.co'));
    expect(await screen.findByText(/If an account exists for ana@b.co/)).toBeInTheDocument();
  });
});
