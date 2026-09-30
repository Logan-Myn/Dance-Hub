import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/community-auth';
import { getCommunitySnapshot } from '@/lib/admin-platform/community-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: Request, props: { params: Promise<{ communityId: string }> }) {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  const params = await props.params;

  const snapshot = await getCommunitySnapshot(params.communityId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
