import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { canViewCommunity } from '@/lib/community-auth';

interface LikeResult {
  likes: string[];
  liked: boolean;
}

export async function POST(_request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { threadId } = params;

    const thread = await queryOne<{ community_id: string; community_created_by: string }>`
      SELECT t.community_id, c.created_by AS community_created_by
      FROM threads t
      JOIN communities c ON c.id = t.community_id
      WHERE t.id = ${threadId}
    `;
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    const allowed = await canViewCommunity(
      userId,
      { id: thread.community_id, created_by: thread.community_created_by },
      { allowPreRegistered: true }
    );
    if (!allowed) {
      return NextResponse.json({ error: 'Members only' }, { status: 403 });
    }

    const result = await queryOne<LikeResult>`
      UPDATE threads
      SET likes = CASE
        WHEN ${userId} = ANY(COALESCE(likes, ARRAY[]::TEXT[]))
          THEN array_remove(likes, ${userId})
        ELSE array_append(COALESCE(likes, ARRAY[]::TEXT[]), ${userId})
      END
      WHERE id = ${threadId}
      RETURNING
        likes,
        ${userId} = ANY(COALESCE(likes, ARRAY[]::TEXT[])) as liked
    `;

    if (!result) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      liked: result.liked,
      likesCount: result.likes.length,
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    return NextResponse.json(
      { error: 'Failed to toggle like' },
      { status: 500 }
    );
  }
}
