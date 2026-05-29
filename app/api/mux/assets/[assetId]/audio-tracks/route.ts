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
