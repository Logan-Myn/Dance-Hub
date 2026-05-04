import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

interface LikeResult {
  likes: string[];
  likes_count: number;
  liked: boolean;
}

export async function POST(
  _request: Request,
  { params }: { params: { threadId: string; commentId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { commentId } = params;

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
