import React from 'react';
import { render, screen } from '@testing-library/react';
import { UsersTable } from '@/components/admin/platform/UsersTable';
import type { AdminUserRow } from '@/lib/admin-platform/users';

// Only which id the row actions receive matters here.
jest.mock('@/components/admin/delete-user-button', () => ({
  __esModule: true,
  default: ({ userId }: { userId: string }) => <span data-testid="row-actions">{userId}</span>,
}));

const row = (over: Partial<AdminUserRow>): AdminUserRow => ({
  id: 'profile-uuid',
  authUserId: 'auth-user-id',
  email: 'ana@example.com',
  fullName: 'Ana',
  displayName: 'ana',
  avatarUrl: null,
  isAdmin: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  createdCommunities: [],
  joinedCommunities: [],
  ...over,
});

it('gives the row actions the auth user id, not the profile id', () => {
  render(<UsersTable users={[row({})]} />);
  expect(screen.getByTestId('row-actions')).toHaveTextContent('auth-user-id');
});

it('shows no actions for a profile without an auth user', () => {
  render(<UsersTable users={[row({ authUserId: null })]} />);
  expect(screen.queryByTestId('row-actions')).not.toBeInTheDocument();
});
