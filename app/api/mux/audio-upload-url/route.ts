import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { getSignedUploadUrl } from '@/lib/storage';
import { audioContentTypeForFile, buildAudioTrackKey } from '@/lib/mux';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { communityId, assetId, fileName } = body as {
      communityId?: string;
      assetId?: string;
      fileName?: string;
    };

    if (!communityId || !assetId || !fileName) {
      return NextResponse.json(
        { error: 'communityId, assetId and fileName are required' },
        { status: 400 }
      );
    }

    if (!(await userCanManageCommunity(session.user.id, communityId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const contentType = audioContentTypeForFile(fileName);
    if (!contentType) {
      return NextResponse.json(
        { error: 'Unsupported audio file. Use M4A, MP3 or WAV.' },
        { status: 400 }
      );
    }

    const key = buildAudioTrackKey(assetId, fileName);
    const uploadUrl = await getSignedUploadUrl(key, contentType, 3600);

    return NextResponse.json({ uploadUrl, key, contentType });
  } catch (error) {
    console.error('Error creating audio upload URL:', error);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}
