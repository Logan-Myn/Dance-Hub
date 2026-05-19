/**
 * Migration Script: Migrate users from Supabase profiles to Better Auth
 *
 * This script migrates existing user profiles to Better Auth's user table.
 * Since Supabase password hashes are not directly accessible, users will
 * need to reset their passwords after migration.
 *
 * Usage:
 *   bun run scripts/migration/migrate-users-to-better-auth.ts
 *
 * Prerequisites:
 *   - DATABASE_URL environment variable set
 *   - Better Auth tables created (user, session, account, verification)
 *   - profiles table has auth_user_id column
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function migrateUsers() {
  console.log("Starting user migration from profiles to Better Auth...\n");

  // Get all profiles that haven't been migrated yet
  const profiles = await sql`
    SELECT
      id,
      email,
      full_name,
      display_name,
      avatar_url,
      is_admin,
      stripe_account_id,
      created_at,
      updated_at
    FROM profiles
    WHERE auth_user_id IS NULL
  `;

  if (profiles.length === 0) {
    console.log("No users to migrate. All profiles already linked to Better Auth users.");
    return;
  }

  console.log(`Found ${profiles.length} users to migrate.\n`);

  let migrated = 0;
  let failed = 0;

  for (const profile of profiles) {
    try {
      const userId = generateId();
      const now = new Date().toISOString();

      // Check if user already exists in Better Auth by email
      const existingUser = await sql`
        SELECT id FROM "user" WHERE email = ${profile.email}
      `;

      if (existingUser.length > 0) {
        // Link existing Better Auth user to profile
        await sql`
          UPDATE profiles
          SET auth_user_id = ${existingUser[0].id}
          WHERE id = ${profile.id}
        `;
        console.log(`Linked existing user: ${profile.email}`);
        migrated++;
        continue;
      }

      // Create new Better Auth user
      await sql`
        INSERT INTO "user" (
          id,
          name,
          email,
          "emailVerified",
          image,
          "createdAt",
          "updatedAt",
          "displayName",
          "fullName",
          "avatarUrl",
          "isAdmin",
          "stripeAccountId"
        ) VALUES (
          ${userId},
          ${profile.display_name || profile.full_name || profile.email.split("@")[0]},
          ${profile.email},
          false,
          ${profile.avatar_url},
          ${profile.created_at || now},
          ${profile.updated_at || now},
          ${profile.display_name},
          ${profile.full_name},
          ${profile.avatar_url},
          ${profile.is_admin || false},
          ${profile.stripe_account_id}
        )
      `;

      // Update profile with auth_user_id
      await sql`
        UPDATE profiles
        SET auth_user_id = ${userId}
        WHERE id = ${profile.id}
      `;

      console.log(`Migrated: ${profile.email}`);
      migrated++;
    } catch (error) {
      console.error(`Failed to migrate ${profile.email}:`, error);
      failed++;
    }
  }

  console.log("\n--- Migration Summary ---");
  console.log(`Total profiles: ${profiles.length}`);
  console.log(`Successfully migrated: ${migrated}`);
  console.log(`Failed: ${failed}`);

  if (migrated > 0) {
    console.log("\nIMPORTANT: Migrated users will need to reset their passwords.");
    console.log("Send password reset emails to all migrated users.");
  }
}

migrateUsers()
  .then(() => {
    console.log("\nMigration complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
