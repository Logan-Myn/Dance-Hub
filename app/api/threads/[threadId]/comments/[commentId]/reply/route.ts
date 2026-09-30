import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { canViewCommunity } from '@/lib/community-auth';

interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface ParentComment {
  id: string;
  community_id: string;
  community_created_by: string;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ threadId: string; commentId: string }> }
) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { content } = await request.json();
    const { threadId, commentId } = params;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // The parent comment must belong to the thread in the URL, so a reply
    // cannot be attached to another community's thread.
    const parentComment = await queryOne<ParentComment>`
      SELECT cm.id, t.community_id, c.created_by AS community_created_by
      FROM comments cm
      JOIN threads t ON t.id = cm.thread_id
      JOIN communities c ON c.id = t.community_id
      WHERE cm.id = ${commentId} AND cm.thread_id = ${threadId}
    `;

    if (!parentComment) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
    }

    const allowed = await canViewCommunity(
      userId,
      { id: parentComment.community_id, created_by: parentComment.community_created_by },
      { allowPreRegistered: true }
    );
    if (!allowed) {
      return NextResponse.json({ error: 'Only community members can reply here' }, { status: 403 });
    }

    const userData = await queryOne<Profile>`
      SELECT id, full_name, display_name, avatar_url
      FROM profiles
      WHERE auth_user_id = ${userId}
    `;

    const authorData = {
      name: userData?.display_name || userData?.full_name || 'Anonymous',
      image: userData?.avatar_url || '',
    };

    const replyId = crypto.randomUUID();

    await sql`
      INSERT INTO comments (id, thread_id, user_id, content, parent_id, author, likes, likes_count)
      VALUES (
        ${replyId},
        ${threadId},
        ${userId},
        ${content},
        ${commentId},
        ${sql.json(authorData)},
        ARRAY[]::TEXT[],
        0
      )
    `;

    const reply = {
      id: replyId,
      thread_id: threadId,
      user_id: userId,
      content,
      parent_id: commentId,
      author: authorData,
      created_at: new Date().toISOString(),
      likes: [],
      likes_count: 0,
    };

    return NextResponse.json(reply);
  } catch (error) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      { error: 'Failed to create reply' },
      { status: 500 }
    );
  }
}
