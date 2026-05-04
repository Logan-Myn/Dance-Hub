import { NextResponse } from "next/server";
import { sql, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface ThreadOwnership {
  user_id: string;
  community_created_by: string;
}

async function authorizeThreadMutation(threadId: string, userId: string) {
  const thread = await queryOne<ThreadOwnership>`
    SELECT t.user_id, c.created_by as community_created_by
    FROM threads t
    INNER JOIN communities c ON c.id = t.community_id
    WHERE t.id = ${threadId}
  `;

  if (!thread) return { ok: false as const, status: 404, error: "Thread not found" };
  if (thread.user_id !== userId && thread.community_created_by !== userId) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

export async function PATCH(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, content } = await request.json();
    const { threadId } = params;

    const auth = await authorizeThreadMutation(threadId, session.user.id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await sql`
      UPDATE threads
      SET
        title = ${title},
        content = ${content},
        updated_at = NOW()
      WHERE id = ${threadId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating thread:", error);
    return NextResponse.json(
      { error: "Failed to update thread" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = params;

    const auth = await authorizeThreadMutation(threadId, session.user.id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    await sql`
      DELETE FROM threads
      WHERE id = ${threadId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    return NextResponse.json(
      { error: "Failed to delete thread" },
      { status: 500 }
    );
  }
}
