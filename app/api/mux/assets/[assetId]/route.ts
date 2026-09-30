import { NextResponse } from 'next/server';
import { getMuxAsset } from '@/lib/mux';
import { getSession } from '@/lib/auth-session';

export async function GET(req: Request, props: { params: Promise<{ assetId: string }> }) {
  const params = await props.params;
  try {
    // Verify authentication using Better Auth session
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const asset = await getMuxAsset(params.assetId);

    // 202: the upload landed but Mux has not linked an asset yet. Distinct from
    // 404 so the uploader knows to keep waiting instead of failing the upload.
    if (asset.state === 'pending') {
      return NextResponse.json({ state: 'pending' }, { status: 202 });
    }

    // 422: Mux gave up on this upload, so no asset will ever appear. Tells the
    // uploader to stop waiting now rather than at its deadline.
    if (asset.state === 'failed') {
      return NextResponse.json({ state: 'failed', reason: asset.reason }, { status: 422 });
    }

    return NextResponse.json({
      id: asset.id,
      playbackId: asset.playbackId,
      status: asset.status,
    });
  } catch (error) {
    if ((error as { status?: number })?.status === 404) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }
    console.error('Error getting asset:', error);
    return NextResponse.json(
      { error: 'Failed to get asset' },
      { status: 500 }
    );
  }
}
