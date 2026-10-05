import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordForm from '@/app/auth/reset-password/ResetPasswordForm';

const mockShowAuthModal = jest.fn();
jest.mock('@/contexts/AuthModalContext', () => ({
  useAuthModal: () => ({ showAuthModal: mockShowAuthModal }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('@/lib/auth', () => ({}));

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

async function choose(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText('New password'), password);
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
}

describe('ResetPasswordForm', () => {
  it('refuses a password under 8 characters before calling the server', async () => {
    render(<ResetPasswordForm token="t" />);
    await choose('short12');
    expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 8 characters for your password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses two passwords that differ', async () => {
    render(<ResetPasswordForm token="t" />);
    await choose('longenough', 'longenougH');
    expect(await screen.findByRole('alert')).toHaveTextContent("The two passwords don't match.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the password and offers to sign in', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<ResetPasswordForm token="abc" />);
    await choose('longenough');
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toHaveFocus();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'abc', password: 'longenough' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockShowAuthModal).toHaveBeenCalledWith('signin', '/dashboard');
  });

  it('explains a link the server says is used or expired', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid token' }) });
    render(<ResetPasswordForm token="old" />);
    await choose('longenough');
    expect(await screen.findByText('This link no longer works')).toBeInTheDocument();
  });

  it('starts on the expired step without a token, and asks for a new link', async () => {
    render(<ResetPasswordForm token={null} />);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    await waitFor(() => expect(mockShowAuthModal).toHaveBeenCalledWith('reset'));
  });
});
