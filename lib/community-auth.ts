import { queryOne } from '@/lib/db';
import { getUserIsAdmin } from '@/lib/community-data';

/** True if the user created the community or is a platform admin. */
export async function userCanManageCommunity(userId: string, communityId: string): Promise<boolean> {
  const community = await queryOne<{ created_by: string }>`
    SELECT created_by FROM communities WHERE id = ${communityId}
  `;
  if (!community) return false;
  if (community.created_by === userId) return true;
  return getUserIsAdmin(userId);
}

/**
 * True if the Mux asset belongs to the community — either a course lesson video
 * (lessons.video_asset_id) or the community's About-page video (asset id stored in
 * the about_page JSONB). Used to prevent attaching/listing/deleting audio tracks
 * on another community's asset.
 */
export async function assetBelongsToCommunity(assetId: string, communityId: string): Promise<boolean> {
  const lessonOwned = await queryOne<{ one: number }>`
    SELECT 1 AS one
    FROM lessons l
    JOIN chapters ch ON ch.id = l.chapter_id
    JOIN courses co ON co.id = ch.course_id
    WHERE l.video_asset_id = ${assetId} AND co.community_id = ${communityId}
    LIMIT 1
  `;
  if (lessonOwned) return true;

  const aboutOwned = await queryOne<{ one: number }>`
    SELECT 1 AS one
    FROM communities
    WHERE id = ${communityId} AND about_page::text LIKE ${`%${assetId}%`}
    LIMIT 1
  `;
  return Boolean(aboutOwned);
}
