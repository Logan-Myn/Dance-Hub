import { NextResponse } from 'next/server';
import { query, queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { Video } from '@/lib/mux';

interface Profile {
  is_admin: boolean;
}

interface Chapter {
  id: string;
}

interface Lesson {
  id: string;
  mux_playback_id: string | null;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  community_id: string;
  is_public: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function DELETE(request: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  try {
    // Check if user is authenticated
    const session = await getSession();

    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user is admin
    const profile = await queryOne<Profile>`
      SELECT is_admin
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (!profile?.is_admin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Get all chapters for this course
    const chapters = await query<Chapter>`
      SELECT id
      FROM chapters
      WHERE course_id = ${params.courseId}
    `;

    if (chapters && chapters.length > 0) {
      const chapterIds = chapters.map(chapter => chapter.id);

      // Get all lessons for these chapters
      const lessons = await query<Lesson>`
        SELECT id, mux_playback_id
        FROM lessons
        WHERE chapter_id = ANY(${chapterIds})
      `;

      // Delete Mux videos
      if (lessons) {
        await Promise.all(
          lessons
            .filter(lesson => lesson.mux_playback_id)
            .map(async (lesson) => {
              try {
                await Video.assets.delete(lesson.mux_playback_id!);
              } catch (error) {
                console.error('Error deleting Mux video:', error);
              }
            })
        );
      }

      // Delete lessons
      if (lessons && lessons.length > 0) {
        const lessonIds = lessons.map(lesson => lesson.id);
        try {
          await sql`
            DELETE FROM lessons
            WHERE id = ANY(${lessonIds})
          `;
        } catch (lessonsError) {
          console.error('Error deleting lessons:', lessonsError);
        }
      }

      // Delete chapters
      try {
        await sql`
          DELETE FROM chapters
          WHERE id = ANY(${chapterIds})
        `;
      } catch (chaptersError) {
        console.error('Error deleting chapters:', chaptersError);
      }
    }

    // Finally delete the course
    try {
      await sql`
        DELETE FROM courses
        WHERE id = ${params.courseId}
      `;
    } catch (courseError) {
      console.error('Error deleting course:', courseError);
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error in DELETE /api/admin/courses/[courseId]:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  try {
    // Check if user is authenticated
    const session = await getSession();

    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if user is admin
    const profile = await queryOne<Profile>`
      SELECT is_admin
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (!profile?.is_admin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Get request body
    const body = await request.json();
    const { title, description } = body;

    if (!title) {
      return new NextResponse('Title is required', { status: 400 });
    }

    // Update course
    const updatedCourse = await queryOne<Course>`
      UPDATE courses
      SET
        title = ${title},
        description = ${description},
        updated_at = NOW()
      WHERE id = ${params.courseId}
      RETURNING *
    `;

    if (!updatedCourse) {
      return new NextResponse('Course not found', { status: 404 });
    }

    return NextResponse.json(updatedCourse);
  } catch (error) {
    console.error('Error in PATCH /api/admin/courses/[courseId]:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
