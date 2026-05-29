import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity, assetBelongsToCommunity } from '@/lib/community-auth';
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
    if (!(await assetBelongsToCommunity(assetId, communityId))) {
      return NextResponse.json(
        { error: 'This video is not part of this community. If you just uploaded it, save the page first.' },
        { status: 403 }
      );
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
