import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { queryOne } from '@/lib/db';
import { resolveAssetIdFromPlaybackId } from '@/lib/mux';

/**
 * True if the playback id is already used by this community: a course lesson
 * video, or a video section saved on the community's About page. Stops a
 * manager from resolving asset ids for another community's videos.
 */
async function playbackIdBelongsToCommunity(playbackId: string, communityId: string): Promise<boolean> {
  const lessonOwned = await queryOne<{ one: number }>`
    SELECT 1 AS one
    FROM lessons l
    JOIN chapters ch ON ch.id = l.chapter_id
    JOIN courses co ON co.id = ch.course_id
    WHERE l.playback_id = ${playbackId} AND co.community_id = ${communityId}
    LIMIT 1
  `;
  if (lessonOwned) return true;

  const aboutOwned = await queryOne<{ one: number }>`
    SELECT 1 AS one
    FROM communities c,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.about_page -> 'sections') = 'array'
          THEN c.about_page -> 'sections'
          ELSE '[]'::jsonb
        END
      ) AS s
    WHERE c.id = ${communityId}
      AND s -> 'content' ->> 'videoId' = ${playbackId}
    LIMIT 1
  `;
  return Boolean(aboutOwned);
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { communityId, playbackId } = body as { communityId?: string; playbackId?: string };
    if (!communityId || !playbackId || typeof communityId !== 'string' || typeof playbackId !== 'string') {
      return NextResponse.json({ error: 'communityId and playbackId are required' }, { status: 400 });
    }
    if (!(await userCanManageCommunity(session.user.id, communityId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!(await playbackIdBelongsToCommunity(playbackId, communityId))) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const assetId = await resolveAssetIdFromPlaybackId(playbackId);
    return NextResponse.json({ assetId });
  } catch (error) {
    console.error('Error resolving asset id:', error);
    return NextResponse.json({ error: 'Failed to resolve asset id' }, { status: 500 });
  }
}
