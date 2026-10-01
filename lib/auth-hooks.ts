import { sql } from '@/lib/db';

// Logic behind the better-auth databaseHooks in lib/auth-server.ts, kept here
// so it can be unit-tested without building the auth instance.

/** The parts of better-auth's internalAdapter the link hook needs. */
export interface AuthAccountStore {
  findUserById(userId: string): Promise<{ id: string; emailVerified: boolean } | null>;
  findAccounts(userId: string): Promise<{ id: string; providerId: string }[]>;
  deleteAccount(accountId: string): Promise<unknown>;
  deleteSessions(userId: string): Promise<unknown>;
}

/**
 * Account pre-hijack guard, run after an account row is created.
 *
 * Email sign-up creates the user and its password ("credential") account
 * before the email is verified. If someone else registered that email, the
 * real owner's later Google sign-in links Google to the same user and marks
 * the email verified, which would make the squatter's password valid. So when
 * a social account is linked to a user whose email is still unverified, the
 * password is removed and every session of that user ends. The owner can set a
 * password again with "forgot password", which recreates the account.
 *
 * Runs before better-auth marks the email verified and before it creates the
 * new session, so the Google sign-in itself is unaffected.
 */
export async function revokeUnverifiedPassword(
  account: { userId: string; providerId: string },
  store: AuthAccountStore
): Promise<boolean> {
  if (account.providerId === 'credential') return false;
  const user = await store.findUserById(account.userId);
  if (!user || user.emailVerified) return false;

  const passwords = (await store.findAccounts(account.userId)).filter(
    (a) => a.providerId === 'credential'
  );
  if (passwords.length === 0) return false;

  for (const password of passwords) await store.deleteAccount(password.id);
  await store.deleteSessions(account.userId);
  console.warn(
    `[Auth] Removed the unverified password of user ${account.userId} on ${account.providerId} link`
  );
  return true;
}

/**
 * Same operations straight on better-auth's tables, for the rare hook call
 * that arrives without an endpoint context (and so without internalAdapter).
 */
export const sqlAccountStore: AuthAccountStore = {
  async findUserById(userId) {
    const rows = await sql<{ id: string; emailVerified: boolean }[]>`
      SELECT id, "emailVerified" FROM "user" WHERE id = ${userId}
    `;
    return rows[0] ?? null;
  },
  async findAccounts(userId) {
    return sql<{ id: string; providerId: string }[]>`
      SELECT id, "providerId" FROM account WHERE "userId" = ${userId}
    `;
  },
  async deleteAccount(accountId) {
    return sql`DELETE FROM account WHERE id = ${accountId}`;
  },
  async deleteSessions(userId) {
    return sql`DELETE FROM session WHERE "userId" = ${userId}`;
  },
};
