import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const quota = await getQuota(community.id);
  return NextResponse.json(quota);
}
