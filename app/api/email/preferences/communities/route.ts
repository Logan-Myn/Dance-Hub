import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import {
  getCommunityPreferencesForUser,
  setCommunityBroadcastsEnabled,
} from '@/lib/broadcasts/preferences';

async function resolveProfileId(authUserId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>`
    SELECT id FROM profiles WHERE auth_user_id = ${authUserId}
  `;
  return row?.id ?? null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const profileId = await resolveProfileId(session.user.id);
  if (!profileId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  const communities = await getCommunityPreferencesForUser(profileId);
  return NextResponse.json({ communities });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const profileId = await resolveProfileId(session.user.id);
  if (!profileId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  const { communityId, enabled } = (await request.json()) as {
    communityId?: string;
    enabled?: boolean;
  };
  if (!communityId || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'communityId and enabled are required' },
      { status: 400 }
    );
  }

  // Confirm the user is actually a member of this community (avoid letting
  // anyone create rows for arbitrary communities).
  const membership = await queryOne<{ user_id: string }>`
    SELECT m.user_id
    FROM community_members m
    JOIN profiles p ON p.auth_user_id = m.user_id
    WHERE p.id = ${profileId} AND m.community_id = ${communityId}
  `;
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this community' }, { status: 403 });
  }

  await setCommunityBroadcastsEnabled(profileId, communityId, enabled);
  return NextResponse.json({ success: true });
}
