import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { createRoom } from "@/lib/stream-hub";

interface Community {
  id: string;
  created_by: string;
}

interface LiveClassWithDetails {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name: string | null;
  daily_room_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface LiveClass {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name: string | null;
  daily_room_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    // Get community by slug
    const community = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Build query for live classes with optional date filtering
    let liveClasses: LiveClassWithDetails[];

    if (start && end) {
      liveClasses = await query<LiveClassWithDetails>`
        SELECT *
        FROM live_classes_with_details
        WHERE community_id = ${community.id}
          AND scheduled_start_time >= ${`${start}T00:00:00`}
          AND scheduled_start_time <= ${`${end}T23:59:59`}
        ORDER BY scheduled_start_time ASC
      `;
    } else {
      liveClasses = await query<LiveClassWithDetails>`
        SELECT *
        FROM live_classes_with_details
        WHERE community_id = ${community.id}
        ORDER BY scheduled_start_time ASC
      `;
    }

    return NextResponse.json(liveClasses || []);
  } catch (error) {
    console.error("Error in live classes GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { communitySlug: string } }
) {
  try {
    // Get the current user session
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community by slug
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Check if user is authorized (community creator or will add teacher role check later)
    if (community.created_by !== user.id) {
      // TODO: Add check for teacher role in the community
      return NextResponse.json(
        { error: "Not authorized to create live classes" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, scheduled_start_time, duration_minutes, enable_recording } = body;

    // Validate required fields
    if (!title || !scheduled_start_time || !duration_minutes) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create the live class
    const liveClass = await queryOne<LiveClass>`
      INSERT INTO live_classes (
        community_id,
        teacher_id,
        title,
        description,
        scheduled_start_time,
        duration_minutes,
        enable_recording
      ) VALUES (
        ${community.id},
        ${user.id},
        ${title},
        ${description || null},
        ${scheduled_start_time},
        ${parseInt(duration_minutes)},
        ${enable_recording === true}
      )
      RETURNING *
    `;

    if (!liveClass) {
      console.error("Error creating live class: no row returned");
      return NextResponse.json(
        { error: "Failed to create live class" },
        { status: 500 }
      );
    }

    // Create Stream-Hub/LiveKit room for the live class
    try {
      const roomName = `live-class-${liveClass.id}`;
      await createRoom(roomName, 100);
      await sql`
        UPDATE live_classes SET livekit_room_name = ${roomName}, updated_at = NOW()
        WHERE id = ${liveClass.id}
      `;
    } catch (error) {
      console.error("Warning: Failed to create video room for live class:", error);
      // Don't fail the entire request - the room can be created later on join
    }

    return NextResponse.json(liveClass, { status: 201 });
  } catch (error) {
    console.error("Error in live classes POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
