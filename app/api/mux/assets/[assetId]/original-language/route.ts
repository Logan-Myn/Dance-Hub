import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity, assetBelongsToCommunity } from '@/lib/community-auth';
import { listAssetAudioTracks, updateAudioTrack } from '@/lib/mux';
import { languageLabel } from '@/lib/languages';

// Label the baked-in (primary) audio track's language, so the player menu shows a real
// language name instead of "Default". Works for existing videos and newly uploaded ones.
export async function PATCH(request: Request, props: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await props.params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { communityId, languageCode } = body as { communityId?: string; languageCode?: string };
    if (!communityId || !languageCode) {
      return NextResponse.json({ error: 'communityId and languageCode are required' }, { status: 400 });
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

    const tracks = await listAssetAudioTracks(assetId);
    const primary = tracks.find((t) => t.primary);
    if (!primary) {
      return NextResponse.json({ error: 'No original audio track found.' }, { status: 404 });
    }

    await updateAudioTrack(assetId, primary.id, { languageCode, name: languageLabel(languageCode) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error setting original language:', error);
    return NextResponse.json({ error: 'Failed to set original language' }, { status: 500 });
  }
}
