import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, sql } from "@/lib/db";
import { startRecording, getRecordingAccessLink } from "@/lib/daily";
import { createAssetFromUrls } from "@/lib/mux";
import crypto from "crypto";

const DAILY_WEBHOOK_SECRET = process.env.DAILY_WEBHOOK_SECRET;

function verifySignature(payload: string, timestamp: string, signature: string): boolean {
  if (!DAILY_WEBHOOK_SECRET) return false;
  const key = Buffer.from(DAILY_WEBHOOK_SECRET, "base64");
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(`${timestamp}.${payload}`);
  const expected = hmac.digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface LiveClassForRecording {
  id: string;
  recording_id: string | null;
  community_id: string;
  title: string;
  status: string;
  enable_recording: boolean;
}

interface RecordingRow {
  id: string;
  status: string;
  live_class_id: string | null;
  daily_recording_id: string | null;
  duration_seconds: number | null;
}

// GET handler for Daily webhook verification
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Handle empty/non-JSON bodies (Daily verification ping)
    if (!rawBody || !rawBody.trim().startsWith("{")) {
      console.log("Daily webhook: empty or non-JSON body (verification ping)");
      return NextResponse.json({ received: true });
    }

    const signature = request.headers.get("x-webhook-signature") ?? "";
    const timestamp = request.headers.get("x-webhook-timestamp") ?? "";

    if (DAILY_WEBHOOK_SECRET && signature) {
      if (!verifySignature(rawBody, timestamp, signature)) {
        console.warn("Daily webhook signature mismatch — processing anyway");
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type;

    console.log(`Daily webhook received: ${eventType}`, JSON.stringify(event.payload || {}).slice(0, 200));

    switch (eventType) {
      case "meeting.started":
        await handleMeetingStarted(event);
        break;
      case "recording.stopped":
        await handleRecordingStopped(event);
        break;
      case "recording.ready-to-download":
        await handleRecordingReady(event);
        break;
      case "recording.error":
        await handleRecordingError(event);
        break;
      default:
        console.log(`Unhandled Daily webhook event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Daily webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleMeetingStarted(event: any) {
  const roomName = event.payload?.room;
  if (!roomName) return;

  console.log(`[recording] meeting.started for room: ${roomName}`);

  const liveClass = await queryOne<LiveClassForRecording>`
    SELECT id, recording_id, community_id, title, status, enable_recording
    FROM live_classes
    WHERE daily_room_name = ${roomName}
      AND enable_recording = true
      AND status = 'live'
  `;

  if (!liveClass) {
    console.log(`[recording] No live class found for room ${roomName} (or recording not enabled)`);
    return;
  }

  if (!liveClass.recording_id) {
    console.log(`[recording] Live class ${liveClass.id} has no recording_id`);
    return;
  }

  const recording = await queryOne<RecordingRow>`
    SELECT id, status, live_class_id, daily_recording_id, duration_seconds
    FROM live_class_recordings WHERE id = ${liveClass.recording_id}
  `;

  // If current recording is pending, start it
  if (recording && recording.status === 'pending') {
    try {
      const result = await startRecording(roomName);
      const dailyRecordingId = result?.recordingId || result?.id;
      console.log(`[recording] startRecording response:`, JSON.stringify(result));

      await sql`
        UPDATE live_class_recordings
        SET status = 'recording',
            daily_recording_id = ${dailyRecordingId || null},
            updated_at = NOW()
        WHERE id = ${recording.id}
      `;
      console.log(`[recording] Started recording for live class ${liveClass.id}, dailyRecordingId: ${dailyRecordingId}`);
    } catch (error) {
      console.error(`[recording] Failed to start recording for live class ${liveClass.id}:`, error);
      await sql`
        UPDATE live_class_recordings SET status = 'failed', error = ${String(error)}, updated_at = NOW()
        WHERE id = ${recording.id}
      `;
    }
    return;
  }

  // If current recording already completed/processing (e.g. teacher left and came back),
  // create a new recording segment and start it
  if (!recording || recording.status !== 'recording') {
    console.log(`[recording] Current recording ${liveClass.recording_id} is '${recording?.status}' — creating new segment for rejoined meeting`);

    try {
      const newRecording = await queryOne<{ id: string }>`
        INSERT INTO live_class_recordings (live_class_id, status)
        VALUES (${liveClass.id}, 'pending')
        RETURNING id
      `;

      if (!newRecording) {
        console.error(`[recording] Failed to create new segment for live class ${liveClass.id}`);
        return;
      }

      const result = await startRecording(roomName);
      const dailyRecordingId = result?.recordingId || result?.id;

      await sql`
        UPDATE live_class_recordings
        SET status = 'recording',
            daily_recording_id = ${dailyRecordingId || null},
            updated_at = NOW()
        WHERE id = ${newRecording.id}
      `;

      await sql`
        UPDATE live_classes SET recording_id = ${newRecording.id}, updated_at = NOW()
        WHERE id = ${liveClass.id}
      `;

      console.log(`[recording] Started new recording segment for live class ${liveClass.id}, dailyRecordingId: ${dailyRecordingId}`);
    } catch (error) {
      console.error(`[recording] Failed to start new recording segment for live class ${liveClass.id}:`, error);
    }
  }
}

/**
 * Recording stopped — restart if live is still active and not being intentionally ended.
 * This handles Daily's recording time limits, unexpected stops, and owner-left scenarios.
 * Creates a new recording segment and restarts recording.
 */
async function handleRecordingStopped(event: any) {
  const roomName = event.payload?.room;
  if (!roomName) return;

  console.log(`[recording] recording.stopped for room: ${roomName}`);

  // Small delay to allow the "End Class" PUT request to finish updating the DB
  // This prevents a race condition where the webhook fires before status is set to 'ended'
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const liveClass = await queryOne<LiveClassForRecording>`
    SELECT id, recording_id, community_id, title, status, enable_recording
    FROM live_classes
    WHERE daily_room_name = ${roomName}
      AND enable_recording = true
  `;

  if (!liveClass) return;

  // If class is ended or being ended, don't restart
  if (liveClass.status !== 'live') {
    console.log(`[recording] Class ${liveClass.id} status is '${liveClass.status}' — not restarting recording`);
    return;
  }

  // Check if any recordings are in 'stopping' state (intentional end via End Class button)
  const stoppingRecording = await queryOne<{ id: string }>`
    SELECT id FROM live_class_recordings
    WHERE live_class_id = ${liveClass.id} AND status = 'stopping'
    LIMIT 1
  `;

  if (stoppingRecording) {
    console.log(`[recording] Class ${liveClass.id} has recordings in 'stopping' state — not restarting (intentional end)`);
    return;
  }

  // Class is still live and recording wasn't intentionally stopped — restart it
  console.log(`[recording] Recording stopped while class ${liveClass.id} still live — restarting...`);

  try {
    // Create a new recording segment
    const newRecording = await queryOne<{ id: string }>`
      INSERT INTO live_class_recordings (live_class_id, status)
      VALUES (${liveClass.id}, 'pending')
      RETURNING id
    `;

    if (!newRecording) {
      console.error(`[recording] Failed to create new segment for live class ${liveClass.id}`);
      return;
    }

    const result = await startRecording(roomName);
    const dailyRecordingId = result?.recordingId || result?.id;
    console.log(`[recording] Restarted recording for room: ${roomName}, dailyRecordingId: ${dailyRecordingId}`);

    await sql`
      UPDATE live_class_recordings
      SET status = 'recording',
          daily_recording_id = ${dailyRecordingId || null},
          updated_at = NOW()
      WHERE id = ${newRecording.id}
    `;

    // Update live class to point to new active recording segment
    await sql`
      UPDATE live_classes SET recording_id = ${newRecording.id}, updated_at = NOW()
      WHERE id = ${liveClass.id}
    `;
  } catch (error) {
    console.error(`[recording] Failed to restart recording for live class ${liveClass.id}:`, error);
    // Recording restart failed — this likely means the room is empty
    // Don't mark anything as failed; the recording segment will stay pending
    // and will be cleaned up when the class eventually ends
  }
}

/**
 * Recording file ready — store info and try to concatenate all segments.
 * If live has ended and all segments are ready, concatenate into one Mux asset.
 */
async function handleRecordingReady(event: any) {
  const recordingId = event.payload?.recording_id;
  const duration = event.payload?.duration;
  if (!recordingId) return;

  console.log(`[recording] recording.ready-to-download, recording_id: ${recordingId}, duration: ${duration}`);

  // Find the recording by daily_recording_id
  const recording = await queryOne<RecordingRow>`
    SELECT id, status, live_class_id, daily_recording_id, duration_seconds
    FROM live_class_recordings
    WHERE daily_recording_id = ${recordingId}
  `;

  if (!recording || !recording.live_class_id) {
    console.warn(`[recording] No recording found for daily_recording_id: ${recordingId}`);
    return;
  }

  try {
    // Mark this segment as processing and store duration
    await sql`
      UPDATE live_class_recordings
      SET status = 'processing',
          duration_seconds = ${duration || null},
          updated_at = NOW()
      WHERE id = ${recording.id}
    `;

    // Try to concatenate if live class has ended and all segments are ready
    await tryConcatenateSegments(recording.live_class_id);
  } catch (error) {
    console.error(`[recording] Failed to process recording ${recording.id}:`, error);
    await sql`
      UPDATE live_class_recordings
      SET status = 'failed', error = ${String(error)}, updated_at = NOW()
      WHERE id = ${recording.id}
    `;
  }
}

/**
 * Check if all segments for a live class are ready and the class has ended.
 * If so, concatenate all segments into a single Mux asset.
 */
async function tryConcatenateSegments(liveClassId: string) {
  const liveClass = await queryOne<{ id: string; status: string; title: string }>`
    SELECT id, status, title FROM live_classes WHERE id = ${liveClassId}
  `;

  if (!liveClass || liveClass.status !== 'ended') {
    console.log(`[recording] Live class ${liveClassId} not ended yet (status: ${liveClass?.status}) — waiting`);
    return;
  }

  // Get all recording segments for this live class
  const segments = await query<RecordingRow>`
    SELECT id, status, live_class_id, daily_recording_id, duration_seconds
    FROM live_class_recordings
    WHERE live_class_id = ${liveClassId}
    ORDER BY created_at ASC
  `;

  // Check if any are still recording, pending, or stopping
  const stillActive = segments.some((s) => s.status === 'pending' || s.status === 'recording' || s.status === 'stopping');
  if (stillActive) {
    console.log(`[recording] Some segments still active for live class ${liveClassId} — waiting`);
    return;
  }

  // Check if we already created a Mux asset
  const alreadyProcessed = segments.some((s) => s.status === 'ready');
  if (alreadyProcessed) {
    console.log(`[recording] Segments already processed for live class ${liveClassId}`);
    return;
  }

  // Get segments that are ready for concatenation
  const readySegments = segments.filter((s) => s.daily_recording_id && s.status === 'processing');
  if (readySegments.length === 0) {
    console.log(`[recording] No ready segments for live class ${liveClassId}`);
    return;
  }

  console.log(`[recording] Concatenating ${readySegments.length} segment(s) for live class "${liveClass.title}"`);

  try {
    // Get download URLs for all segments
    const downloadUrls: string[] = [];
    for (const seg of readySegments) {
      const url = await getRecordingAccessLink(seg.daily_recording_id!);
      if (!url) throw new Error(`Failed to get access link for segment ${seg.id}`);
      downloadUrls.push(url);
    }

    // Create a single Mux asset from all segment URLs (Mux concatenates them)
    const primaryRecording = readySegments[0];
    const muxAsset = await createAssetFromUrls(downloadUrls, `live-class-recording-${primaryRecording.id}`);

    // Calculate total duration
    const totalDuration = readySegments.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);

    // Update the first recording with the Mux asset info
    await sql`
      UPDATE live_class_recordings
      SET mux_asset_id = ${muxAsset.id},
          duration_seconds = ${totalDuration},
          status = 'processing',
          updated_at = NOW()
      WHERE id = ${primaryRecording.id}
    `;

    // Clean up extra segment rows (keep only the primary)
    if (readySegments.length > 1) {
      for (const seg of readySegments.slice(1)) {
        await sql`DELETE FROM live_class_recordings WHERE id = ${seg.id}`;
      }
    }

    console.log(`[recording] Created Mux asset ${muxAsset.id} (${readySegments.length} segments, ${Math.round(totalDuration)}s total)`);
  } catch (error) {
    console.error(`[recording] Failed to concatenate segments for live class ${liveClassId}:`, error);
    await sql`
      UPDATE live_class_recordings
      SET status = 'failed', error = ${String(error)}, updated_at = NOW()
      WHERE id = ${readySegments[0].id}
    `;
  }
}

async function handleRecordingError(event: any) {
  const roomName = event.payload?.room;
  console.error(`[recording] Recording error for room ${roomName}:`, JSON.stringify(event.payload));
}
