import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity, assetBelongsToCommunity } from '@/lib/community-auth';
import { uploadFile } from '@/lib/storage';
import { audioContentTypeForFile, buildAudioTrackKey } from '@/lib/mux';

// Audio is uploaded through our server (not browser-direct to storage) to match the
// rest of the app's upload pattern and avoid cross-origin/storage-CORS issues. Voice
// tracks are small; 100MB is a generous ceiling. nginx must allow a matching body size.
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const communityId = formData.get('communityId') as string | null;
    const assetId = formData.get('assetId') as string | null;

    if (!file || !communityId || !assetId) {
      return NextResponse.json(
        { error: 'file, communityId and assetId are required' },
        { status: 400 }
      );
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

    const contentType = audioContentTypeForFile(file.name);
    if (!contentType) {
      return NextResponse.json(
        { error: 'Unsupported audio file. Use M4A, MP3 or WAV.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file must be under 100MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = buildAudioTrackKey(assetId, file.name);
    await uploadFile(buffer, key, contentType);

    return NextResponse.json({ key });
  } catch (error) {
    console.error('Error uploading audio track file:', error);
    return NextResponse.json({ error: 'Failed to upload audio file' }, { status: 500 });
  }
}
