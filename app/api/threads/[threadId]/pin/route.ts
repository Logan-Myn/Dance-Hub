import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

interface ThreadWithCommunity {
  id: string;
  pinned: boolean;
  community_id: string;
  community_created_by: string;
}

interface UpdatedThread {
  id: string;
  pinned: boolean;
}

export async function POST(request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  try {
    const { threadId } = params;

    // Get the current session using Better Auth
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get the thread and community info
    const thread = await queryOne<ThreadWithCommunity>`
      SELECT t.id, t.pinned, t.community_id, c.created_by as community_created_by
      FROM threads t
      INNER JOIN communities c ON c.id = t.community_id
      WHERE t.id = ${threadId}
    `;

    if (!thread) {
      return NextResponse.json(
        { error: 'Thread not found' },
        { status: 404 }
      );
    }

    // Verify the user is the community creator
    if (user.id !== thread.community_created_by) {
      return NextResponse.json(
        { error: 'Only community creators can pin threads' },
        { status: 403 }
      );
    }

    // Toggle the pinned status
    const updatedThread = await queryOne<UpdatedThread>`
      UPDATE threads
      SET pinned = ${!thread.pinned}
      WHERE id = ${threadId}
      RETURNING id, pinned
    `;

    if (!updatedThread) {
      return NextResponse.json(
        { error: 'Failed to update thread' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      pinned: updatedThread.pinned,
    });
  } catch (error) {
    console.error('Error pinning thread:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
