import { NextResponse } from 'next/server';
import { getPlaybackStatus } from '@/lib/mux-playback-status';

// Polled by the video player while a freshly uploaded video is still being
// processed. No session required: About pages are public, and the answer
// ("processing" / "ready") reveals nothing beyond the public playback id.
// Only ids used by one of our lessons or About pages are looked up.
export async function GET(_req: Request, props: { params: Promise<{ playbackId: string }> }) {
  const { playbackId } = await props.params;
  try {
    const status = await getPlaybackStatus(playbackId);
    if (!status) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    return NextResponse.json(
      { status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error checking playback status:', error);
    return NextResponse.json({ error: 'Failed to check video status' }, { status: 500 });
  }
}
