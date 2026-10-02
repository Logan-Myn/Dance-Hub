import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { uniqueCourseSlug } from "@/lib/course-slug";
import {
  requireCommunityManager,
  requireCommunityViewer,
  userCanManageCommunity,
} from "@/lib/community-auth";
import {
  uploadFile,
  generateFileKey,
  deleteFile,
  extractKeyFromUrl,
} from "@/lib/storage";
import { deleteMuxAsset } from "@/lib/mux";
import { isMuxAssetUsedElsewhere } from "@/lib/mux-asset-usage";
import { sanitizeRichTextOrNull } from "@/lib/sanitize-html";

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
  props: { params: Promise<{ communitySlug: string; courseSlug: string }> }
) {
  const params = await props.params;
  try {
    // Same rule as the classroom page: active (or grace-period) members, the
    // owner and platform admins. Pre-registered users are not let in yet.
    const guard = await requireCommunityViewer(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;
    const userId = guard.session.user.id;

    const course = await queryOne<Course>`
      SELECT *
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    // Unpublished courses are visible to the owner and admins only. Answer
    // 404 rather than 403 so members cannot probe for draft slugs.
    if (
      !course ||
      (!course.is_public && !(await userCanManageCommunity(userId, community.id)))
    ) {
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

    // Fetch completion status, scoped to this course's lesson IDs so we don't
    // ship every completion they've ever made.
    let completedLessonIds = new Set<string>();
    const allLessonIds = chaptersWithLessons.flatMap(c => c.lessons.map(l => l.id));
    if (allLessonIds.length > 0) {
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
          content: sanitizeRichTextOrNull(lesson.content),
          videoAssetId: lesson.video_asset_id,
          playbackId: lesson.playback_id,
          completed: completedLessonIds.has(lesson.id)
        }))
      }))
    };

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

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  props: { params: Promise<{ communitySlug: string; courseSlug: string }> }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

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
    const imageFile = formData.get("image");

    // A new cover image is optional — keep the current one when none is sent.
    let imageUrl = currentCourse.image_url;
    let uploadedKey: string | null = null;

    if (imageFile instanceof File && imageFile.size > 0) {
      try {
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        uploadedKey = generateFileKey("course-images", imageFile.name);
        imageUrl = await uploadFile(buffer, uploadedKey, imageFile.type);
      } catch (uploadError) {
        console.error("Error uploading course image:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload image" },
          { status: 500 }
        );
      }
    }

    // Regenerate the slug when the title changes so the URL tracks the new
    // title. Suffix with `-2`, `-3`, ... if the candidate collides with
    // another course in this community.
    let newSlug = currentCourse.slug;
    if (title && title !== currentCourse.title) {
      newSlug = await uniqueCourseSlug(community.id, title, currentCourse.id);
    }

    await sql`
      UPDATE courses
      SET
        title = ${title},
        description = ${description},
        is_public = ${isPublic},
        slug = ${newSlug},
        image_url = ${imageUrl},
        updated_at = NOW()
      WHERE id = ${currentCourse.id}
    `;

    // The row now points at the new cover, so the old one is unreachable.
    // Non-fatal: a leftover object is cheaper than failing a saved update.
    if (uploadedKey) {
      const previousKey = extractKeyFromUrl(currentCourse.image_url);
      if (previousKey && previousKey !== uploadedKey) {
        try {
          await deleteFile(previousKey);
        } catch (deleteError) {
          console.error("Error deleting previous course image:", deleteError);
        }
      }
    }

    // If the course was made public, fan out in-app notifications in a single
    // bulk insert (was previously one INSERT per member, taking minutes for
    // large communities).
    if (isPublic && !currentCourse.is_public) {
      const courseUrl = `/${params.communitySlug}/classroom/${newSlug}`;
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

export async function DELETE(
  request: Request,
  props: { params: Promise<{ communitySlug: string; courseSlug: string }> }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    const course = await queryOne<Course>`
      SELECT id, image_url
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Videos live in Mux, not in our database, so cascading the row delete is
    // not enough — collect the assets while the rows still exist.
    const lessons = await query<{ id: string; video_asset_id: string | null }>`
      SELECT l.id, l.video_asset_id
      FROM lessons l
      JOIN chapters c ON c.id = l.chapter_id
      WHERE c.course_id = ${course.id}
        AND l.video_asset_id IS NOT NULL
    `;
    const courseLessonIds = lessons.map((l) => l.id);

    for (const lesson of lessons) {
      const assetId = lesson.video_asset_id!;
      // Keep videos that something outside this course still plays.
      if (await isMuxAssetUsedElsewhere(assetId, courseLessonIds)) continue;
      try {
        await deleteMuxAsset(assetId);
      } catch (muxError) {
        console.error("Error deleting course video (non-fatal):", muxError);
      }

      // Same cleanup the single-lesson delete does for alternate audio.
      try {
        const audioTracks = await sql<{ id: string; b2_key: string | null }[]>`
          SELECT id, b2_key FROM audio_tracks WHERE mux_asset_id = ${assetId}
        `;
        for (const track of audioTracks) {
          if (track.b2_key) {
            try {
              await deleteFile(track.b2_key);
            } catch (b2Error) {
              console.error(
                "Failed to delete audio source from storage (non-fatal):",
                b2Error
              );
            }
          }
        }
        await sql`DELETE FROM audio_tracks WHERE mux_asset_id = ${assetId}`;
      } catch (audioError) {
        console.error("Error cleaning up audio tracks (non-fatal):", audioError);
      }
    }

    // chapters.course_id and lessons.chapter_id both cascade, so this one
    // statement clears the chapters, lessons and lesson completions too.
    await sql`DELETE FROM courses WHERE id = ${course.id}`;

    // Only after the row is gone — an orphaned object is harmless, a missing
    // cover on a course that failed to delete is not.
    const imageKey = extractKeyFromUrl(course.image_url);
    if (imageKey) {
      try {
        await deleteFile(imageKey);
      } catch (deleteError) {
        console.error("Error deleting course image (non-fatal):", deleteError);
      }
    }

    return NextResponse.json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 }
    );
  }
}
