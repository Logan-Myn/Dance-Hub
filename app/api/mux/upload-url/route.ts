import { NextResponse } from 'next/server';
import { createMuxUploadUrl } from '@/lib/mux';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { getUserIsAdmin } from '@/lib/community-data';

interface CommunityCreator {
  created_by: string;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    let communityId: string | undefined;
    try {
      const body = await request.json();
      communityId = body?.communityId;
    } catch {
      // no body / invalid JSON
    }

    if (!communityId || typeof communityId !== 'string') {
      return NextResponse.json(
        { error: 'communityId is required' },
        { status: 400 }
      );
    }

    const community = await queryOne<CommunityCreator>`
      SELECT created_by
      FROM communities
      WHERE id = ${communityId}
    `;

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const isCreator = community.created_by === userId;
    const isAdmin = isCreator ? false : await getUserIsAdmin(userId);
    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { uploadId, uploadUrl } = await createMuxUploadUrl();
    return NextResponse.json({ uploadId, uploadUrl });
  } catch (error) {
    console.error('Error creating Mux upload URL:', error);
    return NextResponse.json(
      { error: 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
