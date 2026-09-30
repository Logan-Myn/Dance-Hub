import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { requireCommunityManager } from "@/lib/community-auth";
import { deleteMuxAsset, Video } from "@/lib/mux";
import { isMuxAssetUsedElsewhere } from "@/lib/mux-asset-usage";
import { deleteFile } from "@/lib/storage";

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  video_asset_id: string | null;
  playback_id: string | null;
  chapter_id: string;
  lesson_position: number;
  created_at: string;
  updated_at: string;
}

type LessonParams = {
  communitySlug: string;
  courseSlug: string;
  chapterId: string;
  lessonId: string;
};

/**
 * Loads the lesson only if the whole URL chain holds: lesson -> chapter ->
 * course (by slug) -> community. Anything else is a 404.
 */
async function findScopedLesson(params: LessonParams, communityId: string) {
  return queryOne<{
    id: string;
    chapter_id: string;
    video_asset_id: string | null;
    playback_id: string | null;
  }>`
    SELECT l.id, l.chapter_id, l.video_asset_id, l.playback_id
    FROM lessons l
    JOIN chapters ch ON ch.id = l.chapter_id
    JOIN courses co ON co.id = ch.course_id
    WHERE l.id = ${params.lessonId}
      AND ch.id = ${params.chapterId}
      AND co.slug = ${params.courseSlug}
      AND co.community_id = ${communityId}
  `;
}

/**
 * True if another community already uses this Mux asset (a lesson, a live-class
 * recording or its About page). A freshly uploaded asset is not referenced
 * anywhere yet, so this lets new uploads through while stopping an owner from
 * pointing a lesson at someone else's video (and then deleting it with the
 * lesson).
 */
async function assetUsedByOtherCommunity(assetId: string, communityId: string): Promise<boolean> {
  const row = await queryOne<{ one: number }>`
    SELECT 1 AS one
    WHERE EXISTS (
      SELECT 1
      FROM lessons l
      JOIN chapters ch ON ch.id = l.chapter_id
      JOIN courses co ON co.id = ch.course_id
      WHERE l.video_asset_id = ${assetId} AND co.community_id <> ${communityId}
    )
    OR EXISTS (
      SELECT 1
      FROM live_class_recordings r
      JOIN live_classes lc ON lc.id = r.live_class_id
      WHERE r.mux_asset_id = ${assetId} AND lc.community_id <> ${communityId}
    )
    OR EXISTS (
      SELECT 1
      FROM communities
      WHERE id <> ${communityId} AND about_page::text LIKE ${`%${assetId}%`}
    )
  `;
  return Boolean(row);
}

export async function PUT(
  request: Request,
  props: {
    params: Promise<{
      communitySlug: string;
      courseSlug: string;
      chapterId: string;
      lessonId: string;
    }>;
  }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    const body = await request.json();
    const { title, content, videoAssetId, playbackId } = body;

    const currentLesson = await findScopedLesson(params, community.id);
    if (!currentLesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // A changed video must not be another community's asset. Re-saving the
    // lesson's current video (every text save sends it back) is always fine.
    if (videoAssetId != null && videoAssetId !== currentLesson.video_asset_id) {
      if (
        typeof videoAssetId !== "string" ||
        (await assetUsedByOtherCommunity(videoAssetId, community.id))
      ) {
        return NextResponse.json(
          { error: "This video cannot be used for this lesson" },
          { status: 403 }
        );
      }
    }

    // A new playback id must come with its video and actually belong to it,
    // otherwise a lesson could play another community's video.
    if (playbackId != null && playbackId !== currentLesson.playback_id) {
      const assetId = videoAssetId ?? currentLesson.video_asset_id;
      const asset = assetId ? await Video.assets.retrieve(assetId).catch(() => null) : null;
      const belongs = asset?.playback_ids?.some((p) => p.id === playbackId);
      if (!belongs) {
        return NextResponse.json(
          { error: "This video cannot be used for this lesson" },
          { status: 403 }
        );
      }
    }

    // Update the lesson using COALESCE for partial updates
    const updatedLesson = await queryOne<Lesson>`
      UPDATE lessons
      SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        video_asset_id = COALESCE(${videoAssetId ?? null}, video_asset_id),
        playback_id = COALESCE(${playbackId ?? null}, playback_id),
        updated_at = NOW()
      WHERE id = ${currentLesson.id}
        AND chapter_id = ${currentLesson.chapter_id}
      RETURNING *
    `;

    if (!updatedLesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Transform the response for frontend compatibility
    const transformedLesson = {
      ...updatedLesson,
      order: updatedLesson.lesson_position,
      videoAssetId: updatedLesson.video_asset_id,
      playbackId: updatedLesson.playback_id,
    };

    return NextResponse.json(transformedLesson);
  } catch (error) {
    console.error("Error updating lesson:", error);
    return NextResponse.json(
      { error: "Failed to update lesson" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: {
    params: Promise<{
      communitySlug: string;
      courseSlug: string;
      chapterId: string;
      lessonId: string;
    }>;
  }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    // Resolve the lesson through this community before touching anything.
    const lesson = await findScopedLesson(params, community.id);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Keep the Mux asset if something else still plays it (another lesson or
    // an About page); deleting it would break that video too.
    const assetStillInUse = lesson.video_asset_id
      ? await isMuxAssetUsedElsewhere(lesson.video_asset_id, [lesson.id])
      : false;

    if (lesson.video_asset_id && !assetStillInUse) {
      // Delete the video from Mux (this also removes its alternate audio tracks on Mux).
      await deleteMuxAsset(lesson.video_asset_id);

      // Clean up our audio-track rows and their stored source files.
      const audioTracks = await sql<{ id: string; b2_key: string | null }[]>`
        SELECT id, b2_key FROM audio_tracks WHERE mux_asset_id = ${lesson.video_asset_id}
      `;
      for (const track of audioTracks) {
        if (track.b2_key) {
          try {
            await deleteFile(track.b2_key);
          } catch (b2Error) {
            console.error('Failed to delete audio source from storage (non-fatal):', b2Error);
          }
        }
      }
      await sql`DELETE FROM audio_tracks WHERE mux_asset_id = ${lesson.video_asset_id}`;
    }

    // Clean up any linked live class recording
    try {
      await sql`
        DELETE FROM live_class_recordings WHERE lesson_id = ${lesson.id}
      `;
    } catch (cleanupError) {
      console.error("Error cleaning up recording link:", cleanupError);
    }

    // Delete the lesson
    try {
      await sql`
        DELETE FROM lessons
        WHERE id = ${lesson.id}
          AND chapter_id = ${lesson.chapter_id}
      `;
    } catch (deleteError) {
      console.error("Error deleting lesson:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete lesson" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Lesson and associated video deleted successfully" });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    return NextResponse.json(
      { error: "Failed to delete lesson" },
      { status: 500 }
    );
  }
}
