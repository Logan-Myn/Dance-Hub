import { queryOne } from '@/lib/db';
import { Video, resolveAssetIdFromPlaybackId } from '@/lib/mux';

export type PlaybackStatus = 'ready' | 'processing' | 'failed';

/**
 * Finds the Mux asset behind a playback id we actually use: a lesson video or
 * a video section on an About page. Returns undefined for ids we don't know,
 * so callers never spend a Mux API call on a stranger's id.
 */
async function findKnownAsset(playbackId: string): Promise<{ assetId: string | null } | undefined> {
  const lesson = await queryOne<{ video_asset_id: string | null }>`
    SELECT video_asset_id FROM lessons WHERE playback_id = ${playbackId} LIMIT 1
  `;
  if (lesson) return { assetId: lesson.video_asset_id };

  const about = await queryOne<{ asset_id: string | null }>`
    SELECT s -> 'content' ->> 'videoAssetId' AS asset_id
    FROM communities c,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.about_page -> 'sections') = 'array'
          THEN c.about_page -> 'sections'
          ELSE '[]'::jsonb
        END
      ) AS s
    WHERE s -> 'content' ->> 'videoId' = ${playbackId}
    LIMIT 1
  `;
  if (about) return { assetId: about.asset_id };

  return undefined;
}

/** Whether a video can play yet. Returns null when the playback id isn't ours. */
export async function getPlaybackStatus(playbackId: string): Promise<PlaybackStatus | null> {
  const known = await findKnownAsset(playbackId);
  if (!known) return null;

  const assetId = known.assetId ?? (await resolveAssetIdFromPlaybackId(playbackId));
  const asset = await Video.assets.retrieve(assetId);
  if (asset.status === 'ready') return 'ready';
  if (asset.status === 'errored') return 'failed';
  return 'processing';
}
