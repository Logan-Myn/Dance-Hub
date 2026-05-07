import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

interface LessonCompletion {
  id: string;
  user_id: string;
  lesson_id: string;
  completed_at: string;
}

export async function POST(request: Request, props: { params: Promise<{ lessonId: string }> }) {
  const params = await props.params;
  try {
    // Get the current session
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;

    // Check if the lesson is already completed
    const existingCompletion = await queryOne<LessonCompletion>`
      SELECT *
      FROM lesson_completions
      WHERE user_id = ${user.id}
        AND lesson_id = ${params.lessonId}
    `;

    if (existingCompletion) {
      // If already completed, remove the completion
      await sql`
        DELETE FROM lesson_completions
        WHERE user_id = ${user.id}
          AND lesson_id = ${params.lessonId}
      `;

      return NextResponse.json({ completed: false });
    } else {
      // If not completed, add completion
      await sql`
        INSERT INTO lesson_completions (user_id, lesson_id)
        VALUES (${user.id}, ${params.lessonId})
      `;

      return NextResponse.json({ completed: true });
    }
  } catch (error) {
    console.error('Error toggling lesson completion:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request, props: { params: Promise<{ lessonId: string }> }) {
  const params = await props.params;
  try {
    // Get the current session
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;

    // Check completion status
    const completion = await queryOne<LessonCompletion>`
      SELECT *
      FROM lesson_completions
      WHERE user_id = ${user.id}
        AND lesson_id = ${params.lessonId}
    `;

    return NextResponse.json({ completed: !!completion });
  } catch (error) {
    console.error('Error checking lesson completion:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
