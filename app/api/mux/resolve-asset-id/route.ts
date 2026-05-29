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
