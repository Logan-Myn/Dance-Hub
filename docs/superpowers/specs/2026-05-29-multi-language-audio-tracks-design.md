# Multi-language audio tracks for videos

**Date:** 2026-05-29
**Status:** Design approved, pending spec review
**Branch:** `worktree-feat+multi-language-audio` (deploy target: preprod)

## Goal

Let a teacher record a video once (with their spoken language baked in), then later
attach a **voice-only audio recording in another language** to the same video. Viewers
pick their language from a switcher in the player. This avoids re-recording or
re-rendering the whole video for each language.

Motivating request: a teacher currently produces each instructional video twice (English
and Spanish). She wants to record the video once in one language and add the second
language as audio only.

## Approach

Use Mux's native **alternate audio tracks** feature. After a video asset is `ready`, we
add an audio track to it via one API call. Mux folds the track into the existing HLS
playback URL, and the player we already use (`@mux/mux-player-react`) renders a built-in
audio-track switcher. No new player and no second video asset.

We rejected the alternative of uploading a complete second video per language and
building a custom toggle: it forces the teacher to produce full videos in each language
(the exact work she is trying to avoid), doubles storage/encoding, and resets playback
position on switch. We keep it in mind only as a per-video fallback if a particular clip's
audio cannot be synced; it is not part of this build.

## Scope

**In scope** (all share one pipeline: upload to a Mux asset, store `asset_id` +
`playback_id`, play through our player):
- Course lesson videos.
- Recorded **replays of live classes** (already become Mux assets via the recording
  webhook, so they ride this feature unchanged).
- The teacher video on a community's **About page**.

**Out of scope:**
- Live private lessons and live classes themselves. A live stream has no track to swap;
  only their recordings qualify.
- Auto-selecting a track by the viewer's browser locale (possible v2 enhancement).
- Auto-translation or auto-dubbing. The teacher supplies the audio file.

## Constraints the teacher must respect (product note, not code)

- The added audio must match the video's **length and timing**. Mux aligns the track from
  the start and does not re-sync; if the audio is shorter the tail is silent, if longer it
  is cut. Guidance in the UI: record the translation while watching the video.
- The teacher's videos are **mostly voice** (little/no baked-in music), so a voice-only
  track is a clean swap. If a video had music baked into its audio, the alternate track
  would need that music mixed in too, or switching languages would drop it.

## Architecture

### End-to-end flow

1. In the manage UI for an existing, `ready` video, the teacher clicks **Add language**,
   picks a language, and selects a voice-only audio file (M4A / MP3 / WAV).
2. The browser requests a **presigned upload URL** for Backblaze B2 (existing
   `lib/storage.ts`) and uploads the file directly to B2.
3. Our API calls Mux `POST /video/assets/{assetId}/tracks` with
   `{ type: "audio", language_code, name, url: <signed B2 download URL> }`.
4. We insert an `audio_tracks` row with `status = 'preparing'` and the returned
   `mux_track_id`; the UI shows "Processing".
5. Mux finishes processing and fires `video.asset.track.ready`; our existing Mux webhook
   flips the row to `ready`. (`video.asset.track.errored` -> `errored`.)
6. Viewers now see the language in the player's audio menu (e.g. English / Espanol).

### Why B2 and not a Mux upload

Mux's add-track endpoint takes a **URL**, not a direct upload. We already have B2 with
presigned upload + signed download URLs (`lib/storage.ts`). We hand Mux a signed download
URL with an expiry comfortably longer than processing (e.g. 24h). Mux fetches the file
once during processing. No public bucket required. We keep the B2 object until the track
is `ready` (for retry), then it is safe to delete; small files, so retention is cheap if
we defer cleanup.

### Data model

New table, keyed by **`mux_asset_id`** so it is surface-agnostic (works for lessons and
the About-page video alike, neither of which is a natural foreign key for both):

```
audio_tracks (
  id            uuid primary key default gen_random_uuid(),
  mux_asset_id  text not null,
  mux_track_id  text,                 -- null until Mux returns it
  language_code text not null,        -- BCP-47, e.g. 'es'
  name          text not null,        -- display label, e.g. 'Espanol'
  status        text not null,        -- 'preparing' | 'ready' | 'errored'
  b2_key        text,                 -- uploaded audio object, for cleanup/retry
  created_by    text not null,        -- user id
  created_at    timestamptz not null default now(),
  unique (mux_asset_id, language_code)  -- one track per language per video
)
```

Playback needs nothing from this table; Mux Player reads tracks from the playback URL. The
table exists for the authoring UI: list languages, show status, prevent duplicates, and
support delete.

### The About-page asset-id wrinkle

The About-page video section stores only the **playback ID** (`VideoSection.tsx` saves
`videoId: readyAsset.playbackId`), not the asset ID. Mux's add-track endpoint needs the
**asset** ID. We add a helper `resolveAssetIdFromPlaybackId(playbackId)` that calls Mux
`GET /video/v1/playback-ids/{id}` (returns the owning asset id) and, for the About video,
persist the resolved `assetId` back into the section content so we only resolve once.
Lessons are unaffected; they already store `video_asset_id`.

### New / changed code

**`lib/mux.ts`** (helpers):
- `addAudioTrack(assetId, { url, languageCode, name })` -> creates the Mux track, returns
  `{ trackId }`.
- `deleteAudioTrack(assetId, trackId)`.
- `resolveAssetIdFromPlaybackId(playbackId)`.
- Optional: `setPrimaryTrackLanguage(assetId, languageCode, name)` so the original baked-in
  track is labeled (so the menu reads a language name, not "Audio 1"). If updating an
  existing primary track proves awkward, fall back to setting the original language only at
  the data level and labeling it in our own UI.

**`lib/storage.ts`**: reuse existing presign helpers; add an audio-specific key prefix
(e.g. `audio-tracks/{assetId}/{uuid}.{ext}`).

**API routes** (auth + community creator/admin checks reused from
`app/api/mux/upload-url/route.ts`):
- `POST /api/mux/audio-upload-url` -> presigned B2 upload URL for the audio file.
- `POST /api/mux/assets/[assetId]/audio-tracks` -> create the track + insert row.
- `GET  /api/mux/assets/[assetId]/audio-tracks` -> list tracks + status (reconciles with
  Mux on read as a fallback to the webhook).
- `DELETE /api/mux/assets/[assetId]/audio-tracks/[trackId]` -> delete from Mux, delete row,
  delete B2 object.

**Webhook** (`app/api/webhooks/mux/route.ts`): add cases for
`video.asset.track.ready` and `video.asset.track.errored`, matching on asset id + track id
and updating `audio_tracks.status`.

**Migration**: add the `audio_tracks` table.

### UI

A **Languages** panel shown on the lesson editor and the About video section, only once
the underlying video is `ready`:
- Lists the **Original** track (label = teacher-selected original language; default
  English) plus each added language with a status badge (Processing / Ready / Failed).
- **Add language** button opens a modal: a language dropdown (curated BCP-47 list,
  extensible), a one-line note ("Voice only. Record it while watching the video so the
  timing lines up."), and a file picker for M4A / MP3 / WAV. On submit: upload progress ->
  "Processing" -> "Ready".
- A remove control per added language.

Playback: no change beyond confirming the player's audio menu appears (it does by
default for assets with multiple audio tracks). Track labels come from the `name` we set,
so they read as language names.

**UI copy rules** (per project conventions): no em dashes in user-facing strings; never
name the video vendor or storage provider in user-facing copy (describe the action, e.g.
"Add language", "Processing", not vendor names).

### Defaults (approved)

1. Languages: curated dropdown, extensible; teacher also labels the original track.
2. Audio hosting: signed B2 URL; keep file until track is `ready`.
3. Default track on play: the original. Locale-based default deferred to v2.
4. Permissions: reuse existing community-creator/admin checks.

## Error handling and edge cases

- **Video not ready**: gate the Add-language UI on the asset being `ready`.
- **Duplicate language**: `unique (mux_asset_id, language_code)` + a friendly UI error.
- **Track processing fails**: webhook sets `errored`; UI shows Failed with a retry (re-uses
  the stored `b2_key` or prompts re-upload).
- **Status never arrives via webhook**: `GET` route reconciles by querying Mux on read.
- **Video deleted**: deleting the Mux asset removes its tracks on Mux's side; we also
  delete our `audio_tracks` rows and B2 objects for that `mux_asset_id`. Lesson delete
  already deletes the Mux asset (`lessons/[lessonId]` DELETE) — extend it to clean our rows.
- **Unauthorized**: all routes require a session and creator/admin on the owning community.

## Testing strategy

- **Unit**: `lib/mux.ts` helpers with the Mux API mocked (`addAudioTrack`,
  `deleteAudioTrack`, `resolveAssetIdFromPlaybackId`); B2 key construction.
- **Integration / route**: create-track route inserts a `preparing` row and calls Mux;
  webhook handler flips status on `video.asset.track.ready`; list route reconciles;
  duplicate language rejected.
- **Manual (preprod)**: upload a Spanish voice file to a ready lesson; confirm the row goes
  Processing -> Ready; open the lesson and confirm the player shows English / Espanol and
  switching swaps the audio while video keeps playing. Repeat for an About-page video
  (exercises the playback-id -> asset-id resolution).

## Cost note

Each alternate audio track adds a small amount of Mux encoding/storage (audio only, so
minimal) and a small B2 object. No new vendor or plan required; preprod and prod already
have Mux and B2 credentials.

## Open questions

None blocking. The main thing to validate with the teacher is the timing/length
expectation for the recorded audio, which is a usage note rather than a code decision.
