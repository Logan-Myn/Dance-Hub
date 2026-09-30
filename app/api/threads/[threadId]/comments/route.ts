import { NextResponse } from 'next/server';
import { query, queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { canViewCommunity } from '@/lib/community-auth';

interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Thread {
  id: string;
  community_id: string;
  community_created_by: string;
}

function loadThread(threadId: string) {
  return queryOne<Thread>`
    SELECT t.id, t.community_id, c.created_by AS community_created_by
    FROM threads t
    JOIN communities c ON c.id = t.community_id
    WHERE t.id = ${threadId}
  `;
}

function canSeeThread(userId: string, thread: Thread) {
  return canViewCommunity(
    userId,
    { id: thread.community_id, created_by: thread.community_created_by },
    { allowPreRegistered: true }
  );
}

interface CommentRow {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  author: {
    name: string;
    image: string;
  } | null;
  likes: string[];
  likes_count: number;
}

export async function GET(_request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { threadId } = params;

    const thread = await loadThread(threadId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    if (!(await canSeeThread(session.user.id, thread))) {
      return NextResponse.json({ error: 'Members only' }, { status: 403 });
    }

    const comments = await query<CommentRow>`
      SELECT
        c.id,
        c.thread_id,
        c.user_id,
        c.content,
        c.created_at,
        c.parent_id,
        c.author,
        COALESCE(c.likes, ARRAY[]::TEXT[]) as likes,
        COALESCE(c.likes_count, 0) as likes_count
      FROM comments c
      WHERE c.thread_id = ${threadId}
      ORDER BY c.created_at ASC
    `;

    const formattedComments = comments.map(comment => ({
      ...comment,
      likes: comment.likes || [],
      likes_count: comment.likes_count || 0,
    }));

    return NextResponse.json(formattedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { content } = await request.json();
    const { threadId } = params;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const thread = await loadThread(threadId);

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    if (!(await canSeeThread(userId, thread))) {
      return NextResponse.json({ error: 'Only community members can comment here' }, { status: 403 });
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

    const commentId = crypto.randomUUID();

    await sql`
      INSERT INTO comments (id, thread_id, user_id, content, author, likes, likes_count)
      VALUES (
        ${commentId},
        ${threadId},
        ${userId},
        ${content},
        ${sql.json(authorData)},
        ARRAY[]::TEXT[],
        0
      )
    `;

    const comment = {
      id: commentId,
      thread_id: threadId,
      user_id: userId,
      content,
      author: authorData,
      created_at: new Date().toISOString(),
      likes: [],
      likes_count: 0,
    };

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
