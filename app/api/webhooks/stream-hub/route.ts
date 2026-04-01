import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";

interface CallbackPayload {
  event: "recording.ready" | "recording.failed";
  roomName: string;
  muxPlaybackId?: string;
  muxAssetId?: string;
  durationSeconds?: number;
  error?: string;
}

interface RecordingWithClass {
  id: string;
  live_class_id: string;
  class_title: string;
  community_id: string;
  scheduled_start_time: string;
}

interface Course {
  id: string;
  slug: string;
}

interface Chapter {
  id: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload: CallbackPayload = await request.json();
    console.log(`Stream-Hub callback received: ${payload.event} for room ${payload.roomName}`);

    switch (payload.event) {
      case "recording.ready":
        await handleRecordingReady(payload);
        break;
      case "recording.failed":
        await handleRecordingFailed(payload);
        break;
      default:
        console.log(`Unhandled Stream-Hub callback event: ${payload.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stream-Hub callback error:", error);
    return NextResponse.json({ error: "Callback processing failed" }, { status: 500 });
  }
}

async function handleRecordingReady(payload: CallbackPayload) {
  const { roomName, muxPlaybackId, muxAssetId, durationSeconds } = payload;

  // Extract classId from room name (format: "live-class-{classId}")
  const classId = roomName.replace("live-class-", "");

  const recording = await queryOne<RecordingWithClass>`
    SELECT
      r.id,
      r.live_class_id,
      lc.title as class_title,
      lc.community_id,
      lc.scheduled_start_time
    FROM live_class_recordings r
    JOIN live_classes lc ON lc.id = r.live_class_id
    WHERE lc.id = ${classId}
    ORDER BY r.created_at DESC
    LIMIT 1
  `;

  if (!recording) {
    console.log(`No recording found for room ${roomName}`);
    return;
  }

  try {
    // Find or create the "Live Class Replays" course
    const course = await findOrCreateReplayCourse(recording.community_id);

    // Find or create monthly chapter
    const scheduledDate = new Date(recording.scheduled_start_time);
    const chapter = await findOrCreateMonthlyChapter(course.id, scheduledDate);

    // Get next lesson position
    const posResult = await queryOne<{ max_pos: number | null }>`
      SELECT MAX(lesson_position) as max_pos FROM lessons WHERE chapter_id = ${chapter.id}
    `;
    const nextPosition = (posResult?.max_pos ?? 0) + 1;

    // Create replay lesson
    const lesson = await queryOne<{ id: string }>`
      INSERT INTO lessons (
        chapter_id, title, video_asset_id, playback_id, lesson_position
      ) VALUES (
        ${chapter.id},
        ${`${recording.class_title} — Replay`},
        ${muxAssetId || null},
        ${muxPlaybackId || null},
        ${nextPosition}
      )
      RETURNING id
    `;

    // Update recording as ready
    await sql`
      UPDATE live_class_recordings
      SET
        status = 'ready',
        mux_playback_id = ${muxPlaybackId || null},
        mux_asset_id = ${muxAssetId || null},
        duration_seconds = ${durationSeconds || null},
        lesson_id = ${lesson?.id || null},
        updated_at = NOW()
      WHERE id = ${recording.id}
    `;

    console.log(`Replay lesson created for live class recording ${recording.id}`);
  } catch (error) {
    console.error(`Failed to create replay for recording ${recording.id}:`, error);
    await sql`
      UPDATE live_class_recordings
      SET status = 'failed', error = ${String(error)}, updated_at = NOW()
      WHERE id = ${recording.id}
    `;
  }
}

async function handleRecordingFailed(payload: CallbackPayload) {
  const classId = payload.roomName.replace("live-class-", "");

  await sql`
    UPDATE live_class_recordings
    SET status = 'failed', error = ${payload.error || "Recording failed"}, updated_at = NOW()
    WHERE live_class_id = ${classId}
  `;

  console.error(`Recording failed for room ${payload.roomName}: ${payload.error}`);
}

async function findOrCreateReplayCourse(communityId: string): Promise<Course> {
  const existing = await queryOne<Course>`
    SELECT id, slug FROM courses
    WHERE community_id = ${communityId} AND slug = 'live-class-replays'
  `;

  if (existing) return existing;

  const created = await queryOne<Course>`
    INSERT INTO courses (community_id, title, slug, description, is_public)
    VALUES (
      ${communityId},
      'Live Class Replays',
      'live-class-replays',
      'Automatically generated replays from live classes',
      false
    )
    RETURNING id, slug
  `;

  if (!created) throw new Error("Failed to create replay course");
  return created;
}

async function findOrCreateMonthlyChapter(courseId: string, date: Date): Promise<Chapter> {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const chapterTitle = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

  const existing = await queryOne<Chapter>`
    SELECT id FROM chapters
    WHERE course_id = ${courseId} AND title = ${chapterTitle}
  `;

  if (existing) return existing;

  const posResult = await queryOne<{ max_pos: number | null }>`
    SELECT MAX(chapter_position) as max_pos FROM chapters WHERE course_id = ${courseId}
  `;
  const nextPosition = (posResult?.max_pos ?? 0) + 1;

  const created = await queryOne<Chapter>`
    INSERT INTO chapters (course_id, title, chapter_position)
    VALUES (${courseId}, ${chapterTitle}, ${nextPosition})
    RETURNING id
  `;

  if (!created) throw new Error("Failed to create monthly chapter");
  return created;
}
