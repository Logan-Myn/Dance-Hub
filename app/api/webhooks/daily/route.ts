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
        console.error("Daily webhook signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type;

    console.log(`Daily webhook received: ${eventType}`);

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

  const liveClass = await queryOne<LiveClassForRecording>`
    SELECT id, recording_id, community_id, title, status, enable_recording
    FROM live_classes
    WHERE daily_room_name = ${roomName}
      AND enable_recording = true
      AND status = 'live'
  `;

  if (!liveClass) return;

  // Check if there's already a pending recording
  if (liveClass.recording_id) {
    const recording = await queryOne<Recording>`
      SELECT id, status FROM live_class_recordings WHERE id = ${liveClass.recording_id}
    `;
    if (recording && recording.status === 'pending') {
      // Start recording
      try {
        await startRecording(roomName);
        await sql`
          UPDATE live_class_recordings SET status = 'recording', updated_at = NOW()
          WHERE id = ${recording.id}
        `;
        console.log(`Started recording for live class ${liveClass.id}`);
      } catch (error) {
        console.error(`Failed to start recording for live class ${liveClass.id}:`, error);
        await sql`
          UPDATE live_class_recordings SET status = 'failed', error = ${String(error)}, updated_at = NOW()
          WHERE id = ${recording.id}
        `;
      }
    }
  }
}

async function handleRecordingStopped(event: any) {
  const roomName = event.payload?.room;
  const recordingId = event.payload?.recording_id;
  if (!roomName || !recordingId) return;

  const liveClass = await queryOne<LiveClassForRecording>`
    SELECT id, recording_id, community_id, title, status, enable_recording
    FROM live_classes
    WHERE daily_room_name = ${roomName}
      AND enable_recording = true
  `;

  if (!liveClass || !liveClass.recording_id) return;

  // Store the Daily recording ID on the recording row
  await sql`
    UPDATE live_class_recordings
    SET daily_recording_id = ${recordingId}, updated_at = NOW()
    WHERE id = ${liveClass.recording_id}
  `;

  // If class is still live, restart recording for resilience
  if (liveClass.status === 'live') {
    try {
      await startRecording(roomName);
      console.log(`Restarted recording for live class ${liveClass.id}`);
    } catch (error) {
      console.error(`Failed to restart recording for live class ${liveClass.id}:`, error);
    }
  }
}

async function handleRecordingReady(event: any) {
  const recordingId = event.payload?.recording_id;
  if (!recordingId) return;

  // Find the recording by daily_recording_id
  const recording = await queryOne<Recording>`
    SELECT id, status, live_class_id, daily_recording_id
    FROM live_class_recordings
    WHERE daily_recording_id = ${recordingId}
  `;

  if (!recording || !recording.live_class_id) return;

  try {
    // Update to processing
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

    // Store Mux asset ID
    await sql`
      UPDATE live_class_recordings
      SET mux_asset_id = ${muxAsset.id}, updated_at = NOW()
      WHERE id = ${recording.id}
    `;

    console.log(`Recording ${recording.id} sent to Mux for processing, asset: ${muxAsset.id}`);
  } catch (error) {
    console.error(`Failed to process recording ${recording.id}:`, error);
    await sql`
      UPDATE live_class_recordings
      SET status = 'failed', error = ${String(error)}, updated_at = NOW()
      WHERE id = ${recording.id}
    `;
  }
}
