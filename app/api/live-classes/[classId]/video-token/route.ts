import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { videoRoomService } from "@/lib/video-room-service";
import { getDailyDomain } from "@/lib/get-daily-domain";
import { enableAutoRecording } from "@/lib/daily";

interface LiveClassWithDetails {
  id: string;
  community_id: string;
  teacher_id: string;
  community_created_by: string;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name: string | null;
  daily_room_url: string | null;
  status: string;
  enable_recording: boolean;
  recording_id: string | null;
}

interface Profile {
  display_name: string | null;
  full_name: string | null;
}

interface Membership {
  status: string;
}

interface LiveClassRoom {
  daily_room_name: string | null;
  daily_room_url: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
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

    // Get live class details
    const liveClass = await queryOne<LiveClassWithDetails>`
      SELECT *
      FROM live_classes_with_details
      WHERE id = ${params.classId}
    `;

    if (!liveClass) {
      return NextResponse.json(
        { error: "Live class not found" },
        { status: 404 }
      );
    }

    // Get user profile for display name
    const profile = await queryOne<Profile>`
      SELECT display_name, full_name
      FROM profiles
      WHERE auth_user_id = ${user.id}
    `;

    const userName = profile?.display_name || profile?.full_name || user.email?.split('@')[0] || 'Guest';

    // Check if user is authorized to join (community member, teacher, or creator)
    const isTeacher = liveClass.teacher_id === user.id;
    const isCreator = liveClass.community_created_by === user.id;

    if (!isTeacher && !isCreator) {
      // Check if user is a community member
      const membership = await queryOne<Membership>`
        SELECT status
        FROM community_members
        WHERE community_id = ${liveClass.community_id}
          AND user_id = ${user.id}
      `;

      if (!membership || membership.status !== 'active') {
        return NextResponse.json(
          { error: "Access denied. Community membership required." },
          { status: 403 }
        );
      }
    }

    // Check if class is available to join (starting soon or currently active)
    const now = new Date();
    const classStartTime = new Date(liveClass.scheduled_start_time);
    const classEndTime = new Date(classStartTime.getTime() + liveClass.duration_minutes * 60000);
    const joinWindowStart = new Date(classStartTime.getTime() - 15 * 60000); // 15 minutes before

    if (now < joinWindowStart) {
      return NextResponse.json(
        { error: "Class is not yet available to join" },
        { status: 403 }
      );
    }

    if (now > classEndTime) {
      return NextResponse.json(
        { error: "Class has ended" },
        { status: 403 }
      );
    }

    // Create or get existing Daily.co room
    if (!liveClass.daily_room_name || !liveClass.daily_room_url) {
      // Create room using video room service
      await videoRoomService.createRoomForLiveClass(params.classId);

      // Refetch the live class with updated room details
      const updatedClass = await queryOne<LiveClassRoom>`
        SELECT daily_room_name, daily_room_url
        FROM live_classes
        WHERE id = ${params.classId}
      `;

      if (!updatedClass?.daily_room_name) {
        return NextResponse.json(
          { error: "Failed to create video room" },
          { status: 500 }
        );
      }

      liveClass.daily_room_name = updatedClass.daily_room_name;
      liveClass.daily_room_url = updatedClass.daily_room_url;
    }

    // When teacher joins, set class to live and create recording row if needed
    if (isTeacher && liveClass.status === 'scheduled') {
      await sql`
        UPDATE live_classes SET status = 'live', updated_at = NOW()
        WHERE id = ${params.classId}
      `;

      if (liveClass.enable_recording && !liveClass.recording_id) {
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

            // Enable auto-recording on the room — starts when teacher joins
            try {
              await enableAutoRecording(liveClass.daily_room_name!);
              await sql`
                UPDATE live_class_recordings SET status = 'recording', updated_at = NOW()
                WHERE id = ${recording.id}
              `;
              console.log(`Enabled auto-recording for live class ${params.classId}`);
            } catch (recError) {
              console.error("Failed to enable auto-recording:", recError);
            }
          }
        } catch (error) {
          console.error("Failed to create recording row:", error);
        }
      }
    }

    // Generate tokens for the user
    const tokens = await videoRoomService.generateTokensForLiveClass(
      params.classId,
      user.id,
      isTeacher,
      userName
    );

    if (!tokens) {
      return NextResponse.json(
        { error: "Failed to generate video tokens" },
        { status: 500 }
      );
    }

    // Get Daily domain
    const domain = await getDailyDomain();

    // Construct the room URL
    const roomUrl = `https://${domain}.daily.co/${liveClass.daily_room_name}`;

    return NextResponse.json({
      roomUrl,
      token: tokens.token,
      expires: tokens.expires,
      isTeacher,
    });
  } catch (error) {
    console.error("Error generating live class video token:", error);
    return NextResponse.json(
      { error: "Failed to generate video token" },
      { status: 500 }
    );
  }
}
