import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-session";
import { setParticipantCanPublish } from "@/lib/stream-hub";
import { getLiveClassAccess, liveClassRoomName } from "@/lib/live-class-access";

/**
 * Grant or revoke a participant's mic/camera in a live class. Students join
 * subscribe-only; the teacher grants publishing when approving a raised hand
 * and revokes it to silence them. A student may also step down themselves.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ classId: string; identity: string }> }
) {
  const { classId, identity } = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const user = session.user;

    let body: { canPublish?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const canPublish = body?.canPublish;
    if (typeof canPublish !== "boolean") {
      return NextResponse.json({ error: "canPublish must be true or false" }, { status: 400 });
    }

    const access = await getLiveClassAccess(classId, user.id);
    if (!access) {
      return NextResponse.json({ error: "Live class not found" }, { status: 404 });
    }
    if (identity === access.liveClass.teacher_id) {
      return NextResponse.json({ error: "The teacher's access can't be changed" }, { status: 400 });
    }

    const stepsDownThemselves = identity === user.id && canPublish === false;
    if (!access.allowed || (!access.isTeacher && !stepsDownThemselves)) {
      return NextResponse.json({ error: "Only the teacher can do this" }, { status: 403 });
    }

    try {
      await setParticipantCanPublish(liveClassRoomName(classId), identity, canPublish);
    } catch (error) {
      console.error("Failed to update live class participant:", error);
      return NextResponse.json({ error: "Could not update the participant" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating live class participant:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
