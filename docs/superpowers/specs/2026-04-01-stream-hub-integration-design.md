# Stream-Hub Integration: Replace Daily.co with LiveKit

**Date:** 2026-04-01
**Branch:** `feature/stream-hub-integration`
**Test environment:** preprod.dance-hub.io
**Approach:** Two-phase migration (Approach B)

---

## Context

Dance-Hub currently uses Daily.co for all video (live classes + private lessons) and Mux for recording playback. Stream-Hub is our self-hosted LiveKit wrapper service at `/home/debian/sandbox/stream-hub/` that provides room management, token generation, and a recording pipeline (LiveKit egress -> Mux upload -> callback).

Stream-Hub is already running in production for Expats-Estonia. Dance-Hub will be its second consumer.

**Goal:** Replace Daily.co entirely with Stream-Hub/LiveKit across both live classes and private lessons.

---

## Phase 1: Live Classes

### 1.1 Stream-Hub Client (`lib/stream-hub.ts`)

Server-side HTTP client wrapping Stream-Hub's REST API. All calls use `x-api-key` header authentication.

```
createRoom(name, maxParticipants)     -> POST   /rooms
deleteRoom(name)                      -> DELETE  /rooms/{name}
getRoom(name)                         -> GET     /rooms/{name}
generateToken(roomName, identity, role) -> POST  /rooms/{name}/tokens
startRecording(roomName, callbackUrl) -> POST    /rooms/{name}/recordings/start
stopRecording(roomName)               -> POST    /rooms/{name}/recordings/stop
getRecordingStatus(roomName)          -> GET     /rooms/{name}/recordings/status
```

### 1.2 Environment Variables

**Add to Dance-Hub `.env`:**
```
STREAM_HUB_URL=http://localhost:3060
STREAM_HUB_API_KEY=<generated with openssl rand -hex 32>
NEXT_PUBLIC_LIVEKIT_URL=<public WSS URL for client-side LiveKit connection>
```

**Add to Stream-Hub `.env`:**
```
API_KEY_DANCE_HUB=<same key as STREAM_HUB_API_KEY above>
```

### 1.3 Database Changes (Neon PostgreSQL, preprod only)

**`live_classes` table — additive migration:**
- Add: `livekit_room_name` (text, nullable)
- Keep all `daily_*` columns untouched (production stays working on `main`)

**`live_class_recordings` table:**
- Existing columns still used: `status`, `mux_asset_id`, `mux_playback_id`
- The `daily_recording_id` column becomes unused but is not dropped yet

### 1.4 Room & Token Flow

**`GET /api/live-classes/[classId]/video-token`** updated to:

1. Call `streamHub.createRoom(classId, 100)` — idempotent
2. Call `streamHub.generateToken(classId, userName, role)`:
   - Teacher -> role `"admin"` (full permissions including room admin)
   - Student -> role `"participant"` (publish + subscribe, no admin)
3. Save `livekit_room_name` to the `live_classes` row
4. If recording is enabled and teacher is joining: call `streamHub.startRecording(roomName, callbackUrl)` where `callbackUrl` = `${NEXT_PUBLIC_APP_URL}/api/webhooks/stream-hub`
5. Return `{ token, serverUrl }` to client

**Room cleanup on "End Class":**
- Call `streamHub.stopRecording(roomName)` then `streamHub.deleteRoom(roomName)`

### 1.5 Recording Pipeline

**Current (complex, 3 webhook handlers):**
```
Daily webhook (meeting.started) -> start recording
Daily webhook (recording.ready-to-download) -> upload to Mux
Mux webhook (video.asset.ready) -> create replay lesson
```

**New (simplified, 1 callback endpoint):**
```
Dance-Hub calls streamHub.startRecording(roomName, callbackUrl)
-> Stream-Hub handles: LiveKit egress -> local file -> Mux upload
-> Stream-Hub POSTs callback to Dance-Hub
-> Dance-Hub creates replay lesson
```

**New API route: `POST /api/webhooks/stream-hub`**

Receives callbacks from Stream-Hub:

- **`recording.ready`**: `{ event, roomName, muxPlaybackId, muxAssetId, durationSeconds }`
  - Creates "Live Class Replays" course in community (if missing)
  - Creates monthly chapter (e.g., "April 2026")
  - Creates replay lesson with Mux playback ID
  - Updates `live_class_recordings` row: status = `ready`, mux_playback_id, mux_asset_id

- **`recording.failed`**: `{ event, roomName, error }`
  - Updates recording status to `failed` with error message
  - Logs error

### 1.6 Client-Side Components

**New dependencies:**
```
livekit-client
@livekit/components-react
@livekit/components-styles
```

**Component mapping:**

| Current (Daily)           | New (LiveKit)                                  |
|---------------------------|------------------------------------------------|
| `DailyProvider`           | `LiveKitRoom`                                  |
| `DailyVideo`              | `ParticipantTile` / `VideoTrack`               |
| `DailyAudio`              | `RoomAudioRenderer`                            |
| `useParticipantIds()`     | `useParticipants()`                            |
| `useLocalParticipant()`   | `useLocalParticipant()`                        |
| `useScreenShare()`        | `useTracksBySource(Track.Source.ScreenShare)`   |

**Files:**

- **`components/LiveClassVideoPage.tsx`** — Lobby/state machine unchanged. The "active" state updated to use LiveKit token + serverUrl instead of Daily token.

- **`components/LiveKitClassRoom.tsx`** (new, replaces `CustomDailyRoom.tsx`)
  - Same layout: video grid, control bar, chat sidebar, hand raise
  - `LiveKitRoom` wrapper with `token` and `serverUrl` props
  - Controls via LiveKit hooks: `useTrackToggle` (mic/camera), `useDisconnectButton`
  - Chat via `useChat()` hook (LiveKit built-in data messages)
  - Hand raise via LiveKit data channel (`useDataChannel`)
  - Active speaker via `useIsSpeaking()` hook
  - Teacher "End Class" button — calls API to end class + stop recording

**What stays unchanged:**
- Lobby UI and join window logic (15 min early access)
- Class status display (scheduled, cancelled, ended)
- Teacher controls UX and layout
- Overall page structure

---

## Phase 2: Private Lessons

### 2.1 API Changes

**`GET /api/lesson-bookings/[id]/video-token`** updated to:

1. Call `streamHub.createRoom(bookingId, 2)` — max 2 participants
2. Call `streamHub.generateToken(bookingId, userName, role)`:
   - Teacher -> `"admin"`
   - Student -> `"participant"`
3. Save `livekit_room_name` to `lesson_bookings` row
4. Return `{ token, serverUrl }`

No recording for private lessons (deferred to future work).

### 2.2 Database Changes (preprod only)

**`lesson_bookings` table — additive migration:**
- Add: `livekit_room_name` (text, nullable)
- Keep all `daily_*` columns untouched

### 2.3 Client-Side Component

**`components/LiveKitVideoCall.tsx`** (new, replaces `DailyVideoCall.tsx`)
- Simple 1-on-1 video call, close to Expats-Estonia's `MeetingRoom` component
- `LiveKitRoom` + `VideoConference` + `RoomAudioRenderer`
- Controls: mic, camera, screen share, leave
- No chat, no hand raise, no recording controls

**`app/video-session/[bookingId]/page.tsx`** — updated to use new component and token format.

---

## Cleanup (after production cutover)

### Dependencies to Remove
- `@daily-co/daily-js`
- `@daily-co/daily-react`

### Files to Delete
- `lib/daily.ts`
- `lib/video-room-service.ts`
- `lib/mux.ts`
- `app/api/webhooks/daily/route.ts`
- `app/api/webhooks/mux/route.ts`
- `app/api/admin/fix-live-class-rooms/route.ts`
- `components/CustomDailyRoom.tsx`
- `components/DailyVideoCall.tsx`

### Env Vars to Remove from Dance-Hub
- `DAILY_API_KEY`, `DAILY_DOMAIN`, `DAILY_WEBHOOK_SECRET`
- `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`

### Database Cleanup Migration (production, later)
- Drop `daily_*` columns from `live_classes`
- Drop `daily_*` columns from `lesson_bookings`
- Drop `daily_recording_id` from `live_class_recordings`

### Deploy Requirements
- Nginx: ensure WebSocket upgrade headers (`Upgrade`, `Connection`) are configured (same pattern as Expats-Estonia's deploy)
- Verify `NEXT_PUBLIC_LIVEKIT_URL` points to public LiveKit WSS endpoint

---

## Reference

- **Stream-Hub codebase:** `/home/debian/sandbox/stream-hub/`
- **Expats-Estonia integration (working reference):** `/home/debian/apps/expats-estonia/`
  - API route: `src/app/api/meet/[slug]/route.ts`
  - LiveKit component: `src/components/meet/meeting-room.tsx`
- **Stream-Hub API auth:** `x-api-key` header, keys configured as `API_KEY_*` env vars
- **Stream-Hub callback payload:** `{ event: "recording.ready"|"recording.failed", roomName, muxPlaybackId?, muxAssetId?, durationSeconds?, error? }`
