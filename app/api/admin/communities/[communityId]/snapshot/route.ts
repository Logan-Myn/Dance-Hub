import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { getCommunitySnapshot } from '@/lib/admin-platform/community-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: { communityId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const snapshot = await getCommunitySnapshot(params.communityId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
