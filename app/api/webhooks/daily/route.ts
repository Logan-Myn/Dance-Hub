import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
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

interface Recording {
  id: string;
  status: string;
  live_class_id: string | null;
  daily_recording_id: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
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

  const recording = await queryOne<Recording>`
    SELECT id, status FROM live_class_recordings WHERE id = ${liveClass.recording_id}
  `;

  if (!recording || recording.status !== 'pending') {
    console.log(`[recording] Recording ${liveClass.recording_id} not pending (status: ${recording?.status})`);
    return;
  }

  try {
    const result = await startRecording(roomName);
    // Store the daily_recording_id from the start response (needed for recording.ready-to-download)
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
}

async function handleRecordingReady(event: any) {
  const recordingId = event.payload?.recording_id;
  const duration = event.payload?.duration;
  if (!recordingId) return;

  console.log(`[recording] recording.ready-to-download, recording_id: ${recordingId}`);

  // Find the recording by daily_recording_id
  const recording = await queryOne<Recording>`
    SELECT id, status, live_class_id, daily_recording_id
    FROM live_class_recordings
    WHERE daily_recording_id = ${recordingId}
  `;

  if (!recording || !recording.live_class_id) {
    console.warn(`[recording] No recording found for daily_recording_id: ${recordingId}`);
    return;
  }

  try {
    await sql`
      UPDATE live_class_recordings SET status = 'processing', updated_at = NOW()
      WHERE id = ${recording.id}
    `;

    // Get download URL from Daily
    const accessLink = await getRecordingAccessLink(recordingId);
    if (!accessLink) {
      throw new Error("Failed to get recording access link from Daily");
    }

    // Create Mux asset from the recording URL
    const muxAsset = await createAssetFromUrls(
      [accessLink],
      `live-class-recording-${recording.id}`
    );

    await sql`
      UPDATE live_class_recordings
      SET mux_asset_id = ${muxAsset.id}, updated_at = NOW()
      WHERE id = ${recording.id}
    `;

    console.log(`[recording] Recording ${recording.id} sent to Mux, asset: ${muxAsset.id}`);
  } catch (error) {
    console.error(`[recording] Failed to process recording ${recording.id}:`, error);
    await sql`
      UPDATE live_class_recordings
      SET status = 'failed', error = ${String(error)}, updated_at = NOW()
      WHERE id = ${recording.id}
    `;
  }
}

async function handleRecordingError(event: any) {
  const roomName = event.payload?.room;
  console.error(`[recording] Recording error for room ${roomName}:`, JSON.stringify(event.payload));
}
