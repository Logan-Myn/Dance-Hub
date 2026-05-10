/**
 * Auth Database Layer Tests - Better Auth + Neon Integration
 *
 * Tests the database operations for authentication-related API routes:
 * 1. Profile creation on signup (INSERT with ON CONFLICT)
 * 2. Profile email sync on email verification (UPDATE by auth_user_id)
 * 3. Profile email sync on email change (UPDATE by auth_user_id)
 *
 * These tests validate the Neon database layer for the auth routes
 * migrated from Supabase to Better Auth + Neon.
 *
 * Schema notes:
 * - Better Auth "user" table uses camelCase: emailVerified, createdAt, updatedAt
 * - profiles table uses snake_case: auth_user_id, created_at, updated_at
 * - auth_user_id is TEXT type (matching Better Auth user.id)
 *
 * Isolation notes:
 * - Each test that needs persistent data creates its own user/profile pair
 *   via `makeAuthUser()` and tracks them in `createdUserIds` / `createdProfileIds`.
 *   `afterAll` cleans them up. No module-level shared mutable state.
 */

import crypto from 'crypto';
import {
  testQuery,
  testQueryOne,
  testSql,
} from '../utils/test-db';

// Interfaces matching the auth database operations
interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  is_admin: boolean;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// Better Auth uses camelCase column names
interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;  // camelCase in Better Auth
  createdAt: string;       // camelCase
  updatedAt: string;       // camelCase
}

describe('Auth Database Layer Tests - Better Auth + Neon Integration', () => {
  // Track every user/profile we create so afterAll can clean up.
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];

  /**
   * Insert a fresh Better-Auth user row, track its id, and return it.
   *
   * The DB has an `on_user_created` AFTER INSERT trigger that auto-inserts a
   * matching `profiles` row from the user's email/name. We rely on that here
   * — never insert a second profile for the same auth_user_id, or queries
   * like `WHERE auth_user_id = X` will return multiple rows and break
   * UPDATE...RETURNING.
   */
  async function makeAuthUser(label: string = 'user'): Promise<{ id: string; email: string }> {
    const id = `auth-test-${label}-${crypto.randomUUID()}`;
    const email = `${id}@test.com`;
    await testSql`
      INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
      VALUES (${id}, ${email}, ${`Test User ${label}`}, false, NOW(), NOW())
    `;
    createdUserIds.push(id);
    return { id, email };
  }

  /**
   * Look up the profile auto-created by the `on_user_created` trigger,
   * optionally rewriting full_name/display_name. We do NOT insert a new
   * profile row — the trigger already created one with auth_user_id set.
   */
  async function makeProfile(
    authUserId: string,
    overrides: Partial<{ full_name: string | null; display_name: string | null }> = {},
  ): Promise<Profile> {
    const fullName = overrides.full_name === undefined ? 'Test Profile User' : overrides.full_name;
    const displayName = overrides.display_name === undefined
      ? (fullName?.split(' ')[0] ?? null)
      : overrides.display_name;

    const profile = await testQueryOne<Profile>`
      UPDATE profiles
      SET full_name = ${fullName}, display_name = ${displayName}, updated_at = NOW()
      WHERE auth_user_id = ${authUserId}
      RETURNING *
    `;
    if (!profile) {
      throw new Error(
        `Expected on_user_created trigger to have inserted profile for ${authUserId}`,
      );
    }
    return profile;
  }

  afterAll(async () => {
    // Profiles first (FK auth_user_id -> "user".id), then users.
    for (const id of createdProfileIds) {
      await testSql`DELETE FROM profiles WHERE id = ${id}`;
    }
    for (const id of createdUserIds) {
      await testSql`DELETE FROM "user" WHERE id = ${id}`;
    }
    createdProfileIds.length = 0;
    createdUserIds.length = 0;
  });

  describe('1. Database Connection', () => {
    it('should connect to Neon database', async () => {
      const result = await testQueryOne<{ now: string }>`SELECT NOW() as now`;
      expect(result).not.toBeNull();
      expect(result?.now).toBeDefined();
    });

    it('should have Better Auth user table', async () => {
      const result = await testQueryOne<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'user'
        ) as exists
      `;
      expect(result?.exists).toBe(true);
    });

    it('should have profiles table with auth_user_id column', async () => {
      const result = await testQueryOne<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'profiles' AND column_name = 'auth_user_id'
        ) as exists
      `;
      expect(result?.exists).toBe(true);
    });
  });

  describe('2. Signup Profile Creation (app/api/auth/signup/route.ts pattern)', () => {
    it('should create profile with full_name and auto-generate display_name', async () => {
      const authUser = await makeAuthUser('signup-fullname');
      const email = `signup-test-${crypto.randomUUID()}@test.com`;
      const fullName = 'John Doe';

      const profile = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at, auth_user_id)
        VALUES (
          gen_random_uuid(),
          ${email},
          ${fullName},
          ${fullName.split(' ')[0]},
          NOW(),
          NOW(),
          ${authUser.id}
        )
        RETURNING *
      `;

      expect(profile).not.toBeNull();
      expect(profile?.email).toBe(email);
      expect(profile?.full_name).toBe(fullName);
      expect(profile?.display_name).toBe('John');
      expect(profile?.auth_user_id).toBe(authUser.id);

      createdProfileIds.push(profile!.id);
    });

    it('should create profile with NULL full_name and display_name', async () => {
      const authUser = await makeAuthUser('signup-null');
      const email = `signup-test-null-${crypto.randomUUID()}@test.com`;
      const fullName = null as string | null;
      const displayName = fullName?.split(' ')[0] || null;

      const profile = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at, auth_user_id)
        VALUES (
          gen_random_uuid(),
          ${email},
          ${fullName},
          ${displayName},
          NOW(),
          NOW(),
          ${authUser.id}
        )
        RETURNING *
      `;

      expect(profile).not.toBeNull();
      expect(profile?.email).toBe(email);
      expect(profile?.full_name).toBeNull();
      expect(profile?.display_name).toBeNull();
      expect(profile?.auth_user_id).toBe(authUser.id);

      createdProfileIds.push(profile!.id);
    });

    it('should handle ON CONFLICT (email) upsert pattern from signup route', async () => {
      const authUser = await makeAuthUser('signup-conflict');
      const profile = await makeProfile(authUser.id, { full_name: 'Original Name' });

      // ON CONFLICT (email) should update auth_user_id and updated_at, leaving
      // other columns alone.
      const updatedProfile = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at, auth_user_id)
        VALUES (
          gen_random_uuid(),
          ${profile.email},
          ${'Updated Name'},
          ${'Updated'},
          NOW(),
          NOW(),
          ${authUser.id}
        )
        ON CONFLICT (email) DO UPDATE SET
          auth_user_id = ${authUser.id},
          updated_at = NOW()
        RETURNING *
      `;

      expect(updatedProfile).not.toBeNull();
      expect(updatedProfile?.id).toBe(profile.id);
      expect(updatedProfile?.auth_user_id).toBe(authUser.id);
      // Original full_name should NOT change (only auth_user_id and updated_at do)
      expect(updatedProfile?.full_name).toBe('Original Name');
    });

    it('should handle display_name extraction from multi-word full_name', async () => {
      const fullName = 'Maria Garcia Lopez';
      const authUser = await makeAuthUser('signup-multiword');
      const email = `multi-word-test-${crypto.randomUUID()}@test.com`;

      const profile = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at, auth_user_id)
        VALUES (
          gen_random_uuid(),
          ${email},
          ${fullName},
          ${fullName.split(' ')[0]},
          NOW(),
          NOW(),
          ${authUser.id}
        )
        RETURNING *
      `;

      expect(profile?.display_name).toBe('Maria');
      expect(profile?.full_name).toBe('Maria Garcia Lopez');
      createdProfileIds.push(profile!.id);
    });
  });

  describe('3. Email Verification Sync (app/api/auth/verify-email/route.ts pattern)', () => {
    it('should update profile email by auth_user_id', async () => {
      const authUser = await makeAuthUser('verify');
      await makeProfile(authUser.id);

      const newEmail = `verified-${crypto.randomUUID()}@test.com`;

      const updatedProfile = await testQueryOne<Profile>`
        UPDATE profiles
        SET email = ${newEmail}, updated_at = NOW()
        WHERE auth_user_id = ${authUser.id}
        RETURNING *
      `;

      expect(updatedProfile).not.toBeNull();
      expect(updatedProfile?.email).toBe(newEmail);
      expect(updatedProfile?.auth_user_id).toBe(authUser.id);
    });

    it('should update updated_at timestamp on email change', async () => {
      const authUser = await makeAuthUser('verify-updated-at');
      await makeProfile(authUser.id);

      const before = await testQueryOne<Profile>`
        SELECT * FROM profiles WHERE auth_user_id = ${authUser.id}
      `;
      expect(before).not.toBeNull();

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const newEmail = `verified2-${crypto.randomUUID()}@test.com`;

      const after = await testQueryOne<Profile>`
        UPDATE profiles
        SET email = ${newEmail}, updated_at = NOW()
        WHERE auth_user_id = ${authUser.id}
        RETURNING *
      `;

      expect(after).not.toBeNull();
      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(before!.updated_at).getTime(),
      );
    });

    it('should handle update when profile does not exist (no-op)', async () => {
      const nonExistentAuthUserId = `non-existent-${crypto.randomUUID()}`;
      const newEmail = 'should-not-update@test.com';

      const result = await testQueryOne<Profile>`
        UPDATE profiles
        SET email = ${newEmail}, updated_at = NOW()
        WHERE auth_user_id = ${nonExistentAuthUserId}
        RETURNING *
      `;

      expect(result).toBeNull();
    });
  });

  describe('4. Email Change Sync (app/api/auth/verify-email-change/route.ts pattern)', () => {
    it('should update email on change verification', async () => {
      const authUser = await makeAuthUser('change');
      await makeProfile(authUser.id);

      const changedEmail = `changed-email-${crypto.randomUUID()}@test.com`;

      const updatedProfile = await testQueryOne<Profile>`
        UPDATE profiles
        SET email = ${changedEmail}, updated_at = NOW()
        WHERE auth_user_id = ${authUser.id}
        RETURNING *
      `;

      expect(updatedProfile).not.toBeNull();
      expect(updatedProfile?.email).toBe(changedEmail);
    });

    it('should handle sequential email updates', async () => {
      const authUser = await makeAuthUser('sequential');
      await makeProfile(authUser.id);

      const email1 = `sequential1-${crypto.randomUUID()}@test.com`;
      const email2 = `sequential2-${crypto.randomUUID()}@test.com`;

      await testSql`
        UPDATE profiles
        SET email = ${email1}, updated_at = NOW()
        WHERE auth_user_id = ${authUser.id}
      `;

      await testSql`
        UPDATE profiles
        SET email = ${email2}, updated_at = NOW()
        WHERE auth_user_id = ${authUser.id}
      `;

      const result = await testQueryOne<Profile>`
        SELECT * FROM profiles WHERE auth_user_id = ${authUser.id}
      `;

      // Last update should win
      expect(result?.email).toBe(email2);
    });
  });

  describe('5. Better Auth User Table Tests', () => {
    it('should query Better Auth user by id', async () => {
      const authUser = await makeAuthUser('lookup');
      const user = await testQueryOne<BetterAuthUser>`
        SELECT * FROM "user" WHERE id = ${authUser.id}
      `;

      expect(user).not.toBeNull();
      expect(user?.email).toBe(authUser.email);
    });

    it('should have session table', async () => {
      const result = await testQueryOne<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'session'
        ) as exists
      `;
      expect(result?.exists).toBe(true);
    });

    it('should have account table', async () => {
      const result = await testQueryOne<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'account'
        ) as exists
      `;
      expect(result?.exists).toBe(true);
    });

    it('should have verification table', async () => {
      const result = await testQueryOne<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'verification'
        ) as exists
      `;
      expect(result?.exists).toBe(true);
    });
  });

  describe('6. Profile-User Relationship Tests', () => {
    it('should join profiles with Better Auth user table', async () => {
      const authUser = await makeAuthUser('join');
      const profile = await makeProfile(authUser.id);

      const result = await testQueryOne<{
        profile_id: string;
        profile_email: string;
        auth_user_id: string;
        auth_email: string;
        auth_name: string;
      }>`
        SELECT
          p.id as profile_id,
          p.email as profile_email,
          u.id as auth_user_id,
          u.email as auth_email,
          u.name as auth_name
        FROM profiles p
        JOIN "user" u ON p.auth_user_id = u.id
        WHERE p.id = ${profile.id}
      `;

      expect(result).not.toBeNull();
      expect(result?.auth_user_id).toBe(authUser.id);
    });

    it('should find profile by auth_user_id', async () => {
      const authUser = await makeAuthUser('lookup-by-auth');
      const profile = await makeProfile(authUser.id);

      const found = await testQueryOne<Profile>`
        SELECT * FROM profiles WHERE auth_user_id = ${authUser.id}
      `;

      expect(found).not.toBeNull();
      expect(found?.id).toBe(profile.id);
    });

    it('should allow NULL auth_user_id for legacy profiles', async () => {
      const legacyEmail = `legacy-profile-${crypto.randomUUID()}@test.com`;

      const legacyProfile = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, full_name, display_name, created_at, updated_at, auth_user_id)
        VALUES (
          gen_random_uuid(),
          ${legacyEmail},
          'Legacy User',
          NULL,
          NOW(),
          NOW(),
          NULL
        )
        RETURNING *
      `;

      expect(legacyProfile).not.toBeNull();
      expect(legacyProfile?.auth_user_id).toBeNull();
      createdProfileIds.push(legacyProfile!.id);
    });
  });

  describe('7. Constraint Tests', () => {
    it('should enforce unique email constraint on profiles', async () => {
      const authUser = await makeAuthUser('unique-1');
      const profile = await makeProfile(authUser.id);

      const otherUser = await makeAuthUser('unique-2');

      // Try to insert duplicate email without ON CONFLICT - should fail
      let errorThrown = false;
      try {
        await testSql`
          INSERT INTO profiles (id, email, created_at, updated_at, auth_user_id)
          VALUES (gen_random_uuid(), ${profile.email}, NOW(), NOW(), ${otherUser.id})
        `;
      } catch (error) {
        errorThrown = true;
        expect(String(error)).toContain('profiles_email_key');
      }
      expect(errorThrown).toBe(true);
    });

    it('should allow multiple NULL display_names', async () => {
      const email1 = `null-display1-${crypto.randomUUID()}@test.com`;
      const email2 = `null-display2-${crypto.randomUUID()}@test.com`;

      const profile1 = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, display_name, created_at, updated_at)
        VALUES (gen_random_uuid(), ${email1}, NULL, NOW(), NOW())
        RETURNING *
      `;

      const profile2 = await testQueryOne<Profile>`
        INSERT INTO profiles (id, email, display_name, created_at, updated_at)
        VALUES (gen_random_uuid(), ${email2}, NULL, NOW(), NOW())
        RETURNING *
      `;

      expect(profile1?.display_name).toBeNull();
      expect(profile2?.display_name).toBeNull();
      createdProfileIds.push(profile1!.id, profile2!.id);
    });

    it('should enforce foreign key from profiles.auth_user_id to user.id', async () => {
      const fakeAuthUserId = `this-user-does-not-exist-${crypto.randomUUID()}`;
      const email = `fk-test-${crypto.randomUUID()}@test.com`;

      let errorThrown = false;
      try {
        await testSql`
          INSERT INTO profiles (id, email, auth_user_id, created_at, updated_at)
          VALUES (gen_random_uuid(), ${email}, ${fakeAuthUserId}, NOW(), NOW())
        `;
      } catch (error) {
        errorThrown = true;
        expect(String(error)).toContain('foreign key');
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('8. Better Auth Schema Verification', () => {
    it('should have all required Better Auth columns in user table', async () => {
      const columns = await testQuery<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user'
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((c) => c.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('emailVerified');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('should have custom Better Auth columns', async () => {
      const columns = await testQuery<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user'
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((c) => c.column_name);

      expect(columnNames).toContain('displayName');
      expect(columnNames).toContain('fullName');
      expect(columnNames).toContain('avatarUrl');
      expect(columnNames).toContain('isAdmin');
      expect(columnNames).toContain('stripeAccountId');
    });

    it('should have session table with required columns', async () => {
      const columns = await testQuery<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'session'
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((c) => c.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('userId');
      expect(columnNames).toContain('token');
      expect(columnNames).toContain('expiresAt');
    });

    it('should have account table with required columns', async () => {
      const columns = await testQuery<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'account'
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((c) => c.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('userId');
      expect(columnNames).toContain('providerId');
      expect(columnNames).toContain('accountId');
    });
  });
});
