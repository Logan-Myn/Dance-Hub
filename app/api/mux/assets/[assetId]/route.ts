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

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found or not ready' }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    console.error('Error getting asset:', error);
    return NextResponse.json(
      { error: 'Failed to get asset' },
      { status: 500 }
    );
  }
}
