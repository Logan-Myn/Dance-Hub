/**
 * Security-relevant better-auth options in lib/auth-server.ts. The module is
 * loaded with better-auth stubbed (it is an ESM package Jest can't load), so
 * the test sees exactly the options object passed to betterAuth().
 *
 * @jest-environment node
 */
jest.mock('better-auth', () => ({ betterAuth: (options: unknown) => ({ options }) }));
jest.mock('pg', () => ({ Pool: jest.fn() }));
jest.mock('@/lib/db', () => ({ sql: jest.fn() }));
jest.mock('@/lib/resend/email-service', () => ({ getEmailService: jest.fn() }));
jest.mock('@/lib/resend/templates/auth/signup-verification', () => ({}));
jest.mock('@/lib/resend/templates/auth/password-reset', () => ({}));
jest.mock('@/lib/resend/templates/auth/email-change', () => ({}));

const mockRevoke = jest.fn();
const mockSync = jest.fn();
jest.mock('@/lib/auth-hooks', () => ({
  revokeUnverifiedPassword: (...a: unknown[]) => mockRevoke(...a),
  syncProfileEmail: (...a: unknown[]) => mockSync(...a),
  sqlAccountStore: { name: 'sql-store' },
}));

import { auth } from '@/lib/auth-server';
import { CLIENT_IP_HEADER } from '@/lib/client-ip';

type Hook = (row: unknown, ctx: unknown) => Promise<void>;
const options = auth.options as unknown as {
  advanced: { ipAddress: { ipAddressHeaders: string[] } };
  account: { accountLinking: { enabled: boolean; trustedProviders?: string[] } };
  databaseHooks: {
    account: { create: { after: Hook } };
    user: { update: { after: Hook } };
  };
};

beforeEach(() => jest.clearAllMocks());

it('takes the client IP only from the header nginx sets (x-real-ip)', () => {
  expect(CLIENT_IP_HEADER).toBe('x-real-ip');
  expect(options.advanced.ipAddress.ipAddressHeaders).toEqual(['x-real-ip']);
});

it('does not trust any provider to link without a verified email', () => {
  expect(options.account.accountLinking.trustedProviders ?? []).toEqual([]);
});

it('runs the pre-hijack guard on every new account, with the better-auth adapter', async () => {
  const internalAdapter = { name: 'internal' };
  const account = { userId: 'u1', providerId: 'google' };
  await options.databaseHooks.account.create.after(account, { context: { internalAdapter } });
  expect(mockRevoke).toHaveBeenCalledWith(account, internalAdapter);
});

it('falls back to direct SQL when the hook runs without an endpoint context', async () => {
  const account = { userId: 'u1', providerId: 'google' };
  await options.databaseHooks.account.create.after(account, null);
  expect(mockRevoke).toHaveBeenCalledWith(account, { name: 'sql-store' });
});

it('syncs the profile email after a user update', async () => {
  const user = { id: 'u1', email: 'new@x.com' };
  await options.databaseHooks.user.update.after(user, null);
  expect(mockSync).toHaveBeenCalledWith(user);
});
