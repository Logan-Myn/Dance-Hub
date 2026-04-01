import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { createRoom, generateToken, startRecording } from "@/lib/stream-hub";

interface LiveClassWithDetails {
  id: string;
  community_id: string;
  teacher_id: string;
  community_created_by: string;
  scheduled_start_time: string;
  duration_minutes: number;
  livekit_room_name: string | null;
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

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = session.user;

    const liveClass = await queryOne<LiveClassWithDetails>`
      SELECT
        lc.id,
        lc.community_id,
        lc.teacher_id,
        c.created_by as community_created_by,
        lc.scheduled_start_time,
        lc.duration_minutes,
        lc.livekit_room_name,
        lc.status,
        lc.enable_recording,
        lc.recording_id
      FROM live_classes lc
      JOIN communities c ON c.id = lc.community_id
      WHERE lc.id = ${params.classId}
    `;

    if (!liveClass) {
      return NextResponse.json({ error: "Live class not found" }, { status: 404 });
    }

    // Get user profile for display name
    const profile = await queryOne<Profile>`
      SELECT display_name, full_name FROM profiles WHERE auth_user_id = ${user.id}
    `;
    const userName = profile?.display_name || profile?.full_name || user.email?.split("@")[0] || "Guest";

    // Authorization check
    const isTeacher = liveClass.teacher_id === user.id;
    const isCreator = liveClass.community_created_by === user.id;

    if (!isTeacher && !isCreator) {
      const membership = await queryOne<Membership>`
        SELECT status FROM community_members
        WHERE community_id = ${liveClass.community_id} AND user_id = ${user.id}
      `;
      if (!membership || membership.status !== "active") {
        return NextResponse.json({ error: "Access denied. Community membership required." }, { status: 403 });
      }
    }

    // Check join window (15 min before to end time)
    const now = new Date();
    const classStartTime = new Date(liveClass.scheduled_start_time);
    const classEndTime = new Date(classStartTime.getTime() + liveClass.duration_minutes * 60000);
    const joinWindowStart = new Date(classStartTime.getTime() - 15 * 60000);

    if (now < joinWindowStart) {
      return NextResponse.json({ error: "Class is not yet available to join" }, { status: 403 });
    }
    if (now > classEndTime) {
      return NextResponse.json({ error: "Class has ended" }, { status: 403 });
    }

    // Create room if needed (idempotent)
    const roomName = `live-class-${params.classId}`;
    if (!liveClass.livekit_room_name) {
      await createRoom(roomName, 100);
      await sql`
        UPDATE live_classes SET livekit_room_name = ${roomName}, updated_at = NOW()
        WHERE id = ${params.classId}
      `;
    }

    // When teacher joins and class is scheduled, set to live + start recording
    if (isTeacher && liveClass.status === "scheduled") {
      await sql`
        UPDATE live_classes SET status = 'live', updated_at = NOW()
        WHERE id = ${params.classId}
      `;

      if (liveClass.enable_recording && !liveClass.recording_id) {
        try {
          const recording = await queryOne<{ id: string }>`
            INSERT INTO live_class_recordings (live_class_id, status)
            VALUES (${params.classId}, 'recording')
            RETURNING id
          `;
          if (recording) {
            await sql`
              UPDATE live_classes SET recording_id = ${recording.id}, updated_at = NOW()
              WHERE id = ${params.classId}
            `;

            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const callbackUrl = `${appUrl}/api/webhooks/stream-hub`;
            await startRecording(roomName, callbackUrl);
            console.log(`Started recording for live class ${params.classId}`);
          }
        } catch (error) {
          console.error("Failed to start recording:", error);
        }
      }
    }

    // Generate token
    const role = isTeacher ? "admin" : "participant";
    const tokenData = await generateToken(roomName, userName, role);

    return NextResponse.json({
      token: tokenData.token,
      serverUrl: tokenData.serverUrl,
      isTeacher,
    });
  } catch (error) {
    console.error("Error generating live class video token:", error);
    return NextResponse.json({ error: "Failed to generate video token" }, { status: 500 });
  }
}
