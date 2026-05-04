import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Comment {
  id: string;
}

export async function POST(
  request: Request,
  { params }: { params: { threadId: string; commentId: string } }
) {
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

    const parentComment = await queryOne<Comment>`
      SELECT id
      FROM comments
      WHERE id = ${commentId}
    `;

    if (!parentComment) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
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
        ${JSON.stringify(authorData)}::jsonb,
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
