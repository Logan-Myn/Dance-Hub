import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { getLiveClassAccess, liveClassDisplayName } from "@/lib/live-class-access";

// A room holds at most 100 participants.
const MAX_IDS = 100;

interface ProfileRow {
  id: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
}

/**
 * Names for the identities in a live-class room. Identities are user ids, so
 * the room itself carries no readable name; the class page asks here. Names
 * come from profiles, never from what a participant sends, and only for
 * people allowed in the class.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ classId: string }> }) {
  const { classId } = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const access = await getLiveClassAccess(classId, session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Live class not found" }, { status: 404 });
    }
    if (!access.allowed) {
      return NextResponse.json({ error: "Access denied. Community membership required." }, { status: 403 });
    }

    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const ids = [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, MAX_IDS);
    if (ids.length === 0) {
      return NextResponse.json({ names: {} });
    }

    const { community_id, teacher_id, community_created_by } = access.liveClass;
    const rows = await query<ProfileRow>`
      SELECT p.auth_user_id AS id, p.display_name, p.full_name, p.email
      FROM profiles p
      WHERE p.auth_user_id = ANY(${ids})
        AND (
          p.auth_user_id = ${teacher_id}
          OR p.auth_user_id = ${community_created_by}
          OR EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.community_id = ${community_id}
              AND cm.user_id = p.auth_user_id
              AND cm.status = 'active'
          )
        )
    `;

    const names: Record<string, string> = {};
    for (const row of rows) {
      names[row.id] = liveClassDisplayName(row, row.email);
    }
    return NextResponse.json({ names });
  } catch (error) {
    console.error("Error looking up live class participant names:", error);
    return NextResponse.json({ error: "Failed to load participant names" }, { status: 500 });
  }
}
