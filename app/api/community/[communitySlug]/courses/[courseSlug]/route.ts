import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { slugify } from "@/lib/utils";
import { uploadFile, generateFileKey, deleteFile } from "@/lib/storage";

interface Community {
  id: string;
  name: string;
  created_by: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  slug: string;
  community_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  video_asset_id: string | null;
  chapter_id: string;
  lesson_position: number;
  playback_id: string | null;
}

interface Chapter {
  id: string;
  title: string;
  chapter_position: number;
  course_id: string;
}

interface ChapterWithLessons extends Chapter {
  lessons: Lesson[];
}

interface LessonCompletion {
  lesson_id: string;
}

export async function GET(
  request: Request,
  { params }: { params: { communitySlug: string; courseSlug: string } }
) {
  try {
    console.log("GET Course request params:", {
      communitySlug: params.communitySlug,
      courseSlug: params.courseSlug,
      timestamp: new Date().toISOString(),
    });

    // Get community
    const community = await queryOne<{ id: string }>`
      SELECT id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      console.error("Error fetching community:", {
        slug: params.communitySlug,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    const course = await queryOne<Course>`
      SELECT *
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Fetch chapters for this course
    const chapters = await query<Chapter>`
      SELECT *
      FROM chapters
      WHERE course_id = ${course.id}
      ORDER BY chapter_position ASC
    `;

    // Fetch all lessons for these chapters
    const chapterIds = chapters.map(c => c.id);
    let lessons: Lesson[] = [];

    if (chapterIds.length > 0) {
      lessons = await query<Lesson>`
        SELECT *
        FROM lessons
        WHERE chapter_id = ANY(${chapterIds})
        ORDER BY lesson_position ASC
      `;
    }

    // Group lessons by chapter
    const lessonsByChapter = new Map<string, Lesson[]>();
    for (const lesson of lessons) {
      const existing = lessonsByChapter.get(lesson.chapter_id) || [];
      existing.push(lesson);
      lessonsByChapter.set(lesson.chapter_id, existing);
    }

    // Build chapters with lessons
    const chaptersWithLessons: ChapterWithLessons[] = chapters.map(chapter => ({
      ...chapter,
      lessons: lessonsByChapter.get(chapter.id) || []
    }));

    const session = await getSession();
    const userId = session?.user?.id || null;

    // If user is authenticated, fetch completion status — scoped to this
    // course's lesson IDs so we don't ship every completion they've ever made.
    let completedLessonIds = new Set<string>();
    const allLessonIds = chaptersWithLessons.flatMap(c => c.lessons.map(l => l.id));
    if (userId && allLessonIds.length > 0) {
      const completions = await query<LessonCompletion>`
        SELECT lesson_id
        FROM lesson_completions
        WHERE user_id = ${userId}
          AND lesson_id = ANY(${allLessonIds}::uuid[])
      `;

      if (completions) {
        completedLessonIds = new Set(completions.map(c => c.lesson_id));
      }
    }

    // Transform the data to ensure video fields are included
    const transformedCourse = {
      ...course,
      chapters: chaptersWithLessons.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((lesson) => ({
          ...lesson,
          videoAssetId: lesson.video_asset_id,
          playbackId: lesson.playback_id,
          completed: completedLessonIds.has(lesson.id)
        }))
      }))
    };

    // Log the final transformed data
    console.log(
      "Transformed course data:",
      JSON.stringify(transformedCourse, null, 2)
    );

    return NextResponse.json(transformedCourse, {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Error in GET course route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { communitySlug } = params;

    // Get the community
    const community = await queryOne<{ id: string }>`
      SELECT id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Parse the form data
    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const imageFile = formData.get("image") as File;

    // Generate the slug from the title
    const slug = slugify(title);

    // Upload the image to B2 Storage
    let imageUrl: string;
    let fileKey: string;

    try {
      // Convert File to Buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Generate unique file key
      fileKey = generateFileKey('course-images', imageFile.name);

      // Upload to B2 Storage
      imageUrl = await uploadFile(buffer, fileKey, imageFile.type);
    } catch (uploadError) {
      console.error("Error uploading image:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Create a new course
    const newCourse = await queryOne<Course>`
      INSERT INTO courses (
        title,
        description,
        image_url,
        slug,
        community_id,
        created_at,
        updated_at
      ) VALUES (
        ${title},
        ${description},
        ${imageUrl},
        ${slug},
        ${community.id},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    if (!newCourse) {
      console.error("Error creating course: no row returned");
      // Clean up the uploaded image if course creation fails
      try {
        await deleteFile(fileKey);
      } catch (deleteError) {
        console.error("Error cleaning up uploaded file:", deleteError);
      }
      return NextResponse.json(
        { error: "Failed to create course" },
        { status: 500 }
      );
    }

    return NextResponse.json(newCourse);
  } catch (error) {
    console.error("Error creating course:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: { communitySlug: string; courseSlug: string } }
) {
  try {
    // Get community
    const community = await queryOne<Community>`
      SELECT id, name, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      console.error("Error fetching community");
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get current course
    const currentCourse = await queryOne<Course>`
      SELECT *
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!currentCourse) {
      console.error("Error fetching course");
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const isPublic = formData.get("is_public") === "true";

    // Update the course
    await sql`
      UPDATE courses
      SET
        title = ${title},
        description = ${description},
        is_public = ${isPublic},
        updated_at = NOW()
      WHERE id = ${currentCourse.id}
    `;

    // If the course was made public, fan out in-app notifications in a single
    // bulk insert (was previously one INSERT per member, taking minutes for
    // large communities).
    if (isPublic && !currentCourse.is_public) {
      const courseUrl = `/${params.communitySlug}/classroom/${params.courseSlug}`;
      const notifTitle = `New Course Available: ${title}`;
      const notifMessage = `A new course is now available in your community: ${community.name}`;

      try {
        await sql`
          INSERT INTO notifications (user_id, title, message, link, type)
          SELECT user_id, ${notifTitle}, ${notifMessage}, ${courseUrl}, 'course_published'
          FROM community_members
          WHERE community_id = ${community.id}
            AND user_id != ${community.created_by}
        `;
      } catch (notificationError) {
        console.error('Error creating course-published notifications:', notificationError);
      }
    }

    // The UPDATE above already wrote the row synchronously; trust it.
    const updatedCourse = await queryOne<Course>`
      SELECT *
      FROM courses
      WHERE id = ${currentCourse.id}
    `;

    if (!updatedCourse) {
      return NextResponse.json(
        { error: "Failed to verify course update" },
        { status: 500 }
      );
    }

    // Log the response for debugging
    console.log("PUT Course response:", {
      id: updatedCourse.id,
      title: updatedCourse.title,
      is_public: updatedCourse.is_public,
      updated_at: updatedCourse.updated_at,
      fetch_time: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        course: updatedCourse,
        madePublic: isPublic && !currentCourse.is_public,
      },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Error in PUT course route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
