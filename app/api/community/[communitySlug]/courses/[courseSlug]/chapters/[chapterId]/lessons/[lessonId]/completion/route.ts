import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { requireCommunityViewer } from '@/lib/community-auth';

type Params = { communitySlug: string; courseSlug: string; lessonId: string };

/** The lesson, if it belongs to a course of this community. */
async function lessonInCommunity(lessonId: string, communityId: string) {
  return queryOne<{ id: string }>`
    SELECT l.id
    FROM lessons l
    JOIN chapters ch ON ch.id = l.chapter_id
    JOIN courses co ON co.id = ch.course_id
    WHERE l.id = ${lessonId} AND co.community_id = ${communityId}
  `;
}

/**
 * Marks a lesson done or not done for the viewer. Send { completed: true |
 * false } to set it (safe to repeat); without a body it toggles, as before.
 */
export async function POST(request: Request, props: { params: Promise<Params> }) {
  const params = await props.params;
  const guard = await requireCommunityViewer(params.communitySlug);
  if (!guard.ok) return guard.response;
  const userId = guard.session.user.id;

  try {
    if (!(await lessonInCommunity(params.lessonId, guard.community.id))) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    let completed: boolean;
    if (typeof body?.completed === 'boolean') {
      completed = body.completed;
    } else {
      const existing = await queryOne<{ id: string }>`
        SELECT id FROM lesson_completions WHERE user_id = ${userId} AND lesson_id = ${params.lessonId}
      `;
      completed = !existing;
    }

    if (completed) {
      await sql`
        INSERT INTO lesson_completions (user_id, lesson_id)
        VALUES (${userId}, ${params.lessonId})
        ON CONFLICT (user_id, lesson_id) DO NOTHING
      `;
    } else {
      await sql`
        DELETE FROM lesson_completions WHERE user_id = ${userId} AND lesson_id = ${params.lessonId}
      `;
    }
    return NextResponse.json({ completed });
  } catch (error) {
    console.error('Error updating lesson completion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(_request: Request, props: { params: Promise<Params> }) {
  const params = await props.params;
  const guard = await requireCommunityViewer(params.communitySlug);
  if (!guard.ok) return guard.response;

  try {
    const completion = await queryOne<{ id: string }>`
      SELECT id FROM lesson_completions
      WHERE user_id = ${guard.session.user.id} AND lesson_id = ${params.lessonId}
    `;
    return NextResponse.json({ completed: !!completion });
  } catch (error) {
    console.error('Error checking lesson completion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
