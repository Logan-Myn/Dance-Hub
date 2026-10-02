import { queryOne } from "@/lib/db";

export interface LiveClassAccessRow {
  id: string;
  community_id: string;
  teacher_id: string;
  community_created_by: string;
}

export interface LiveClassAccess {
  liveClass: LiveClassAccessRow;
  isTeacher: boolean;
  /** Teacher, community owner, or an active member of the community. */
  allowed: boolean;
}

/** The class's room on the media server. */
export function liveClassRoomName(classId: string): string {
  return `live-class-${classId}`;
}

/**
 * Who may be in a live class. Same rule as the video-token route: the
 * teacher, the community owner, and active members. Returns null when the
 * class doesn't exist.
 */
export async function getLiveClassAccess(classId: string, userId: string): Promise<LiveClassAccess | null> {
  const liveClass = await queryOne<LiveClassAccessRow>`
    SELECT lc.id, lc.community_id, lc.teacher_id, c.created_by AS community_created_by
    FROM live_classes lc
    JOIN communities c ON c.id = lc.community_id
    WHERE lc.id = ${classId}
  `;
  if (!liveClass) return null;

  const isTeacher = liveClass.teacher_id === userId;
  if (isTeacher || liveClass.community_created_by === userId) {
    return { liveClass, isTeacher, allowed: true };
  }

  const membership = await queryOne<{ status: string }>`
    SELECT status FROM community_members
    WHERE community_id = ${liveClass.community_id} AND user_id = ${userId}
  `;
  return { liveClass, isTeacher, allowed: membership?.status === "active" };
}

/** The name shown for someone in a live class room. */
export function liveClassDisplayName(
  profile: { display_name: string | null; full_name: string | null } | null,
  email?: string | null
): string {
  return profile?.display_name || profile?.full_name || email?.split("@")[0] || "Guest";
}
