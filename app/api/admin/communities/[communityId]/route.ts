import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface Profile {
  id: string;
  is_admin: boolean | null;
}

interface Community {
  id: string;
}

export async function DELETE(request: Request, props: { params: Promise<{ communityId: string }> }) {
  const params = await props.params;
  try {
    const { communityId } = params;

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

    // Use the delete_community RPC function to delete everything in the correct order
    await sql`
      SELECT delete_community(${communityId})
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting community:", error);
    return NextResponse.json(
      { error: "Failed to delete community" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ communityId: string }> }) {
  const params = await props.params;
  try {
    const { communityId } = params;

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

    // Get the update data from the request body
    const updates = await request.json();

    // Validate the updates
    if (!updates.name || !updates.slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Check if the slug is already taken by another community
    const existingCommunity = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${updates.slug}
        AND id != ${communityId}
    `;

    if (existingCommunity) {
      return NextResponse.json(
        { error: "A community with this slug already exists" },
        { status: 400 }
      );
    }

    // Update the community
    await sql`
      UPDATE communities
      SET
        name = ${updates.name},
        description = ${updates.description},
        slug = ${updates.slug}
      WHERE id = ${communityId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating community:", error);
    return NextResponse.json(
      { error: "Failed to update community" },
      { status: 500 }
    );
  }
}
