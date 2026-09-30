import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { canViewCommunity } from '@/lib/community-auth';

interface LikeResult {
  likes: string[];
  likes_count: number;
  liked: boolean;
}

export async function POST(
  _request: Request,
  props: { params: Promise<{ threadId: string; commentId: string }> }
) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { commentId } = params;

    // Resolve the community through the comment's own thread.
    const owner = await queryOne<{ community_id: string; community_created_by: string }>`
      SELECT t.community_id, c.created_by AS community_created_by
      FROM comments cm
      JOIN threads t ON t.id = cm.thread_id
      JOIN communities c ON c.id = t.community_id
      WHERE cm.id = ${commentId}
    `;
    if (!owner) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    const allowed = await canViewCommunity(
      userId,
      { id: owner.community_id, created_by: owner.community_created_by },
      { allowPreRegistered: true }
    );
    if (!allowed) {
      return NextResponse.json({ error: 'Members only' }, { status: 403 });
    }

    const result = await queryOne<LikeResult>`
      UPDATE comments
      SET
        likes = CASE
          WHEN ${userId} = ANY(COALESCE(likes, ARRAY[]::TEXT[]))
            THEN array_remove(likes, ${userId})
          ELSE array_append(COALESCE(likes, ARRAY[]::TEXT[]), ${userId})
        END,
        likes_count = CASE
          WHEN ${userId} = ANY(COALESCE(likes, ARRAY[]::TEXT[]))
            THEN GREATEST(COALESCE(likes_count, 0) - 1, 0)
          ELSE COALESCE(likes_count, 0) + 1
        END
      WHERE id = ${commentId}
      RETURNING
        likes,
        likes_count,
        ${userId} = ANY(COALESCE(likes, ARRAY[]::TEXT[])) as liked
    `;

    if (!result) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json({
      likes_count: result.likes_count,
      liked: result.liked,
    });
  } catch (error) {
    console.error('Error liking comment:', error);
    return NextResponse.json(
      { error: 'Failed to like comment' },
      { status: 500 }
    );
  }
}
