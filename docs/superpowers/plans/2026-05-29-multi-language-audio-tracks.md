# Multi-language Audio Tracks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher attach voice-only audio tracks in other languages to an existing video, so viewers pick their language in the player.

**Architecture:** After a Mux video asset is `ready`, the teacher uploads a voice-only audio file to Backblaze B2 (existing `lib/storage.ts`); the server hands Mux a signed B2 URL via `POST /video/v1/assets/{id}/tracks`. Mux folds the track into the existing playback URL, and `@mux/mux-player-react` (already used everywhere) shows a built-in audio switcher. A small `audio_tracks` table keyed by `mux_asset_id` tracks language/status for the authoring UI; the existing Mux webhook flips status to `ready`, and a list endpoint reconciles status from Mux as the authoritative fallback.

**Tech Stack:** Next.js 16 App Router, TypeScript, `postgres` tagged-template (`lib/db.ts`), `@mux/mux-node` (we use raw `fetch` + Basic auth, mirroring `createAssetFromUrl`), `@aws-sdk/client-s3` against Backblaze B2, Jest (pure-function unit tests), `@mux/mux-player-react`.

**Conventions for every task:**
- Run commands from the worktree root: `/home/debian/apps/dance-hub/.claude/worktrees/feat+multi-language-audio`.
- Component files kebab-case where new; follow existing file's casing when editing.
- User-facing copy: no em dashes; never name the video/storage vendor in UI strings.
- Every commit message ends with this trailer (shown in Task 1; append it to every commit):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Baseline + `audio_tracks` migration

**Files:**
- Create: `supabase/migrations/2026-05-29_create_audio_tracks.sql`

- [ ] **Step 1: Verify clean test baseline**

Run: `bun test 2>&1 | tail -20`
Expected: existing suite passes (or note any pre-existing failures before proceeding).

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/2026-05-29_create_audio_tracks.sql`:

```sql
-- Alternate (per-language) audio tracks attached to a Mux video asset.
-- Keyed by mux_asset_id so it serves both course lessons (lessons.video_asset_id)
-- and About-page videos uniformly. Playback needs nothing from this table;
-- it backs the authoring UI (list languages, show status, prevent duplicates, delete).
CREATE TABLE IF NOT EXISTS audio_tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mux_asset_id  text NOT NULL,
  mux_track_id  text,                              -- null until Mux returns it
  language_code text NOT NULL,                     -- BCP-47, e.g. 'es'
  name          text NOT NULL,                     -- display label, e.g. 'Español'
  status        text NOT NULL DEFAULT 'preparing', -- 'preparing' | 'ready' | 'errored'
  b2_key        text,                              -- uploaded source object, for cleanup/retry
  created_by    text NOT NULL,                     -- user id
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mux_asset_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_asset ON audio_tracks (mux_asset_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_track ON audio_tracks (mux_track_id);
```

- [ ] **Step 3: Apply the migration to the DB `.env.local` points at**

Run:
```bash
set -a && source .env.local && set +a
psql "$DATABASE_URL" -f supabase/migrations/2026-05-29_create_audio_tracks.sql
```
Expected: `CREATE TABLE` and two `CREATE INDEX` lines, no error. (`.env.local` here is the preprod DB.)

- [ ] **Step 4: Verify the table exists**

Run: `psql "$DATABASE_URL" -c "\d audio_tracks"`
Expected: column list matching the SQL above.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-05-29_create_audio_tracks.sql
git commit -m "feat(audio-tracks): add audio_tracks table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `lib/mux.ts` helpers + pure-logic unit tests

**Files:**
- Modify: `lib/mux.ts`
- Test: `__tests__/lib/mux.test.ts`

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `__tests__/lib/mux.test.ts`:

```ts
/**
 * Unit tests for the pure helpers in lib/mux.ts.
 * The fetch-based Mux calls are exercised via manual preprod testing (Task 11).
 */
import { audioContentTypeForFile, buildAudioTrackKey } from '@/lib/mux';

describe('audioContentTypeForFile', () => {
  it('maps supported audio extensions to MIME types', () => {
    expect(audioContentTypeForFile('voice.m4a')).toBe('audio/mp4');
    expect(audioContentTypeForFile('voice.mp3')).toBe('audio/mpeg');
    expect(audioContentTypeForFile('voice.wav')).toBe('audio/wav');
  });

  it('is case-insensitive on the extension', () => {
    expect(audioContentTypeForFile('VOICE.MP3')).toBe('audio/mpeg');
  });

  it('returns null for unsupported or extension-less files', () => {
    expect(audioContentTypeForFile('clip.mp4')).toBeNull();
    expect(audioContentTypeForFile('noext')).toBeNull();
  });
});

describe('buildAudioTrackKey', () => {
  it('namespaces the key under the asset and keeps the extension', () => {
    const key = buildAudioTrackKey('asset123', 'My Voice.mp3');
    expect(key.startsWith('audio-tracks/asset123/')).toBe(true);
    expect(key.endsWith('.mp3')).toBe(true);
  });

  it('produces a unique key per call', () => {
    expect(buildAudioTrackKey('a', 'v.wav')).not.toBe(buildAudioTrackKey('a', 'v.wav'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test __tests__/lib/mux.test.ts 2>&1 | tail -20`
Expected: FAIL — `audioContentTypeForFile`/`buildAudioTrackKey` not exported.

- [ ] **Step 3: Add the helpers to `lib/mux.ts`**

Append to `lib/mux.ts` (after the existing exports; `crypto` is available globally in this runtime, as in `lib/storage.ts`):

```ts
const MUX_API_BASE = 'https://api.mux.com/video/v1';

function muxAuthHeader(): string {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux API credentials');
  }
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`;
}

const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** Map a filename to a supported audio MIME type, or null if unsupported. Pure. */
export function audioContentTypeForFile(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return SUPPORTED_AUDIO_TYPES[ext] ?? null;
}

/** Build a unique B2 object key for an asset's audio track. Pure. */
export function buildAudioTrackKey(assetId: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'bin';
  return `audio-tracks/${assetId}/${crypto.randomUUID()}.${ext}`;
}

export interface AudioTrackInput {
  url: string;
  languageCode: string;
  name: string;
}

/** Attach an alternate audio track to a ready Mux asset. Returns the new track id. */
export async function addAudioTrack(
  assetId: string,
  { url, languageCode, name }: AudioTrackInput
): Promise<{ trackId: string }> {
  const response = await fetch(`${MUX_API_BASE}/assets/${assetId}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: muxAuthHeader() },
    body: JSON.stringify({ url, type: 'audio', language_code: languageCode, name }),
  });
  if (!response.ok) {
    throw new Error(`Mux add-track error (${response.status}): ${await response.text()}`);
  }
  const result = await response.json();
  return { trackId: result.data.id };
}

/** Remove an audio track from an asset. Treats 404 as already-gone. */
export async function deleteAudioTrack(assetId: string, trackId: string): Promise<void> {
  const response = await fetch(`${MUX_API_BASE}/assets/${assetId}/tracks/${trackId}`, {
    method: 'DELETE',
    headers: { Authorization: muxAuthHeader() },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Mux delete-track error (${response.status}): ${await response.text()}`);
  }
}

export interface MuxAudioTrack {
  id: string;
  status: string; // 'preparing' | 'ready' | 'errored'
  language_code?: string;
  name?: string;
}

/** List the audio tracks Mux knows about for an asset (authoritative status). */
export async function listAssetAudioTracks(assetId: string): Promise<MuxAudioTrack[]> {
  const response = await fetch(`${MUX_API_BASE}/assets/${assetId}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (!response.ok) {
    throw new Error(`Mux asset retrieve error (${response.status}): ${await response.text()}`);
  }
  const result = await response.json();
  const tracks: Array<{ id: string; type: string; status: string; language_code?: string; name?: string }> =
    result.data.tracks ?? [];
  return tracks.filter((t) => t.type === 'audio').map((t) => ({
    id: t.id,
    status: t.status,
    language_code: t.language_code,
    name: t.name,
  }));
}

/** Resolve the owning asset id for a playback id (About-page videos store only the playback id). */
export async function resolveAssetIdFromPlaybackId(playbackId: string): Promise<string> {
  const response = await fetch(`${MUX_API_BASE}/playback-ids/${playbackId}`, {
    headers: { Authorization: muxAuthHeader() },
  });
  if (!response.ok) {
    throw new Error(`Mux playback-id lookup error (${response.status}): ${await response.text()}`);
  }
  const result = await response.json();
  return result.data.object.id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/lib/mux.test.ts 2>&1 | tail -20`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/mux.ts __tests__/lib/mux.test.ts
git commit -m "feat(audio-tracks): Mux track helpers (add/delete/list/resolve)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Shared permission helper + audio upload-url route

**Files:**
- Create: `lib/community-auth.ts`
- Create: `app/api/mux/audio-upload-url/route.ts`

- [ ] **Step 1: Create the shared permission helper**

Create `lib/community-auth.ts` (DRYs the creator/admin check used by `app/api/mux/upload-url/route.ts`):

```ts
import { queryOne } from '@/lib/db';
import { getUserIsAdmin } from '@/lib/community-data';

/** True if the user created the community or is a platform admin. */
export async function userCanManageCommunity(userId: string, communityId: string): Promise<boolean> {
  const community = await queryOne<{ created_by: string }>`
    SELECT created_by FROM communities WHERE id = ${communityId}
  `;
  if (!community) return false;
  if (community.created_by === userId) return true;
  return getUserIsAdmin(userId);
}
```

- [ ] **Step 2: Create the audio upload-url route**

Create `app/api/mux/audio-upload-url/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { getSignedUploadUrl } from '@/lib/storage';
import { audioContentTypeForFile, buildAudioTrackKey } from '@/lib/mux';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { communityId, assetId, fileName } = body as {
      communityId?: string;
      assetId?: string;
      fileName?: string;
    };

    if (!communityId || !assetId || !fileName) {
      return NextResponse.json(
        { error: 'communityId, assetId and fileName are required' },
        { status: 400 }
      );
    }

    if (!(await userCanManageCommunity(session.user.id, communityId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const contentType = audioContentTypeForFile(fileName);
    if (!contentType) {
      return NextResponse.json(
        { error: 'Unsupported audio file. Use M4A, MP3 or WAV.' },
        { status: 400 }
      );
    }

    const key = buildAudioTrackKey(assetId, fileName);
    const uploadUrl = await getSignedUploadUrl(key, contentType, 3600);

    return NextResponse.json({ uploadUrl, key, contentType });
  } catch (error) {
    console.error('Error creating audio upload URL:', error);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep -E "audio-upload-url|community-auth" || echo "no type errors in new files"`
Expected: `no type errors in new files`.

- [ ] **Step 4: Commit**

```bash
git add lib/community-auth.ts app/api/mux/audio-upload-url/route.ts
git commit -m "feat(audio-tracks): audio upload-url route + shared community-manage check

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Create + list audio-tracks route

**Files:**
- Create: `app/api/mux/assets/[assetId]/audio-tracks/route.ts`

- [ ] **Step 1: Create the route (POST creates a track, GET lists + reconciles)**

Create `app/api/mux/assets/[assetId]/audio-tracks/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { queryOne, sql } from '@/lib/db';
import { getSignedDownloadUrl } from '@/lib/storage';
import { addAudioTrack, listAssetAudioTracks } from '@/lib/mux';

interface AudioTrackRow {
  id: string;
  mux_asset_id: string;
  mux_track_id: string | null;
  language_code: string;
  name: string;
  status: string;
  created_at: string;
}

const DOWNLOAD_URL_TTL_SECONDS = 60 * 60 * 24; // 24h: comfortably longer than Mux processing

export async function POST(request: Request, props: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await props.params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { communityId, languageCode, name, b2Key } = body as {
      communityId?: string;
      languageCode?: string;
      name?: string;
      b2Key?: string;
    };

    if (!communityId || !languageCode || !name || !b2Key) {
      return NextResponse.json(
        { error: 'communityId, languageCode, name and b2Key are required' },
        { status: 400 }
      );
    }

    if (!(await userCanManageCommunity(session.user.id, communityId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Reject a duplicate language up front for a friendly error (also enforced by the unique index).
    const existing = await queryOne<{ id: string }>`
      SELECT id FROM audio_tracks
      WHERE mux_asset_id = ${assetId} AND language_code = ${languageCode}
    `;
    if (existing) {
      return NextResponse.json({ error: 'That language is already added.' }, { status: 409 });
    }

    const url = await getSignedDownloadUrl(b2Key, DOWNLOAD_URL_TTL_SECONDS);
    const { trackId } = await addAudioTrack(assetId, { url, languageCode, name });

    const row = await queryOne<AudioTrackRow>`
      INSERT INTO audio_tracks (mux_asset_id, mux_track_id, language_code, name, status, b2_key, created_by)
      VALUES (${assetId}, ${trackId}, ${languageCode}, ${name}, 'preparing', ${b2Key}, ${session.user.id})
      RETURNING id, mux_asset_id, mux_track_id, language_code, name, status, created_at
    `;

    return NextResponse.json({ track: row }, { status: 201 });
  } catch (error) {
    console.error('Error adding audio track:', error);
    return NextResponse.json({ error: 'Failed to add audio track' }, { status: 500 });
  }
}

export async function GET(request: Request, props: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await props.params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Reconcile any still-preparing rows against Mux (authoritative), tolerating Mux errors.
    const preparing = await sql<{ mux_track_id: string }[]>`
      SELECT mux_track_id FROM audio_tracks
      WHERE mux_asset_id = ${assetId} AND status = 'preparing' AND mux_track_id IS NOT NULL
    `;
    if (preparing.length > 0) {
      try {
        const muxTracks = await listAssetAudioTracks(assetId);
        const statusById = new Map(muxTracks.map((t) => [t.id, t.status]));
        for (const { mux_track_id } of preparing) {
          const muxStatus = statusById.get(mux_track_id);
          if (muxStatus === 'ready' || muxStatus === 'errored') {
            await sql`
              UPDATE audio_tracks SET status = ${muxStatus} WHERE mux_track_id = ${mux_track_id}
            `;
          }
        }
      } catch (reconcileError) {
        console.error('Audio track reconcile failed (non-fatal):', reconcileError);
      }
    }

    const rows = await sql<AudioTrackRow[]>`
      SELECT id, mux_asset_id, mux_track_id, language_code, name, status, created_at
      FROM audio_tracks
      WHERE mux_asset_id = ${assetId}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({ tracks: rows });
  } catch (error) {
    console.error('Error listing audio tracks:', error);
    return NextResponse.json({ error: 'Failed to list audio tracks' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep "audio-tracks/route" || echo "no type errors in new route"`
Expected: `no type errors in new route`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/mux/assets/[assetId]/audio-tracks/route.ts"
git commit -m "feat(audio-tracks): create + list/reconcile audio-tracks route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Delete audio-track route

**Files:**
- Create: `app/api/mux/assets/[assetId]/audio-tracks/[audioTrackId]/route.ts`

(`[audioTrackId]` is our `audio_tracks.id`, not the Mux track id.)

- [ ] **Step 1: Create the delete route**

Create `app/api/mux/assets/[assetId]/audio-tracks/[audioTrackId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { queryOne, sql } from '@/lib/db';
import { deleteAudioTrack } from '@/lib/mux';
import { deleteFile } from '@/lib/storage';

interface DeletableRow {
  id: string;
  mux_asset_id: string;
  mux_track_id: string | null;
  b2_key: string | null;
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ assetId: string; audioTrackId: string }> }
) {
  const { assetId, audioTrackId } = await props.params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const communityId = new URL(request.url).searchParams.get('communityId');
    if (!communityId) {
      return NextResponse.json({ error: 'communityId is required' }, { status: 400 });
    }
    if (!(await userCanManageCommunity(session.user.id, communityId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const row = await queryOne<DeletableRow>`
      SELECT id, mux_asset_id, mux_track_id, b2_key
      FROM audio_tracks
      WHERE id = ${audioTrackId} AND mux_asset_id = ${assetId}
    `;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (row.mux_track_id) {
      await deleteAudioTrack(assetId, row.mux_track_id);
    }
    if (row.b2_key) {
      try {
        await deleteFile(row.b2_key);
      } catch (b2Error) {
        console.error('Failed to delete audio source from storage (non-fatal):', b2Error);
      }
    }
    await sql`DELETE FROM audio_tracks WHERE id = ${audioTrackId}`;

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting audio track:', error);
    return NextResponse.json({ error: 'Failed to delete audio track' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep "audio-tracks/\[audioTrackId\]" || echo "no type errors in delete route"`
Expected: `no type errors in delete route`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/mux/assets/[assetId]/audio-tracks/[audioTrackId]/route.ts"
git commit -m "feat(audio-tracks): delete audio-track route (Mux + storage + row)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Mux webhook — track ready/errored

**Files:**
- Modify: `app/api/webhooks/mux/route.ts`

- [ ] **Step 1: Add the new cases to the switch**

In `app/api/webhooks/mux/route.ts`, extend the `switch (eventType)` (currently lines ~60-69) so it reads:

```ts
    switch (eventType) {
      case "video.asset.ready":
        await handleAssetReady(event);
        break;
      case "video.asset.errored":
        await handleAssetErrored(event);
        break;
      case "video.asset.track.ready":
        await handleTrackReady(event);
        break;
      case "video.asset.track.errored":
        await handleTrackErrored(event);
        break;
      default:
        console.log(`Unhandled Mux webhook event: ${eventType}`);
    }
```

- [ ] **Step 2: Add the handlers**

Add these functions at the end of `app/api/webhooks/mux/route.ts`. They match on the track id (returned to us at create time and stored in `mux_track_id`); the list endpoint's reconcile is the authoritative fallback if a payload shape differs.

```ts
async function handleTrackReady(event: any) {
  const trackId = event.data?.id;
  if (!trackId) return;
  await sql`UPDATE audio_tracks SET status = 'ready' WHERE mux_track_id = ${trackId}`;
  console.log(`Audio track ${trackId} ready`);
}

async function handleTrackErrored(event: any) {
  const trackId = event.data?.id;
  if (!trackId) return;
  await sql`UPDATE audio_tracks SET status = 'errored' WHERE mux_track_id = ${trackId}`;
  console.error(`Audio track ${trackId} errored`);
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep "webhooks/mux" || echo "no type errors in webhook"`
Expected: `no type errors in webhook`.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/mux/route.ts
git commit -m "feat(audio-tracks): handle Mux track ready/errored webhooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Language list + Languages panel component

**Files:**
- Create: `lib/languages.ts`
- Test: `__tests__/lib/languages.test.ts`
- Create: `components/audio-tracks/AudioLanguagesPanel.tsx`

- [ ] **Step 1: Write failing test for the language helper**

Create `__tests__/lib/languages.test.ts`:

```ts
import { AUDIO_LANGUAGES, languageLabel } from '@/lib/languages';

describe('languageLabel', () => {
  it('returns the display label for a known code', () => {
    expect(languageLabel('es')).toBe('Español');
    expect(languageLabel('en')).toBe('English');
  });

  it('falls back to the code when unknown', () => {
    expect(languageLabel('zz')).toBe('zz');
  });

  it('has unique language codes', () => {
    const codes = AUDIO_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/languages.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the language list**

Create `lib/languages.ts`:

```ts
export interface LanguageOption {
  code: string; // BCP-47
  label: string;
}

export const AUDIO_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
];

export function languageLabel(code: string): string {
  return AUDIO_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/languages.test.ts 2>&1 | tail -10`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the Languages panel component**

Create `components/audio-tracks/AudioLanguagesPanel.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { AUDIO_LANGUAGES, languageLabel } from "@/lib/languages";

interface AudioTrack {
  id: string;
  language_code: string;
  name: string;
  status: "preparing" | "ready" | "errored";
}

interface AudioLanguagesPanelProps {
  assetId: string;
  communityId: string;
  /** Label for the baked-in original audio (default English). */
  originalLanguageLabel?: string;
}

const STATUS_LABEL: Record<AudioTrack["status"], string> = {
  preparing: "Processing",
  ready: "Ready",
  errored: "Failed",
};

export function AudioLanguagesPanel({
  assetId,
  communityId,
  originalLanguageLabel = "English",
}: AudioLanguagesPanelProps) {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [languageCode, setLanguageCode] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTracks = useCallback(async () => {
    const res = await fetch(`/api/mux/assets/${assetId}/audio-tracks`);
    if (!res.ok) return;
    const data = await res.json();
    setTracks(data.tracks ?? []);
  }, [assetId]);

  useEffect(() => {
    loadTracks();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [loadTracks]);

  // Poll while anything is still processing.
  useEffect(() => {
    if (!tracks.some((t) => t.status === "preparing")) return;
    pollRef.current = setTimeout(loadTracks, 4000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [tracks, loadTracks]);

  const addedCodes = new Set(tracks.map((t) => t.language_code));
  const available = AUDIO_LANGUAGES.filter((l) => !addedCodes.has(l.code));

  const handleAdd = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!languageCode || !file) {
      toast.error("Pick a language and an audio file.");
      return;
    }
    setIsUploading(true);
    try {
      const urlRes = await fetch("/api/mux/audio-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId, assetId, fileName: file.name }),
      });
      if (!urlRes.ok) throw new Error((await urlRes.json()).error || "Could not start upload");
      const { uploadUrl, key } = await urlRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed"))
        );
        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.open("PUT", uploadUrl);
        xhr.send(file);
      });

      const createRes = await fetch(`/api/mux/assets/${assetId}/audio-tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId,
          languageCode,
          name: languageLabel(languageCode),
          b2Key: key,
        }),
      });
      if (!createRes.ok) throw new Error((await createRes.json()).error || "Could not add language");

      toast.success("Language added. It is processing now.");
      setIsAdding(false);
      setLanguageCode("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadTracks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add language");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (track: AudioTrack) => {
    const res = await fetch(
      `/api/mux/assets/${assetId}/audio-tracks/${track.id}?communityId=${encodeURIComponent(communityId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Language removed.");
      await loadTracks();
    } else {
      toast.error("Could not remove language.");
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-4">
      <h4 className="text-sm font-medium text-foreground">Languages</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Viewers can switch language in the player. Add a voice only recording. Record it while
        watching the video so the timing lines up.
      </p>

      <ul className="mt-3 space-y-2">
        <li className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm">
          <span>{originalLanguageLabel} (original)</span>
          <span className="text-xs text-muted-foreground">Ready</span>
        </li>
        {tracks.map((track) => (
          <li
            key={track.id}
            className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm"
          >
            <span>{track.name}</span>
            <span className="flex items-center gap-3">
              <span
                className={
                  track.status === "errored"
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
              >
                {STATUS_LABEL[track.status]}
              </span>
              <button
                onClick={() => handleRemove(track)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      {isAdding ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border/50 bg-background/60 p-3">
          <select
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose a language</option>
            {available.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".m4a,.mp3,.wav,audio/*"
            className="block w-full text-sm text-muted-foreground"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Add language"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsAdding(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        available.length > 0 && (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setIsAdding(true)}>
            Add language
          </Button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep -E "AudioLanguagesPanel|languages.ts" || echo "no type errors"`
Expected: `no type errors`.

- [ ] **Step 7: Commit**

```bash
git add lib/languages.ts __tests__/lib/languages.test.ts components/audio-tracks/AudioLanguagesPanel.tsx
git commit -m "feat(audio-tracks): language list + Languages authoring panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire the panel into the lesson editor

**Files:**
- Modify: `app/[communitySlug]/classroom/[courseSlug]/CourseDetailClient.tsx`

- [ ] **Step 1: Import the panel**

Near the other imports (e.g. just after `import { MuxPlayer } from "@/components/MuxPlayer";`, line ~57), add:

```tsx
import { AudioLanguagesPanel } from "@/components/audio-tracks/AudioLanguagesPanel";
```

- [ ] **Step 2: Render the panel under the player in edit mode**

In the lesson video block, immediately after the player wrapper (the `<div ...><MuxPlayer playbackId={lesson.playbackId} /></div>` at lines ~167-169) and still inside the `lesson.playbackId && !isChangingVideo` branch, add:

```tsx
              {isEditMode && lesson.videoAssetId && (
                <AudioLanguagesPanel
                  assetId={lesson.videoAssetId}
                  communityId={communityId}
                />
              )}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep "CourseDetailClient" || echo "no type errors in lesson editor"`
Expected: `no type errors in lesson editor`.

- [ ] **Step 4: Commit**

```bash
git add "app/[communitySlug]/classroom/[courseSlug]/CourseDetailClient.tsx"
git commit -m "feat(audio-tracks): Languages panel on lesson editor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: About-page video — store asset id, resolve legacy, wire panel

**Files:**
- Modify: `types/page-builder.ts`
- Create: `app/api/mux/resolve-asset-id/route.ts`
- Modify: `components/sections/VideoSection.tsx`

- [ ] **Step 1: Add `videoAssetId` to the section content type**

In `types/page-builder.ts`, inside the `Section.content` object (after `videoId?: string;`, line ~25) add:

```ts
    videoAssetId?: string;
```

- [ ] **Step 2: Create the resolve-asset-id route (for legacy About videos that only stored a playback id)**

Create `app/api/mux/resolve-asset-id/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { resolveAssetIdFromPlaybackId } from '@/lib/mux';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { communityId, playbackId } = body as { communityId?: string; playbackId?: string };
    if (!communityId || !playbackId) {
      return NextResponse.json({ error: 'communityId and playbackId are required' }, { status: 400 });
    }
    if (!(await userCanManageCommunity(session.user.id, communityId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assetId = await resolveAssetIdFromPlaybackId(playbackId);
    return NextResponse.json({ assetId });
  } catch (error) {
    console.error('Error resolving asset id:', error);
    return NextResponse.json({ error: 'Failed to resolve asset id' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Store the asset id on new About uploads**

In `components/sections/VideoSection.tsx`, the upload success handler currently saves only the playback id (lines ~155-158):

```tsx
      onUpdate({
        ...section.content,
        videoId: readyAsset.playbackId
      });
```

Change it to also persist the asset id (the polled asset already includes `id`):

```tsx
      onUpdate({
        ...section.content,
        videoId: readyAsset.playbackId,
        videoAssetId: readyAsset.id,
      });
```

- [ ] **Step 4: Import the panel and add a backfill effect**

In `components/sections/VideoSection.tsx`, add the import near the top (after `import { MuxPlayer } from "@/components/MuxPlayer";`, line ~19):

```tsx
import { AudioLanguagesPanel } from "@/components/audio-tracks/AudioLanguagesPanel";
```

Then, after the `useSortable` block (around line ~63, before `handleUpload`), add an effect that backfills the asset id for legacy videos that only stored a playback id:

```tsx
  useEffect(() => {
    if (!isEditing) return;
    if (!section.content.videoId || section.content.videoAssetId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mux/resolve-asset-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId, playbackId: section.content.videoId }),
        });
        if (!res.ok) return;
        const { assetId } = await res.json();
        if (!cancelled && assetId) {
          onUpdate({ ...section.content, videoAssetId: assetId });
        }
      } catch {
        // non-fatal; panel just will not show until resolvable
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, section.content.videoId, section.content.videoAssetId]);
```

- [ ] **Step 5: Render the panel under the player in edit mode**

In `components/sections/VideoSection.tsx`, the player render block is at lines ~317-327 (`section.content.videoId ? (<div ...><MuxPlayer .../></div>)`). Immediately after that closing `</div>` of the player wrapper, still inside the `videoId` truthy branch, add:

```tsx
              {isEditing && section.content.videoAssetId && (
                <AudioLanguagesPanel
                  assetId={section.content.videoAssetId}
                  communityId={communityId}
                />
              )}
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep -E "VideoSection|resolve-asset-id|page-builder" || echo "no type errors in About wiring"`
Expected: `no type errors in About wiring`.

- [ ] **Step 7: Commit**

```bash
git add types/page-builder.ts app/api/mux/resolve-asset-id/route.ts components/sections/VideoSection.tsx
git commit -m "feat(audio-tracks): Languages panel on About video + asset-id resolution

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Clean up audio tracks when a lesson video is deleted

**Files:**
- Modify: `app/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/[lessonId]/route.ts` (full path: `app/api/community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/[lessonId]/route.ts`)

Deleting the Mux asset (already done at lines ~194-196) removes its tracks on Mux's side. We still delete our `audio_tracks` rows and their B2 source objects.

- [ ] **Step 1: Import the storage delete helper**

At the top of the lessons `[lessonId]/route.ts`, ensure these imports exist (add what is missing):

```ts
import { deleteFile } from '@/lib/storage';
```

- [ ] **Step 2: Delete audio-track rows + B2 objects alongside the Mux asset delete**

In the DELETE handler, the current block is:

```ts
    if (lesson?.video_asset_id) {
      // Delete the video from Mux if it exists
      await deleteMuxAsset(lesson.video_asset_id);
    }
```

Replace it with:

```ts
    if (lesson?.video_asset_id) {
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
```

(`sql` is already imported in this file; confirm and add it to the `@/lib/db` import if not.)

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit 2>&1 | grep "lessons/\[lessonId\]" || echo "no type errors in lesson delete"`
Expected: `no type errors in lesson delete`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/[lessonId]/route.ts"
git commit -m "feat(audio-tracks): clean up audio tracks on lesson video delete

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Build, deploy to preprod, manual end-to-end verification

**Files:** none (verification + deploy)

- [ ] **Step 1: Full test suite + typecheck + lint + build**

Run:
```bash
bun test 2>&1 | tail -20
bunx tsc --noEmit 2>&1 | tail -20
bun lint 2>&1 | tail -20
bun run build 2>&1 | tail -20
```
Expected: tests pass, no new type errors, lint clean, build succeeds.

- [ ] **Step 2: Push the branch and deploy to preprod**

Run:
```bash
git push -u origin worktree-feat+multi-language-audio
cd /home/debian/apps/dance-hub && ./deploy-preprod.sh deploy worktree-feat+multi-language-audio
```
Expected: preprod builds and serves at `https://preprod.dance-hub.io`.
Note: the migration in Task 1 was applied to the DB `.env.local` points at; confirm that is the same DB preprod uses (`.env.preprod`). If not, re-apply the migration against the preprod `DATABASE_URL`.

- [ ] **Step 3: Confirm the Mux webhook is configured for track events**

In the Mux dashboard, ensure the webhook pointing at `https://preprod.dance-hub.io/api/webhooks/mux` is subscribed to `video.asset.track.ready` and `video.asset.track.errored` (in addition to the existing asset events). The handler also logs every `eventType`; the list endpoint reconciles status regardless, so a missing subscription degrades to slightly slower status, not incorrect status.

- [ ] **Step 4: Manual test — course lesson**

1. As a community owner, open a lesson with a `ready` video in edit mode.
2. In the Languages panel, click Add language, choose Español, upload a short voice-only MP3.
3. Confirm the row shows Processing, then flips to Ready (webhook or the 4s poll/reconcile).
4. Open the lesson as a viewer; confirm the player's audio menu lists English and Español and that switching swaps the audio while the video keeps playing.
5. Remove the Español track; confirm it disappears and the player no longer offers it.

- [ ] **Step 5: Manual test — About page video (exercises asset-id resolution)**

1. On a community About page with an existing video section, enter edit mode.
2. Confirm the Languages panel appears (legacy video: it backfills the asset id first).
3. Add a language and verify Processing -> Ready and the player switcher, as above.

- [ ] **Step 6: Report results**

Summarize what passed/failed with the actual observed behavior (status transitions, player menu contents). Do not claim success without having seen the switcher work on preprod.

---

## Self-Review

**Spec coverage:**
- Alternate audio track via one Mux call — Task 2 (`addAudioTrack`) + Task 4 (POST). ✓
- B2 hosting with signed URL — Task 3 (upload-url) + Task 4 (`getSignedDownloadUrl`, 24h). ✓
- Surface-agnostic `audio_tracks` keyed by `mux_asset_id` — Task 1. ✓
- Course lessons surface — Task 8. ✓
- Live-class replays — covered for free (replays are lessons with `video_asset_id`; Task 8 panel applies). ✓
- About-page video + playback-id→asset-id resolution + persist back — Task 9. ✓
- Webhook status (ready/errored) + GET reconcile fallback — Task 6 + Task 4 GET. ✓
- Built-in player switcher — no code; verified in Task 11. ✓
- Curated, extensible language list + original-track label — Task 7 (`lib/languages.ts`, `originalLanguageLabel` prop). ✓
- Permissions reuse creator/admin check — Task 3 (`userCanManageCommunity`), used in Tasks 4/5/9. ✓
- Duplicate-language prevention — Task 1 unique index + Task 4 409. ✓
- Cleanup on video delete — Task 10. ✓
- Keep B2 source until ready / cleanup on delete — Task 4 stores `b2_key`; Tasks 5 & 10 delete it. ✓
- "Mostly her voice" timing guidance in UI — Task 7 panel copy. ✓

**Deferred (matches spec "out of scope" / v2):** locale-based default track selection; the optional Mux-side relabel of the *original* track (we instead label it in our own UI via `originalLanguageLabel`, which the spec allowed as the fallback).

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `addAudioTrack`/`deleteAudioTrack`/`listAssetAudioTracks`/`resolveAssetIdFromPlaybackId`/`audioContentTypeForFile`/`buildAudioTrackKey` defined in Task 2 are used with matching signatures in Tasks 3/4/5/9. `userCanManageCommunity(userId, communityId)` defined in Task 3, used consistently. `audio_tracks` columns are identical across Tasks 1/4/5/6/10. The panel calls exactly the routes defined in Tasks 3/4/5. ✓

**Note on testing altitude:** Unit tests cover pure logic only (Mux key/MIME helpers, language label), matching this repo's convention (`__tests__/lib/daily.test.ts` tests pure helpers, not the external API). Route/webhook/player behavior is verified manually on preprod in Task 11 — this is an explicit, not silent, coverage boundary.
