import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

interface LikeResult {
  likes: string[];
  liked: boolean;
}

export async function POST(
  _request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { threadId } = params;

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
