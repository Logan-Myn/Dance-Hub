import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";

interface Community {
  id: string;
}

interface Member {
  id: string;
}

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    console.log('Request body:', body);
    const { userId } = body;
    console.log('Extracted userId:', userId);

    // Get community
    const community = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    console.log('Community data:', community);

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const existingMember = await queryOne<Member>`
      SELECT id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    // Add member to community_members table
    try {
      await sql`
        INSERT INTO community_members (
          community_id,
          user_id,
          joined_at,
          role,
          status
        ) VALUES (
          ${community.id},
          ${userId},
          NOW(),
          'member',
          'active'
        )
      `;
    } catch (memberError) {
      console.error("Error adding member:", memberError);
      return NextResponse.json(
        { error: "Failed to add member" },
        { status: 500 }
      );
    }

    // Update members_count in communities table
    try {
      await sql`SELECT increment_members_count(${community.id})`;
    } catch (updateError) {
      console.error("Error updating members count:", updateError);
      // Rollback the member addition
      await sql`
        DELETE FROM community_members
        WHERE community_id = ${community.id}
          AND user_id = ${userId}
      `;

      return NextResponse.json(
        { error: "Failed to update members count" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error joining community:", error);
    return NextResponse.json(
      { error: "Failed to join community" },
      { status: 500 }
    );
  }
}
