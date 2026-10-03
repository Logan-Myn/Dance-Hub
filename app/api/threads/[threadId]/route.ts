import { NextResponse } from "next/server";
import { sql, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { sanitizeRichText } from "@/lib/sanitize-html";

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

export async function PATCH(request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, content: rawContent } = await request.json();
    const { threadId } = params;

    // Same rule as thread create: store only the allowlisted editor markup.
    const content = sanitizeRichText(rawContent);
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

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

    // The editor shows the stored body, not what it sent.
    return NextResponse.json({ success: true, title, content });
  } catch (error) {
    console.error("Error updating thread:", error);
    return NextResponse.json(
      { error: "Failed to update thread" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
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
