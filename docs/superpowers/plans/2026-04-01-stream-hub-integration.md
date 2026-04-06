# Stream-Hub Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Daily.co with Stream-Hub/LiveKit for all video functionality (live classes + private lessons) across Dance-Hub.

**Architecture:** Two-phase migration. Phase 1 migrates live classes (rooms, tokens, recording pipeline, UI). Phase 2 migrates private lessons (rooms, tokens, UI). A shared `lib/stream-hub.ts` client talks to Stream-Hub's REST API. Client-side components swap from `@daily-co/daily-react` to `@livekit/components-react` while preserving existing UX. Recording pipeline simplifies from 3 webhook handlers to 1 callback endpoint.

**Tech Stack:** Next.js 14, LiveKit (`livekit-client`, `@livekit/components-react`), Hono-based Stream-Hub service, Neon PostgreSQL, Bun

**Branch:** `feature/stream-hub-integration` (already created)
**Preprod DB:** Neon branch `preprod` (`br-small-union-ahrks3mo`)

---

## File Structure

### New Files
- `lib/stream-hub.ts` — Server-side Stream-Hub API client
- `app/api/webhooks/stream-hub/route.ts` — Callback endpoint for recording events
- `components/LiveKitClassRoom.tsx` — LiveKit-based live class video room (replaces `CustomDailyRoom.tsx`)
- `components/LiveKitControlBar.tsx` — Control bar using LiveKit hooks (replaces `ControlBar.tsx` Daily dependencies)
- `components/LiveKitChat.tsx` — Chat using LiveKit data messages (replaces `LiveClassChat.tsx` Daily dependencies)
- `components/LiveKitVideoCall.tsx` — Simple 1-on-1 LiveKit video call (replaces `UltraSimpleDaily.tsx`)

### Modified Files
- `app/api/live-classes/[classId]/video-token/route.ts` — Swap Daily to Stream-Hub calls
- `components/LiveClassVideoPage.tsx` — Use new LiveKit room component + new token shape
- `app/api/bookings/[bookingId]/video-token/route.ts` — Swap Daily to Stream-Hub calls
- `components/VideoSessionPage.tsx` — Use new LiveKit video call component + new token shape
- `package.json` — Add LiveKit deps, keep Daily deps until cleanup

### Deleted (Cleanup phase, after validation)
- `lib/daily.ts`
- `lib/video-room-service.ts`
- `lib/mux.ts`
- `lib/get-daily-domain.ts`
- `app/api/webhooks/daily/route.ts`
- `app/api/webhooks/mux/route.ts`
- `app/api/admin/fix-live-class-rooms/route.ts`
- `components/CustomDailyRoom.tsx`
- `components/ControlBar.tsx`
- `components/LiveClassChat.tsx`
- `components/DailyVideoCall.tsx`
- `components/UltraSimpleDaily.tsx`

---

## Task 1: Configure Stream-Hub API Key for Dance-Hub

**Files:**
- Modify: `/home/debian/sandbox/stream-hub/.env`

- [ ] **Step 1: Generate an API key**

```bash
openssl rand -hex 32
```

Copy the output — this will be used in both Stream-Hub and Dance-Hub.

- [ ] **Step 2: Add the key to Stream-Hub's `.env`**

Add this line to `/home/debian/sandbox/stream-hub/.env`:

```
API_KEY_DANCE_HUB=<the generated key>
```

- [ ] **Step 3: Restart Stream-Hub**

```bash
cd /home/debian/sandbox/stream-hub && pm2 restart stream-hub
```

- [ ] **Step 4: Add env vars to Dance-Hub `.env`**

Add these lines to `/home/debian/apps/dance-hub/.env`:

```
STREAM_HUB_URL=http://localhost:3060
STREAM_HUB_API_KEY=<the same generated key>
```

The `NEXT_PUBLIC_LIVEKIT_URL` will need to be set to the public WSS endpoint for LiveKit (check existing Expats-Estonia config or nginx setup for the correct URL).

- [ ] **Step 5: Verify connectivity**

```bash
curl -s -H "x-api-key: <the key>" http://localhost:3060/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: document Stream-Hub env var requirements"
```

---

## Task 2: Install LiveKit Client Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install LiveKit packages**

```bash
cd /home/debian/apps/dance-hub && bun add livekit-client @livekit/components-react @livekit/components-styles
```

- [ ] **Step 2: Verify installation**

```bash
bun run build 2>&1 | tail -5
```

Expected: Build succeeds (LiveKit packages are installed but not yet imported).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock && git commit -m "chore: add LiveKit client dependencies"
```

---

## Task 3: Create Stream-Hub API Client

**Files:**
- Create: `lib/stream-hub.ts`
- Test: manual curl verification

- [ ] **Step 1: Create the client**

Create `lib/stream-hub.ts`:

```typescript
const STREAM_HUB_URL = process.env.STREAM_HUB_URL || "http://localhost:3060";
const STREAM_HUB_API_KEY = process.env.STREAM_HUB_API_KEY!;

interface StreamHubRoom {
  name: string;
  maxParticipants: number;
  sid: string;
}

interface StreamHubToken {
  token: string;
  serverUrl: string;
}

interface StreamHubRecording {
  egressId: string;
  status: string;
}

async function streamHubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${STREAM_HUB_URL}${path}`, {
    ...options,
    headers: {
      "x-api-key": STREAM_HUB_API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stream-Hub ${options.method || "GET"} ${path} failed (${response.status}): ${body}`);
  }

  return response;
}

export async function createRoom(name: string, maxParticipants = 100): Promise<StreamHubRoom> {
  const res = await streamHubFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({ name, maxParticipants }),
  });
  return res.json();
}

export async function getRoom(name: string): Promise<StreamHubRoom | null> {
  try {
    const res = await streamHubFetch(`/rooms/${name}`);
    return res.json();
  } catch {
    return null;
  }
}

export async function deleteRoom(name: string): Promise<void> {
  await streamHubFetch(`/rooms/${name}`, { method: "DELETE" });
}

export async function generateToken(
  roomName: string,
  identity: string,
  role: "admin" | "participant" | "viewer"
): Promise<StreamHubToken> {
  const res = await streamHubFetch(`/rooms/${roomName}/tokens`, {
    method: "POST",
    body: JSON.stringify({ identity, role }),
  });
  return res.json();
}

export async function startRecording(roomName: string, callbackUrl: string): Promise<StreamHubRecording> {
  const res = await streamHubFetch(`/rooms/${roomName}/recordings/start`, {
    method: "POST",
    body: JSON.stringify({ callbackUrl }),
  });
  return res.json();
}

export async function stopRecording(roomName: string): Promise<StreamHubRecording> {
  const res = await streamHubFetch(`/rooms/${roomName}/recordings/stop`, {
    method: "POST",
  });
  return res.json();
}

export async function getRecordingStatus(roomName: string): Promise<StreamHubRecording | null> {
  try {
    const res = await streamHubFetch(`/rooms/${roomName}/recordings/status`);
    return res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/debian/apps/dance-hub && bunx tsc --noEmit lib/stream-hub.ts 2>&1 | head -20
```

Expected: No errors (or only unrelated project errors).

- [ ] **Step 3: Commit**

```bash
git add lib/stream-hub.ts && git commit -m "feat: add Stream-Hub API client"
```

---

## Task 4: Database Migration — Add `livekit_room_name` to `live_classes`

**Files:**
- Run SQL on preprod Neon branch only

- [ ] **Step 1: Run the migration on preprod**

Using the Neon MCP tool or SQL client, run against the `preprod` branch (`br-small-union-ahrks3mo`):

```sql
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
```

- [ ] **Step 2: Verify the column exists**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'live_classes' AND column_name = 'livekit_room_name';
```

Expected: One row with `livekit_room_name | text`.

- [ ] **Step 3: Commit a migration file for reference**

Create `supabase/migrations/20260401_add_livekit_room_name.sql`:

```sql
-- Stream-Hub integration: add LiveKit room tracking to live_classes
-- Run on preprod Neon branch only. Daily columns kept for production compatibility.
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
```

```bash
git add supabase/migrations/20260401_add_livekit_room_name.sql && git commit -m "feat: add livekit_room_name column to live_classes (preprod)"
```

---

## Task 5: Update Live Class Video Token Route

**Files:**
- Modify: `app/api/live-classes/[classId]/video-token/route.ts`

- [ ] **Step 1: Replace the route implementation**

Replace the entire contents of `app/api/live-classes/[classId]/video-token/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { createRoom, generateToken, startRecording } from "@/lib/stream-hub";

interface LiveClassWithDetails {
  id: string;
  community_id: string;
  teacher_id: string;
  community_created_by: string;
  scheduled_start_time: string;
  duration_minutes: number;
  livekit_room_name: string | null;
  status: string;
  enable_recording: boolean;
  recording_id: string | null;
}

interface Profile {
  display_name: string | null;
  full_name: string | null;
}

interface Membership {
  status: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = session.user;

    const liveClass = await queryOne<LiveClassWithDetails>`
      SELECT
        lc.id,
        lc.community_id,
        lc.teacher_id,
        c.created_by as community_created_by,
        lc.scheduled_start_time,
        lc.duration_minutes,
        lc.livekit_room_name,
        lc.status,
        lc.enable_recording,
        lc.recording_id
      FROM live_classes lc
      JOIN communities c ON c.id = lc.community_id
      WHERE lc.id = ${params.classId}
    `;

    if (!liveClass) {
      return NextResponse.json({ error: "Live class not found" }, { status: 404 });
    }

    // Get user profile for display name
    const profile = await queryOne<Profile>`
      SELECT display_name, full_name FROM profiles WHERE auth_user_id = ${user.id}
    `;
    const userName = profile?.display_name || profile?.full_name || user.email?.split("@")[0] || "Guest";

    // Authorization check
    const isTeacher = liveClass.teacher_id === user.id;
    const isCreator = liveClass.community_created_by === user.id;

    if (!isTeacher && !isCreator) {
      const membership = await queryOne<Membership>`
        SELECT status FROM community_members
        WHERE community_id = ${liveClass.community_id} AND user_id = ${user.id}
      `;
      if (!membership || membership.status !== "active") {
        return NextResponse.json({ error: "Access denied. Community membership required." }, { status: 403 });
      }
    }

    // Check join window (15 min before to end time)
    const now = new Date();
    const classStartTime = new Date(liveClass.scheduled_start_time);
    const classEndTime = new Date(classStartTime.getTime() + liveClass.duration_minutes * 60000);
    const joinWindowStart = new Date(classStartTime.getTime() - 15 * 60000);

    if (now < joinWindowStart) {
      return NextResponse.json({ error: "Class is not yet available to join" }, { status: 403 });
    }
    if (now > classEndTime) {
      return NextResponse.json({ error: "Class has ended" }, { status: 403 });
    }

    // Create room if needed (idempotent)
    const roomName = `live-class-${params.classId}`;
    if (!liveClass.livekit_room_name) {
      await createRoom(roomName, 100);
      await sql`
        UPDATE live_classes SET livekit_room_name = ${roomName}, updated_at = NOW()
        WHERE id = ${params.classId}
      `;
    }

    // When teacher joins and class is scheduled, set to live + start recording
    if (isTeacher && liveClass.status === "scheduled") {
      await sql`
        UPDATE live_classes SET status = 'live', updated_at = NOW()
        WHERE id = ${params.classId}
      `;

      if (liveClass.enable_recording && !liveClass.recording_id) {
        try {
          const recording = await queryOne<{ id: string }>`
            INSERT INTO live_class_recordings (live_class_id, status)
            VALUES (${params.classId}, 'recording')
            RETURNING id
          `;
          if (recording) {
            await sql`
              UPDATE live_classes SET recording_id = ${recording.id}, updated_at = NOW()
              WHERE id = ${params.classId}
            `;

            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const callbackUrl = `${appUrl}/api/webhooks/stream-hub`;
            await startRecording(roomName, callbackUrl);
            console.log(`Started recording for live class ${params.classId}`);
          }
        } catch (error) {
          console.error("Failed to start recording:", error);
        }
      }
    }

    // Generate token
    const role = isTeacher ? "admin" : "participant";
    const tokenData = await generateToken(roomName, userName, role);

    return NextResponse.json({
      token: tokenData.token,
      serverUrl: tokenData.serverUrl,
      isTeacher,
    });
  } catch (error) {
    console.error("Error generating live class video token:", error);
    return NextResponse.json({ error: "Failed to generate video token" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/debian/apps/dance-hub && bun run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add app/api/live-classes/\[classId\]/video-token/route.ts && git commit -m "feat: swap live class video-token route to Stream-Hub"
```

---

## Task 6: Create Stream-Hub Callback Webhook

**Files:**
- Create: `app/api/webhooks/stream-hub/route.ts`

- [ ] **Step 1: Create the webhook handler**

Create `app/api/webhooks/stream-hub/route.ts`:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/debian/apps/dance-hub && bun run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/stream-hub/route.ts && git commit -m "feat: add Stream-Hub callback webhook for recording pipeline"
```

---

## Task 7: Create LiveKit Live Class Room Component

**Files:**
- Create: `components/LiveKitClassRoom.tsx`

This replaces `CustomDailyRoom.tsx` with equivalent functionality using LiveKit React components. Same layout: header, video grid, chat sidebar, control bar. Same features: hand raise, active speakers, chat.

- [ ] **Step 1: Create the component**

Create `components/LiveKitClassRoom.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useDataChannel,
  useDisconnectButton,
  useRoomContext,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";
import LiveKitControlBar from "./LiveKitControlBar";
import LiveKitChat from "./LiveKitChat";
import type { ChatMessage } from "./LiveKitChat";

interface LiveKitClassRoomProps {
  token: string;
  serverUrl: string;
  onLeave: () => void;
  onEndClass?: () => void;
  classTitle?: string;
  isTeacher?: boolean;
}

export interface HandRaise {
  participantIdentity: string;
  userName: string;
}

interface DataMessage {
  type: string;
  sender?: string;
  participantIdentity?: string;
  text?: string;
  senderName?: string;
  timestamp?: number;
}

function CallInterface({
  onLeave,
  onEndClass,
  classTitle,
  isTeacher = false,
}: {
  onLeave: () => void;
  onEndClass?: () => void;
  classTitle?: string;
  isTeacher?: boolean;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMediaPermission, setHasMediaPermission] = useState(isTeacher);
  const [handRaises, setHandRaises] = useState<HandRaise[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [deniedFeedback, setDeniedFeedback] = useState(false);
  const [revokedFeedback, setRevokedFeedback] = useState(false);

  const trackRefs = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  // Data channel for chat + hand raise
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const { send: sendData } = useDataChannel("app-messages", (msg) => {
    const data: DataMessage = JSON.parse(decoder.decode(msg.payload));
    const fromIdentity = msg.participant?.identity || "";

    // Chat messages
    if (data.type === "chat" && data.text) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${fromIdentity}-${data.timestamp}`,
          sender: data.senderName || data.sender || "?",
          text: data.text || "",
          timestamp: new Date(data.timestamp || Date.now()),
          type: "chat",
          isLocal: false,
        },
      ]);
      if (!isChatOpen) setUnreadCount((c) => c + 1);
    }

    // Hand-raise flow
    if (isTeacher) {
      if (data.type === "hand-raise" && data.participantIdentity) {
        setHandRaises((prev) => {
          if (prev.some((r) => r.participantIdentity === data.participantIdentity)) return prev;
          return [...prev, { participantIdentity: data.participantIdentity!, userName: data.sender || "Student" }];
        });
        if (!isChatOpen) setUnreadCount((c) => c + 1);
      }
      if (data.type === "hand-lowered" && data.participantIdentity) {
        setHandRaises((prev) => prev.filter((r) => r.participantIdentity !== data.participantIdentity));
      }
    } else {
      if (data.type === "hand-approved") {
        setHasMediaPermission(true);
      }
      if (data.type === "hand-denied") {
        setHasMediaPermission(false);
        setDeniedFeedback(true);
      }
      if (data.type === "hand-revoked") {
        setHasMediaPermission(false);
        setRevokedFeedback(true);
        localParticipant.setMicrophoneEnabled(false);
        localParticipant.setCameraEnabled(false);
      }
    }
  });

  const sendAppMessage = useCallback(
    (data: DataMessage, destinationIdentities?: string[]) => {
      if (!sendData) return;
      const payload = encoder.encode(JSON.stringify(data));
      sendData(payload, { destination: destinationIdentities });
    },
    [sendData]
  );

  // Clean up stale hand raises when participants leave
  useEffect(() => {
    if (!isTeacher) return;
    const identities = participants.map((p) => p.identity);
    setHandRaises((prev) => prev.filter((r) => identities.includes(r.participantIdentity)));
  }, [participants, isTeacher]);

  // Clear feedback toasts
  useEffect(() => {
    if (deniedFeedback) {
      const timer = setTimeout(() => setDeniedFeedback(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [deniedFeedback]);

  useEffect(() => {
    if (revokedFeedback) {
      const timer = setTimeout(() => setRevokedFeedback(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [revokedFeedback]);

  // Enable teacher media on connect
  useEffect(() => {
    if (isTeacher && localParticipant) {
      localParticipant.setCameraEnabled(true);
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [isTeacher, localParticipant]);

  const toggleChat = () => {
    setIsChatOpen((prev) => !prev);
    if (!isChatOpen) setUnreadCount(0);
  };

  const canSend = isTeacher || hasMediaPermission;

  // Filter visible video tracks
  const videoTracks = trackRefs.filter(
    (t) => t.source === Track.Source.Camera && t.publication?.isSubscribed
  );

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <RoomAudioRenderer />

      {/* Feedback toasts */}
      {deniedFeedback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 text-sm font-bold rounded-lg animate-pulse">
          Your request was denied
        </div>
      )}
      {revokedFeedback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 text-sm font-bold rounded-lg animate-pulse">
          Your mic/camera access was revoked
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-blue-500">DanceHub</div>
            {classTitle && (
              <>
                <div className="text-gray-500">|</div>
                <div className="text-white font-medium">{classTitle}</div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-400">
              {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Main content area: video grid + chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Participant Grid */}
        <div className="flex-1 min-h-0 p-4">
          {videoTracks.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500 text-sm">No one has their camera on yet</p>
            </div>
          ) : (
            <div
              className={`grid h-full gap-2 ${
                videoTracks.length <= 1
                  ? "grid-cols-1"
                  : videoTracks.length <= 4
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {videoTracks.map((trackRef) => (
                <div
                  key={trackRef.participant.identity + trackRef.source}
                  className={`relative rounded-lg border ${
                    trackRef.participant.isLocal ? "border-blue-500/30" : "border-gray-700"
                  } bg-gray-800 overflow-hidden min-h-0`}
                >
                  <VideoTrack
                    trackRef={trackRef}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                    {trackRef.participant.isLocal ? "You" : trackRef.participant.identity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat Panel */}
        {isChatOpen && (
          <div className="w-80 flex-shrink-0">
            <LiveKitChat
              onClose={toggleChat}
              isTeacher={isTeacher}
              handRaises={handRaises}
              chatMessages={chatMessages}
              setChatMessages={setChatMessages}
              sendAppMessage={sendAppMessage}
              setHandRaises={setHandRaises}
              localParticipant={localParticipant}
            />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <LiveKitControlBar
        onLeave={onLeave}
        onEndClass={onEndClass}
        onToggleChat={toggleChat}
        isChatOpen={isChatOpen}
        unreadCount={unreadCount}
        isTeacher={isTeacher}
        hasMediaPermission={hasMediaPermission}
        setHasMediaPermission={setHasMediaPermission}
        sendAppMessage={sendAppMessage}
      />
    </div>
  );
}

export default function LiveKitClassRoom({
  token,
  serverUrl,
  onLeave,
  onEndClass,
  classTitle,
  isTeacher = false,
}: LiveKitClassRoomProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connectOptions={{ autoSubscribe: true }}
      onDisconnected={onLeave}
      style={{ height: "100%" }}
    >
      <CallInterface
        onLeave={onLeave}
        onEndClass={onEndClass}
        classTitle={classTitle}
        isTeacher={isTeacher}
      />
    </LiveKitRoom>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/LiveKitClassRoom.tsx && git commit -m "feat: add LiveKit live class room component"
```

---

## Task 8: Create LiveKit Control Bar

**Files:**
- Create: `components/LiveKitControlBar.tsx`

- [ ] **Step 1: Create the control bar**

Create `components/LiveKitControlBar.tsx`:

```typescript
"use client";

import { useCallback } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import {
  MicrophoneIcon,
  VideoCameraIcon,
  PhoneXMarkIcon,
  ArrowUpOnSquareIcon,
  Cog6ToothIcon,
  ChatBubbleLeftIcon,
  HandRaisedIcon,
  UserMinusIcon,
  StopCircleIcon,
} from "@heroicons/react/24/solid";
import {
  MicrophoneIcon as MicrophoneOffIcon,
  VideoCameraSlashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface LiveKitControlBarProps {
  onLeave: () => void;
  onEndClass?: () => void;
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  unreadCount?: number;
  isTeacher?: boolean;
  hasMediaPermission?: boolean;
  setHasMediaPermission?: (v: boolean) => void;
  sendAppMessage?: (data: any, destinationIdentities?: string[]) => void;
}

export default function LiveKitControlBar({
  onLeave,
  onEndClass,
  onToggleChat,
  isChatOpen,
  unreadCount = 0,
  isTeacher = false,
  hasMediaPermission = true,
  setHasMediaPermission,
  sendAppMessage,
}: LiveKitControlBarProps) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();

  const canSend = isTeacher || hasMediaPermission;

  const toggleAudio = useCallback(() => {
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  const toggleVideo = useCallback(() => {
    localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [localParticipant, isCameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  }, [localParticipant, isScreenShareEnabled]);

  const handleLeave = useCallback(async () => {
    room.disconnect();
    onLeave();
  }, [room, onLeave]);

  const requestParticipation = useCallback(() => {
    if (!sendAppMessage) return;
    sendAppMessage({
      type: "hand-raise",
      sender: localParticipant.identity,
      participantIdentity: localParticipant.identity,
    });
  }, [localParticipant, sendAppMessage]);

  const stepDown = useCallback(() => {
    if (!sendAppMessage) return;
    localParticipant.setMicrophoneEnabled(false);
    localParticipant.setCameraEnabled(false);
    setHasMediaPermission?.(false);
    sendAppMessage({
      type: "hand-lowered",
      participantIdentity: localParticipant.identity,
    });
  }, [localParticipant, sendAppMessage, setHasMediaPermission]);

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
      <div className="flex items-center justify-center gap-3">
        {canSend ? (
          <>
            {/* Mic */}
            <Button
              onClick={toggleAudio}
              size="lg"
              variant={!isMicrophoneEnabled ? "destructive" : "default"}
              className={`rounded-full w-14 h-14 ${
                !isMicrophoneEnabled ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={!isMicrophoneEnabled ? "Unmute" : "Mute"}
            >
              {!isMicrophoneEnabled ? <MicrophoneOffIcon className="h-6 w-6" /> : <MicrophoneIcon className="h-6 w-6" />}
            </Button>

            {/* Camera */}
            <Button
              onClick={toggleVideo}
              size="lg"
              variant={!isCameraEnabled ? "destructive" : "default"}
              className={`rounded-full w-14 h-14 ${
                !isCameraEnabled ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={!isCameraEnabled ? "Turn on camera" : "Turn off camera"}
            >
              {!isCameraEnabled ? <VideoCameraSlashIcon className="h-6 w-6" /> : <VideoCameraIcon className="h-6 w-6" />}
            </Button>

            {/* Screen Share */}
            <Button
              onClick={toggleScreenShare}
              size="lg"
              variant="default"
              className={`rounded-full w-14 h-14 ${
                isScreenShareEnabled ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title={isScreenShareEnabled ? "Stop sharing" : "Share screen"}
            >
              <ArrowUpOnSquareIcon className="h-6 w-6" />
            </Button>

            {/* Step down for approved students */}
            {!isTeacher && hasMediaPermission && (
              <Button
                onClick={stepDown}
                size="lg"
                variant="default"
                className="rounded-full h-14 px-4 bg-gray-700 hover:bg-gray-600 gap-2"
                title="Step down"
              >
                <UserMinusIcon className="h-5 w-5" />
                <span className="text-xs">Step Down</span>
              </Button>
            )}
          </>
        ) : (
          <Button
            onClick={requestParticipation}
            size="lg"
            variant="default"
            className="rounded-full px-6 h-14 bg-yellow-500 hover:bg-yellow-600 text-black font-medium gap-2"
            title="Raise hand to request mic/camera"
          >
            <HandRaisedIcon className="h-6 w-6" />
            <span className="text-sm">Raise Hand</span>
          </Button>
        )}

        <div className="mx-4 h-10 w-px bg-gray-700"></div>

        {/* Chat */}
        {onToggleChat && (
          <Button
            onClick={onToggleChat}
            size="lg"
            variant="default"
            className={`rounded-full w-14 h-14 relative ${
              isChatOpen ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-700 hover:bg-gray-600"
            }`}
            title={isChatOpen ? "Close chat" : "Open chat"}
          >
            <ChatBubbleLeftIcon className="h-6 w-6" />
            {!isChatOpen && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        )}

        {/* Settings */}
        <Button
          size="lg"
          variant="default"
          className="rounded-full w-14 h-14 bg-gray-700 hover:bg-gray-600"
          title="Settings"
        >
          <Cog6ToothIcon className="h-6 w-6" />
        </Button>

        {/* End Class (teacher only) */}
        {isTeacher && onEndClass && (
          <Button
            onClick={onEndClass}
            size="lg"
            variant="destructive"
            className="rounded-full h-14 px-4 bg-orange-600 hover:bg-orange-700 gap-2"
            title="End class for everyone"
          >
            <StopCircleIcon className="h-5 w-5" />
            <span className="text-xs">End Class</span>
          </Button>
        )}

        {/* Leave */}
        <Button
          onClick={handleLeave}
          size="lg"
          variant="destructive"
          className="rounded-full w-14 h-14 bg-red-600 hover:bg-red-700"
          title="Leave class"
        >
          <PhoneXMarkIcon className="h-6 w-6" />
        </Button>
      </div>

      {/* Labels */}
      <div className="flex items-center justify-center gap-3 mt-2">
        {canSend ? (
          <>
            <span className="text-xs text-gray-400 w-14 text-center">{!isMicrophoneEnabled ? "Unmute" : "Mute"}</span>
            <span className="text-xs text-gray-400 w-14 text-center">{!isCameraEnabled ? "Start" : "Stop"} Video</span>
            <span className="text-xs text-gray-400 w-14 text-center">{isScreenShareEnabled ? "Stop" : "Share"}</span>
            {!isTeacher && hasMediaPermission && (
              <span className="text-xs text-gray-400 text-center">Step Down</span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400 text-center">Request to speak</span>
        )}
        <div className="mx-4 w-px"></div>
        {onToggleChat && <span className="text-xs text-gray-400 w-14 text-center">Chat</span>}
        <span className="text-xs text-gray-400 w-14 text-center">Settings</span>
        {isTeacher && onEndClass && <span className="text-xs text-orange-400 text-center">End Class</span>}
        <span className="text-xs text-gray-400 w-14 text-center text-red-400">Leave</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/LiveKitControlBar.tsx && git commit -m "feat: add LiveKit control bar component"
```

---

## Task 9: Create LiveKit Chat Component

**Files:**
- Create: `components/LiveKitChat.tsx`

- [ ] **Step 1: Create the chat component**

Create `components/LiveKitChat.tsx`:

```typescript
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { LocalParticipant } from "livekit-client";
import { PaperAirplaneIcon, XMarkIcon, HandRaisedIcon, CheckIcon, XCircleIcon, UserMinusIcon } from "@heroicons/react/24/solid";
import type { HandRaise } from "./LiveKitClassRoom";

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  type?: "chat" | "system";
  isLocal?: boolean;
}

interface LiveKitChatProps {
  onClose: () => void;
  isTeacher?: boolean;
  handRaises?: HandRaise[];
  chatMessages?: ChatMessage[];
  setChatMessages?: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void;
  sendAppMessage?: (data: any, destinationIdentities?: string[]) => void;
  setHandRaises?: (fn: (prev: HandRaise[]) => HandRaise[]) => void;
  localParticipant: LocalParticipant;
}

export default function LiveKitChat({
  onClose,
  isTeacher = false,
  handRaises = [],
  chatMessages = [],
  setChatMessages,
  sendAppMessage,
  setHandRaises,
  localParticipant,
}: LiveKitChatProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !sendAppMessage) return;

    const senderName = localParticipant.identity || "You";
    const timestamp = Date.now();

    sendAppMessage({ type: "chat", text, senderName, timestamp });

    setChatMessages?.((prev) => [
      ...prev,
      {
        id: `local-${timestamp}`,
        sender: senderName,
        text,
        timestamp: new Date(timestamp),
        type: "chat",
        isLocal: true,
      },
    ]);
    setInputText("");
  }, [inputText, localParticipant, sendAppMessage, setChatMessages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAllow = useCallback(
    (raise: HandRaise) => {
      if (!sendAppMessage) return;
      sendAppMessage({ type: "hand-approved" }, [raise.participantIdentity]);
      setHandRaises?.((prev) => prev.filter((r) => r.participantIdentity !== raise.participantIdentity));

      setChatMessages?.((prev) => [
        ...prev,
        {
          id: `system-allow-${Date.now()}`,
          sender: "System",
          text: `${raise.userName} was granted mic/camera access`,
          timestamp: new Date(),
          type: "system",
        },
      ]);
    },
    [sendAppMessage, setHandRaises, setChatMessages]
  );

  const handleDeny = useCallback(
    (raise: HandRaise) => {
      if (!sendAppMessage) return;
      sendAppMessage({ type: "hand-denied" }, [raise.participantIdentity]);
      setHandRaises?.((prev) => prev.filter((r) => r.participantIdentity !== raise.participantIdentity));

      setChatMessages?.((prev) => [
        ...prev,
        {
          id: `system-deny-${Date.now()}`,
          sender: "System",
          text: `${raise.userName}'s request was denied`,
          timestamp: new Date(),
          type: "system",
        },
      ]);
    },
    [sendAppMessage, setHandRaises, setChatMessages]
  );

  const handleRevoke = useCallback(
    (raise: HandRaise) => {
      if (!sendAppMessage) return;
      sendAppMessage({ type: "hand-revoked" }, [raise.participantIdentity]);
      setHandRaises?.((prev) => prev.filter((r) => r.participantIdentity !== raise.participantIdentity));

      setChatMessages?.((prev) => [
        ...prev,
        {
          id: `system-revoke-${Date.now()}`,
          sender: "System",
          text: `${raise.userName}'s access was revoked`,
          timestamp: new Date(),
          type: "system",
        },
      ]);
    },
    [sendAppMessage, setHandRaises, setChatMessages]
  );

  return (
    <div className="flex flex-col h-full bg-gray-850 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h3 className="text-white font-medium text-sm">Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Teacher: Hand raises */}
      {isTeacher && handRaises.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 space-y-2">
          <div className="text-xs font-medium text-yellow-400 flex items-center gap-1">
            <HandRaisedIcon className="h-3.5 w-3.5" />
            Raised Hands ({handRaises.length})
          </div>
          {handRaises.map((raise) => (
            <div
              key={raise.participantIdentity}
              className="flex items-center justify-between gap-2 bg-gray-700/50 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-gray-200 truncate">{raise.userName}</span>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleAllow(raise)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors"
                  title="Allow"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDeny(raise)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
                  title="Deny"
                >
                  <XCircleIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">
            No messages yet. Say hello!
          </p>
        )}
        {chatMessages.map((msg) => {
          if (msg.type === "system") {
            return (
              <div key={msg.id} className="flex justify-center">
                <span className="text-xs text-gray-500 italic">{msg.text}</span>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex flex-col ${msg.isLocal ? "items-end" : "items-start"}`}>
              <span className="text-xs text-gray-500 mb-1">{msg.sender}</span>
              <div
                className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                  msg.isLocal ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/LiveKitChat.tsx && git commit -m "feat: add LiveKit chat component with hand-raise support"
```

---

## Task 10: Update LiveClassVideoPage to Use LiveKit

**Files:**
- Modify: `components/LiveClassVideoPage.tsx`

- [ ] **Step 1: Update the component**

Replace the contents of `components/LiveClassVideoPage.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ClockIcon, UsersIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
import { toast } from "react-hot-toast";

const LiveKitClassRoom = dynamic(() => import("./LiveKitClassRoom"), { ssr: false });

interface LiveClass {
  id: string;
  title: string;
  description?: string;
  scheduled_start_time: string;
  duration_minutes: number;
  teacher_name: string;
  teacher_avatar_url?: string;
  community_name: string;
  community_slug: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

interface LiveClassVideoPageProps {
  classId: string;
  liveClass: LiveClass;
}

interface VideoToken {
  token: string;
  serverUrl: string;
  isTeacher: boolean;
}

export default function LiveClassVideoPage({ classId, liveClass }: LiveClassVideoPageProps) {
  const router = useRouter();
  const [videoToken, setVideoToken] = useState<VideoToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasJoined, setHasJoined] = useState(false);

  const startTime = typeof liveClass.scheduled_start_time === 'string'
    ? parseISO(liveClass.scheduled_start_time)
    : new Date(liveClass.scheduled_start_time);
  const endTime = new Date(startTime.getTime() + liveClass.duration_minutes * 60000);
  const now = new Date();

  const canJoin = liveClass.is_currently_active || liveClass.is_starting_soon;
  const hasEnded = liveClass.status === 'ended' || now > endTime;
  const isCancelled = liveClass.status === 'cancelled';

  const fetchVideoToken = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/live-classes/${classId}/video-token`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get video access");
      }

      const tokenData = await response.json();
      setVideoToken(tokenData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to join video session";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClick = () => {
    setHasJoined(true);
    fetchVideoToken();
  };

  const handleLeave = () => {
    router.push(`/${liveClass.community_slug}`);
  };

  const handleEndClass = async () => {
    if (!confirm("End this class for everyone? This will stop the recording if active.")) return;
    try {
      const response = await fetch(`/api/community/${liveClass.community_slug}/live-classes/${classId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
      });
      if (!response.ok) {
        throw new Error("Failed to end class");
      }
      toast.success("Class ended successfully");
      router.push(`/${liveClass.community_slug}`);
    } catch (err) {
      toast.error("Failed to end class");
      console.error("Error ending class:", err);
    }
  };

  const getStatusDisplay = () => {
    if (isCancelled) {
      return (
        <div className="text-center py-12">
          <Badge variant="secondary" className="mb-4">Cancelled</Badge>
          <h3 className="text-lg font-medium text-gray-900 mb-2">This live class has been cancelled</h3>
          <p className="text-gray-600">Please check the calendar for rescheduled classes or contact the teacher.</p>
        </div>
      );
    }

    if (hasEnded) {
      return (
        <div className="text-center py-12">
          <Badge variant="secondary" className="mb-4">Ended</Badge>
          <h3 className="text-lg font-medium text-gray-900 mb-2">This live class has ended</h3>
          <p className="text-gray-600">Thank you for participating! Check the calendar for upcoming classes.</p>
        </div>
      );
    }

    if (!canJoin) {
      const timeUntilStart = startTime.getTime() - now.getTime();
      const minutesUntilStart = Math.ceil(timeUntilStart / (1000 * 60));

      return (
        <div className="text-center py-12">
          <Badge variant="outline" className="mb-4">Scheduled</Badge>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Class starts in {minutesUntilStart} minutes</h3>
          <p className="text-gray-600 mb-6">You'll be able to join 15 minutes before the class begins.</p>
          <Button disabled className="flex items-center space-x-2">
            <VideoCameraIcon className="h-4 w-4" />
            <span>Join Class</span>
          </Button>
        </div>
      );
    }

    return null;
  };

  const statusDisplay = getStatusDisplay();

  if (statusDisplay) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">{liveClass.title}</CardTitle>
            </CardHeader>
            <CardContent>{statusDisplay}</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {!hasJoined || !videoToken ? (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                {liveClass.is_currently_active ? (
                  <Badge variant="destructive" className="bg-red-500">LIVE NOW</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-yellow-500 text-white">Starting Soon</Badge>
                )}
              </div>
              <CardTitle className="text-2xl mb-2">{liveClass.title}</CardTitle>
              <div className="flex items-center justify-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                </div>
                <div className="flex items-center">
                  <UsersIcon className="h-4 w-4 mr-1" />
                  {liveClass.duration_minutes} minutes
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {liveClass.description && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">About this class</h3>
                  <p className="text-gray-600">{liveClass.description}</p>
                </div>
              )}
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Instructor</h3>
                <div className="flex items-center">
                  {liveClass.teacher_avatar_url && (
                    <img src={liveClass.teacher_avatar_url} alt={liveClass.teacher_name} className="h-10 w-10 rounded-full mr-3" />
                  )}
                  <span className="text-gray-900">{liveClass.teacher_name}</span>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Community</h3>
                <p className="text-gray-600">{liveClass.community_name}</p>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              <div className="flex justify-center pt-4">
                <Button onClick={handleJoinClick} disabled={loading} size="lg" className="flex items-center space-x-2">
                  <VideoCameraIcon className="h-5 w-5" />
                  <span>{loading ? "Joining..." : "Join Live Class"}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="h-screen">
          <LiveKitClassRoom
            token={videoToken.token}
            serverUrl={videoToken.serverUrl}
            onLeave={handleLeave}
            onEndClass={videoToken.isTeacher ? handleEndClass : undefined}
            classTitle={liveClass.title}
            isTeacher={videoToken.isTeacher}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/debian/apps/dance-hub && bun run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add components/LiveClassVideoPage.tsx && git commit -m "feat: update LiveClassVideoPage to use LiveKit"
```

---

## Task 11: Build and Test Phase 1

- [ ] **Step 1: Full build check**

```bash
cd /home/debian/apps/dance-hub && bun run build
```

Fix any compilation errors.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve Phase 1 build issues"
```

---

## Task 12: Database Migration — Add `livekit_room_name` to `lesson_bookings`

**Files:**
- Run SQL on preprod Neon branch only

- [ ] **Step 1: Run the migration on preprod**

```sql
ALTER TABLE lesson_bookings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
```

- [ ] **Step 2: Commit a migration file**

Create `supabase/migrations/20260401_add_livekit_room_name_bookings.sql`:

```sql
-- Stream-Hub integration: add LiveKit room tracking to lesson_bookings
ALTER TABLE lesson_bookings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
```

```bash
git add supabase/migrations/20260401_add_livekit_room_name_bookings.sql && git commit -m "feat: add livekit_room_name column to lesson_bookings (preprod)"
```

---

## Task 13: Update Private Lesson Video Token Route

**Files:**
- Modify: `app/api/bookings/[bookingId]/video-token/route.ts`

- [ ] **Step 1: Replace the route implementation**

Replace the contents of `app/api/bookings/[bookingId]/video-token/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { createRoom, generateToken } from "@/lib/stream-hub";

interface BookingWithLesson {
  id: string;
  student_id: string;
  payment_status: string;
  livekit_room_name: string | null;
  scheduled_at: string | null;
  lesson_title: string;
  lesson_duration_minutes: number;
  community_created_by: string;
}

export async function POST(
  request: Request,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { bookingId } = params;

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = session.user;

    const booking = await queryOne<BookingWithLesson>`
      SELECT
        lb.id,
        lb.student_id,
        lb.payment_status,
        lb.livekit_room_name,
        lb.scheduled_at,
        pl.title as lesson_title,
        pl.duration_minutes as lesson_duration_minutes,
        c.created_by as community_created_by
      FROM lesson_bookings lb
      INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      INNER JOIN communities c ON c.id = pl.community_id
      WHERE lb.id = ${bookingId}
    `;

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const isStudent = booking.student_id === user.id;
    const isTeacher = booking.community_created_by === user.id;

    if (!isStudent && !isTeacher) {
      return NextResponse.json({ error: "Not authorized to access this booking" }, { status: 403 });
    }

    if (booking.payment_status !== "succeeded") {
      return NextResponse.json({ error: "Payment must be completed before generating video tokens" }, { status: 400 });
    }

    // Create room if needed (idempotent)
    const roomName = `booking-${bookingId}`;
    if (!booking.livekit_room_name) {
      await createRoom(roomName, 2);
      await sql`
        UPDATE lesson_bookings SET livekit_room_name = ${roomName}
        WHERE id = ${bookingId}
      `;
    }

    // Generate token
    const role = isTeacher ? "admin" : "participant";
    const userName = isTeacher ? "Teacher" : "Student";
    const tokenData = await generateToken(booking.livekit_room_name || roomName, userName, role);

    return NextResponse.json({
      token: tokenData.token,
      serverUrl: tokenData.serverUrl,
      lesson_title: booking.lesson_title,
      duration_minutes: booking.lesson_duration_minutes,
      is_teacher: isTeacher,
    });
  } catch (error) {
    console.error("Error in POST /api/bookings/[bookingId]/video-token:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/bookings/\[bookingId\]/video-token/route.ts && git commit -m "feat: swap private lesson video-token route to Stream-Hub"
```

---

## Task 14: Create LiveKit Video Call Component for Private Lessons

**Files:**
- Create: `components/LiveKitVideoCall.tsx`

- [ ] **Step 1: Create the component**

Create `components/LiveKitVideoCall.tsx`:

```typescript
"use client";

import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";

interface LiveKitVideoCallProps {
  token: string;
  serverUrl: string;
  onDisconnected?: () => void;
}

export default function LiveKitVideoCall({
  token,
  serverUrl,
  onDisconnected,
}: LiveKitVideoCallProps) {
  return (
    <div className="w-full h-full min-h-[600px] bg-gray-900 rounded-lg overflow-hidden">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connectOptions={{ autoSubscribe: true }}
        onDisconnected={onDisconnected}
        style={{ height: "100%" }}
        data-lk-theme="default"
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/LiveKitVideoCall.tsx && git commit -m "feat: add LiveKit video call component for private lessons"
```

---

## Task 15: Update VideoSessionPage to Use LiveKit

**Files:**
- Modify: `components/VideoSessionPage.tsx`

- [ ] **Step 1: Update VideoCallWithTokens and VideoSessionPage**

In `components/VideoSessionPage.tsx`, make these changes:

1. Replace the import of `UltraSimpleDaily` with `LiveKitVideoCall`:

Replace:
```typescript
import UltraSimpleDaily from "@/components/UltraSimpleDaily";
```
With:
```typescript
import dynamic from "next/dynamic";
const LiveKitVideoCall = dynamic(() => import("@/components/LiveKitVideoCall"), { ssr: false });
```

2. Update the `VideoCallWithTokens` state and token fetching to use the new shape:

Replace the `videoData` state type from `{ token: string; room_url: string }` to `{ token: string; serverUrl: string }`.

Update the `useEffect` that checks existing tokens — remove the Daily token check since tokens are now always fetched fresh.

Update `fetchVideoTokens` to use the new response shape (`serverUrl` instead of `room_url`).

Replace the `UltraSimpleDaily` render with `LiveKitVideoCall`.

3. Update `canJoin` logic — replace `booking.daily_room_name` references with `booking.livekit_room_name`.

4. Update the "Video room is being set up" message condition similarly.

The key changes are:
- `videoData` shape: `{ token, serverUrl }` instead of `{ token, room_url }`
- Render: `<LiveKitVideoCall token={videoData.token} serverUrl={videoData.serverUrl} />` instead of `<UltraSimpleDaily roomUrl={videoData.room_url} token={videoData.token} />`
- Join condition: `booking.livekit_room_name` instead of `booking.daily_room_name`

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/debian/apps/dance-hub && bun run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add components/VideoSessionPage.tsx && git commit -m "feat: update VideoSessionPage to use LiveKit"
```

---

## Task 16: Full Build and Final Verification

- [ ] **Step 1: Full build**

```bash
cd /home/debian/apps/dance-hub && bun run build
```

Fix any remaining compilation errors.

- [ ] **Step 2: Lint check**

```bash
cd /home/debian/apps/dance-hub && bun lint
```

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A && git commit -m "fix: resolve remaining build issues"
```

- [ ] **Step 4: Push to remote**

```bash
git push
```

---

## Task 17: Deploy to Preprod and Test

- [ ] **Step 1: Set preprod environment variables**

On the preprod server, update `.env` with:
- `DATABASE_URL` = preprod Neon connection string
- `STREAM_HUB_URL=http://localhost:3060`
- `STREAM_HUB_API_KEY=<the generated key>`
- `NEXT_PUBLIC_LIVEKIT_URL=<public LiveKit WSS URL>`

- [ ] **Step 2: Deploy the feature branch to preprod**

```bash
# On preprod server
cd /home/debian/apps/dance-hub
git fetch origin
git checkout feature/stream-hub-integration
bun install
bun run build
pm2 restart dance-hub
```

- [ ] **Step 3: Manual testing checklist**

Test on `preprod.dance-hub.io`:

1. **Live class creation**: Create a new live class as a teacher
2. **Teacher join**: Join as teacher — verify LiveKit room connects, camera/mic work
3. **Student join**: Join as student in another browser — verify they see teacher video
4. **Chat**: Send messages between teacher and student
5. **Hand raise**: Student raises hand, teacher approves, student can now unmute
6. **Recording**: Verify recording starts when teacher joins (if enabled)
7. **End class**: Teacher ends class — verify recording callback creates replay lesson
8. **Private lesson**: Book a lesson, join as both teacher and student — verify 1-on-1 video works

- [ ] **Step 4: Commit test results/fixes**

```bash
git add -A && git commit -m "fix: preprod testing fixes"
git push
```
