import { NextResponse } from 'next/server';
import { queryOne } from "@/lib/db";

interface Profile {
  id: string;
  is_admin: boolean | null;
}

interface Community {
  id: string;
  created_by: string;
}

interface Membership {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ communitySlug: string; userId: string }> }
) {
  const params = await props.params;
  try {
    const { communitySlug, userId } = params;

    // Check if user is admin (userId is Better Auth user ID)
    const profile = await queryOne<Profile>`
      SELECT id, is_admin
      FROM profiles
      WHERE auth_user_id = ${userId}
    `;

    // Admins have access to all communities
    if (profile?.is_admin) {
      return NextResponse.json({ isMember: true });
    }

    // Get community and check if user is creator
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    // Check if user is creator
    if (community.created_by === userId) {
      return NextResponse.json({ isMember: true });
    }

    // Check membership
    const membership = await queryOne<Membership>`
      SELECT id, community_id, user_id, status
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
        AND status = 'active'
    `;

    return NextResponse.json({ isMember: !!membership });
  } catch (error) {
    console.error('Error checking membership:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
