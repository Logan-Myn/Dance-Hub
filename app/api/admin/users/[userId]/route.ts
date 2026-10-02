import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { cancelMemberSubscriptions, type MemberSubscriptionRef } from "@/lib/subscription-cancel";

// Loose check (something@something.tld); the user confirms the address by
// receiving mail there.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A trimmed string, or undefined when the field is absent or not a string. */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

interface Profile {
  id: string;
  is_admin: boolean | null;
}

export async function DELETE(request: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  try {
    const { userId } = params;

    // Verify that the requester is authenticated and is an admin
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify requester is an admin
    const requesterProfile = await queryOne<Profile>`
      SELECT id, is_admin
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (!requesterProfile?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The id is the auth user id ("user".id). Anything else (a profile id,
    // say) used to match no rows and still report success.
    const targetUser = await queryOne<{ id: string }>`
      SELECT id FROM "user" WHERE id = ${userId}
    `;
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Nothing ties a community to its owner in the database, so deleting the
    // owner would leave their communities running (and billing members) with
    // nobody able to manage them.
    const owned = await queryOne<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM communities WHERE created_by = ${userId}
    `;
    const ownedCount = owned?.count ?? 0;
    if (ownedCount > 0) {
      return NextResponse.json(
        {
          error: `This user owns ${ownedCount} ${ownedCount === 1 ? "community" : "communities"}. Delete ${ownedCount === 1 ? "it" : "them"} or give ${ownedCount === 1 ? "it" : "them"} a new owner first.`,
        },
        { status: 409 }
      );
    }

    // Cancel the user's membership subscriptions, each on its community's
    // connected account, before their member rows go: afterwards nothing in
    // the app can cancel them, and they would keep being charged.
    const memberships = await query<MemberSubscriptionRef>`
      SELECT cm.stripe_subscription_id, cm.subscription_status, c.stripe_account_id
      FROM community_members cm
      JOIN communities c ON c.id = cm.community_id
      WHERE cm.user_id = ${userId}
        AND cm.stripe_subscription_id IS NOT NULL
    `;
    const notCancelled = await cancelMemberSubscriptions(memberships);
    if (notCancelled.length > 0) {
      return NextResponse.json(
        {
          error: `We couldn't cancel ${notCancelled.length} of this user's ${notCancelled.length === 1 ? "subscription" : "subscriptions"}, so the user was not deleted. Please try again.`,
        },
        { status: 502 }
      );
    }

    // Delete user's profile first (this will cascade delete community_members)
    await sql`
      DELETE FROM profiles
      WHERE auth_user_id = ${userId}
    `;

    // Delete the user from Better Auth users table
    await sql`
      DELETE FROM "user"
      WHERE id = ${userId}
    `;

    // Also delete any sessions for this user
    await sql`
      DELETE FROM session
      WHERE "userId" = ${userId}
    `;

    // Delete any accounts linked to this user
    await sql`
      DELETE FROM account
      WHERE "userId" = ${userId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  try {
    const { userId } = params;
    const updates = await request.json().catch(() => null);

    // Verify that the requester is authenticated and is an admin
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify requester is an admin
    const requesterProfile = await queryOne<Profile>`
      SELECT id, is_admin
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (!requesterProfile?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    // The edit dialog used to send this and show success while it was
    // silently ignored. Memberships go through the join flows (and payment).
    if ("addToCommunity" in updates) {
      return NextResponse.json(
        { error: "Adding a user to a community is not supported here" },
        { status: 400 }
      );
    }

    const fullName = optionalString(updates.full_name);
    const displayName = optionalString(updates.display_name);
    // An empty email (the dialog sends '' when the profile has none) means
    // "no change", so a name-only edit still works.
    const email = optionalString(updates.email)?.toLowerCase() || undefined;

    const currentUser = await queryOne<{ id: string; email: string }>`
      SELECT id, email
      FROM "user"
      WHERE id = ${userId}
    `;
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Email lives on the auth user (sign-in reads it, and it is unique there);
    // profiles.email and email_preferences.email are copies the app mails to.
    // Change "user" first, then copy it, like the user's own change-email flow.
    const emailChanged = email !== undefined && email !== currentUser.email.toLowerCase();
    if (email !== undefined && !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (emailChanged) {
      const taken = await queryOne<{ id: string }>`
        SELECT id FROM "user"
        WHERE LOWER(email) = ${email}
          AND id != ${userId}
      `;
      if (taken) {
        return NextResponse.json(
          { error: "Another account already uses this email" },
          { status: 409 }
        );
      }
    }

    // One transaction: the names, the auth email and its two copies change
    // together or not at all (and a failure is reported, not swallowed).
    await sql.begin(async (tx) => {
      // Optional fields: an omitted one keeps its value (postgres.js rejects
      // undefined parameters, which used to turn a partial edit into a 500).
      await tx`
        UPDATE profiles
        SET
          full_name = COALESCE(${fullName ?? null}, full_name),
          display_name = COALESCE(${displayName ?? null}, display_name),
          updated_at = NOW()
        WHERE auth_user_id = ${userId}
      `;

      if (emailChanged) {
        await tx`
          UPDATE "user"
          SET email = ${email!}, "updatedAt" = NOW()
          WHERE id = ${userId}
        `;
        // Same copies as the change-email hook (syncProfileEmail), which
        // only logs failures; here a failure rolls everything back.
        await tx`
          UPDATE profiles
          SET email = ${email!}, updated_at = NOW()
          WHERE auth_user_id = ${userId}
        `;
        await tx`
          UPDATE email_preferences ep
          SET email = ${email!}, updated_at = NOW()
          FROM profiles p
          WHERE ep.user_id = p.id
            AND p.auth_user_id = ${userId}
        `;
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Lost a race with another account taking the same email.
    if ((error as { code?: string })?.code === "23505") {
      return NextResponse.json(
        { error: "Another account already uses this email" },
        { status: 409 }
      );
    }
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
