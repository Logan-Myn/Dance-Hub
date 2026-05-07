import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface Community {
  id: string;
  created_by: string;
}

interface LessonBooking {
  id: string;
  community_id: string;
  created_at: string;
  [key: string]: any;
}

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;

    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community and verify user is the creator
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Verify the current user is the community creator
    if (user.id !== community.created_by) {
      return NextResponse.json(
        { error: "Unauthorized - only community creators can view bookings" },
        { status: 403 }
      );
    }

    // Get lesson bookings with lesson details
    const bookings = await query<LessonBooking>`
      SELECT *
      FROM lesson_bookings_with_details
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(bookings || []);
  } catch (error) {
    console.error("Error in GET /api/community/[communitySlug]/lesson-bookings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
