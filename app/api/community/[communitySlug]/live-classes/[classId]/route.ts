import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { videoRoomService } from "@/lib/video-room-service";
import { stopRecording } from "@/lib/daily";

interface Community {
  id: string;
  created_by: string;
}

interface LiveClass {
  teacher_id: string;
  daily_room_name: string | null;
  enable_recording: boolean;
  status: string;
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
  teacher_display_name: string | null;
  teacher_avatar_url: string | null;
}

interface UpdatedLiveClass {
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
  { params }: { params: { communitySlug: string; classId: string } }
) {
  try {
    // Get community by slug
    const community = await queryOne<{ id: string }>`
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

    // Get live class with details
    const liveClass = await queryOne<LiveClassWithDetails>`
      SELECT *
      FROM live_classes_with_details
      WHERE id = ${params.classId}
        AND community_id = ${community.id}
    `;

    if (!liveClass) {
      return NextResponse.json(
        { error: "Live class not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(liveClass);
  } catch (error) {
    console.error("Error in live class GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { communitySlug: string; classId: string } }
) {
  try {
    // Check authentication
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

    // Get the live class to check ownership
    const liveClass = await queryOne<LiveClass>`
      SELECT teacher_id, daily_room_name, enable_recording, status
      FROM live_classes
      WHERE id = ${params.classId}
        AND community_id = ${community.id}
    `;

    if (!liveClass) {
      return NextResponse.json(
        { error: "Live class not found" },
        { status: 404 }
      );
    }

    // Check if user is authorized (teacher or community creator)
    if (liveClass.teacher_id !== user.id && community.created_by !== user.id) {
      return NextResponse.json(
        { error: "Not authorized to update this live class" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, scheduled_start_time, duration_minutes, status, enable_recording } = body;

    // Update the live class using COALESCE for partial updates
    const updatedClass = await queryOne<UpdatedLiveClass>`
      UPDATE live_classes
      SET
        title = COALESCE(${title ?? null}, title),
        description = COALESCE(${description ?? null}, description),
        scheduled_start_time = COALESCE(${scheduled_start_time ?? null}, scheduled_start_time),
        duration_minutes = COALESCE(${duration_minutes ? parseInt(duration_minutes) : null}, duration_minutes),
        status = COALESCE(${status ?? null}, status),
        enable_recording = COALESCE(${enable_recording ?? null}, enable_recording),
        updated_at = NOW()
      WHERE id = ${params.classId}
      RETURNING *
    `;

    if (!updatedClass) {
      console.error("Error updating live class: no row returned");
      return NextResponse.json(
        { error: "Failed to update live class" },
        { status: 500 }
      );
    }

    // If the class doesn't have a Daily.co room, create one
    if (!liveClass.daily_room_name) {
      const videoRoomResult = await videoRoomService.createRoomForLiveClass(params.classId);
      if (!videoRoomResult.success) {
        console.error("Warning: Failed to create video room for live class:", videoRoomResult.error);
      }
    }

    // When class goes live with recording enabled, create a pending recording row
    if (status === 'live' && liveClass.enable_recording) {
      try {
        const recording = await queryOne<{ id: string }>`
          INSERT INTO live_class_recordings (live_class_id, status)
          VALUES (${params.classId}, 'pending')
          RETURNING id
        `;
        if (recording) {
          await sql`
            UPDATE live_classes SET recording_id = ${recording.id}, updated_at = NOW()
            WHERE id = ${params.classId}
          `;
          console.log(`Created pending recording ${recording.id} for live class ${params.classId}`);
        }
      } catch (error) {
        console.error("Failed to create recording row:", error);
      }
    }

    // When class ends with recording enabled, stop the recording
    if (status === 'ended' && liveClass.enable_recording && liveClass.daily_room_name) {
      try {
        await stopRecording(liveClass.daily_room_name);
        console.log(`Stopped recording for live class ${params.classId}`);
      } catch (error) {
        // Recording may have already stopped — not critical
        console.error("Failed to stop recording (may already be stopped):", error);
      }
    }

    return NextResponse.json(updatedClass);
  } catch (error) {
    console.error("Error in live class PUT:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { communitySlug: string; classId: string } }
) {
  try {
    // Check authentication
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

    // Get the live class to check ownership
    const liveClass = await queryOne<{ teacher_id: string }>`
      SELECT teacher_id
      FROM live_classes
      WHERE id = ${params.classId}
        AND community_id = ${community.id}
    `;

    if (!liveClass) {
      return NextResponse.json(
        { error: "Live class not found" },
        { status: 404 }
      );
    }

    // Check if user is authorized (teacher or community creator)
    if (liveClass.teacher_id !== user.id && community.created_by !== user.id) {
      return NextResponse.json(
        { error: "Not authorized to delete this live class" },
        { status: 403 }
      );
    }

    // Soft delete by setting status to cancelled
    try {
      await sql`
        UPDATE live_classes
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${params.classId}
      `;
    } catch (deleteError) {
      console.error("Error deleting live class:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete live class" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in live class DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
