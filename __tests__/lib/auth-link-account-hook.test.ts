/**
 * revokeUnverifiedPassword (better-auth account.create hook, wired in
 * lib/auth-server.ts) closes the account pre-hijack: someone registers the
 * victim's email with a password and never verifies it; when the victim later
 * signs in with Google, better-auth links Google to that user and marks the
 * email verified, which would make the attacker's password work. Linking a
 * social account to a user whose email is not verified must remove the
 * password and end that user's sessions.
 *
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ sql: jest.fn() }));

import { revokeUnverifiedPassword, type AuthAccountStore } from '@/lib/auth-hooks';

function makeStore(user: { id: string; emailVerified: boolean } | null, accounts: { id: string; providerId: string }[]) {
  return {
    findUserById: jest.fn().mockResolvedValue(user),
    findAccounts: jest.fn().mockResolvedValue(accounts),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    deleteSessions: jest.fn().mockResolvedValue(undefined),
  } satisfies AuthAccountStore;
}

describe('revokeUnverifiedPassword', () => {
  it('removes the password and sessions when Google is linked to an unverified user', async () => {
    const store = makeStore({ id: 'u1', emailVerified: false }, [
      { id: 'acc-pw', providerId: 'credential' },
      { id: 'acc-g', providerId: 'google' },
    ]);
    await expect(revokeUnverifiedPassword({ userId: 'u1', providerId: 'google' }, store)).resolves.toBe(true);
    expect(store.deleteAccount).toHaveBeenCalledTimes(1);
    expect(store.deleteAccount).toHaveBeenCalledWith('acc-pw');
    expect(store.deleteSessions).toHaveBeenCalledWith('u1');
  });

  it('keeps the password of a user who had already verified their email', async () => {
    const store = makeStore({ id: 'u1', emailVerified: true }, [
      { id: 'acc-pw', providerId: 'credential' },
      { id: 'acc-g', providerId: 'google' },
    ]);
    await expect(revokeUnverifiedPassword({ userId: 'u1', providerId: 'google' }, store)).resolves.toBe(false);
    expect(store.deleteAccount).not.toHaveBeenCalled();
    expect(store.deleteSessions).not.toHaveBeenCalled();
  });

  it('does nothing when the new account is the password account itself (email sign-up)', async () => {
    const store = makeStore({ id: 'u1', emailVerified: false }, [{ id: 'acc-pw', providerId: 'credential' }]);
    await expect(revokeUnverifiedPassword({ userId: 'u1', providerId: 'credential' }, store)).resolves.toBe(false);
    expect(store.findUserById).not.toHaveBeenCalled();
    expect(store.deleteAccount).not.toHaveBeenCalled();
  });

  it('does nothing for a new Google user with no password', async () => {
    const store = makeStore({ id: 'u1', emailVerified: false }, [{ id: 'acc-g', providerId: 'google' }]);
    await expect(revokeUnverifiedPassword({ userId: 'u1', providerId: 'google' }, store)).resolves.toBe(false);
    expect(store.deleteAccount).not.toHaveBeenCalled();
    expect(store.deleteSessions).not.toHaveBeenCalled();
  });

  it('does nothing when the user cannot be found', async () => {
    const store = makeStore(null, []);
    await expect(revokeUnverifiedPassword({ userId: 'gone', providerId: 'google' }, store)).resolves.toBe(false);
    expect(store.deleteAccount).not.toHaveBeenCalled();
  });
});
