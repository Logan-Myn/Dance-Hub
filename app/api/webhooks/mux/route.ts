import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import crypto from "crypto";

const MUX_WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null): boolean {
  if (!MUX_WEBHOOK_SECRET || !signature) return false;
  // Mux signature format: "t=<timestamp>,v1=<hex>"
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.replace("t=", "");
  const v1Sig = parts.find((p) => p.startsWith("v1="))?.replace("v1=", "");
  if (!timestamp || !v1Sig) return false;

  // Mux signs: "{timestamp}.{body}"
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac("sha256", MUX_WEBHOOK_SECRET);
  hmac.update(signedPayload);
  const expected = hmac.digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1Sig));
  } catch {
    return false;
  }
}

interface RecordingWithClass {
  id: string;
  live_class_id: string;
  mux_asset_id: string | null;
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
    const rawBody = await request.text();
    const signature = request.headers.get("mux-signature");

    if (MUX_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
      console.error("Mux webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type;

    console.log(`Mux webhook received: ${eventType}`);

    switch (eventType) {
      case "video.asset.ready":
        await handleAssetReady(event);
        break;
      case "video.asset.errored":
        await handleAssetErrored(event);
        break;
      default:
        console.log(`Unhandled Mux webhook event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Mux webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleAssetReady(event: any) {
  const assetId = event.data?.id;
  const playbackId = event.data?.playback_ids?.[0]?.id;
  const duration = event.data?.duration;

  if (!assetId) return;

  // Find recording by mux_asset_id
  const recording = await queryOne<RecordingWithClass>`
    SELECT
      r.id,
      r.live_class_id,
      r.mux_asset_id,
      lc.title as class_title,
      lc.community_id,
      lc.scheduled_start_time
    FROM live_class_recordings r
    JOIN live_classes lc ON lc.id = r.live_class_id
    WHERE r.mux_asset_id = ${assetId}
  `;

  if (!recording) {
    console.log(`No recording found for Mux asset ${assetId}`);
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
        ${assetId},
        ${playbackId || null},
        ${nextPosition}
      )
      RETURNING id
    `;

    // Update recording as ready
    await sql`
      UPDATE live_class_recordings
      SET
        status = 'ready',
        mux_playback_id = ${playbackId || null},
        duration_seconds = ${duration || null},
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

async function handleAssetErrored(event: any) {
  const assetId = event.data?.id;
  const errorMessage = event.data?.errors?.messages?.[0] || "Mux asset processing failed";

  if (!assetId) return;

  await sql`
    UPDATE live_class_recordings
    SET status = 'failed', error = ${errorMessage}, updated_at = NOW()
    WHERE mux_asset_id = ${assetId}
  `;

  console.error(`Mux asset ${assetId} errored: ${errorMessage}`);
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

  // Get next chapter position
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
