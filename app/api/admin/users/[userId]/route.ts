import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

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
    const updates = await request.json();

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

    // Update user profile
    await sql`
      UPDATE profiles
      SET
        full_name = ${updates.full_name},
        display_name = ${updates.display_name},
        email = ${updates.email},
        updated_at = NOW()
      WHERE auth_user_id = ${userId}
    `;

    // Update user email in Better Auth users table if changed
    if (updates.email) {
      // Get current user email
      const currentUser = await queryOne<{ id: string; email: string }>`
        SELECT id, email
        FROM "user"
        WHERE id = ${userId}
      `;

      // Only update if email has changed
      if (currentUser && currentUser.email !== updates.email) {
        await sql`
          UPDATE "user"
          SET email = ${updates.email}
          WHERE id = ${userId}
        `;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
