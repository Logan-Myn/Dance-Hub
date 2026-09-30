import { queryOne } from '@/lib/db';

/**
 * True if a Mux asset is still played somewhere other than the lessons being
 * deleted: another lesson, or a video section on any About page. Deleting the
 * asset in that case would break that other video too.
 *
 * Pass the ids of every lesson that is going away (one lesson, or all the
 * lessons of a course) so they do not count as "still using" it.
 */
export async function isMuxAssetUsedElsewhere(
  assetId: string,
  deletedLessonIds: string[]
): Promise<boolean> {
  const row = await queryOne<{ one: number }>`
    SELECT 1 AS one
    WHERE EXISTS (
      SELECT 1 FROM lessons
      WHERE video_asset_id = ${assetId}
        AND NOT (id = ANY(${deletedLessonIds}::uuid[]))
    )
    OR EXISTS (
      SELECT 1
      FROM communities c,
        jsonb_array_elements(
          CASE WHEN jsonb_typeof(c.about_page -> 'sections') = 'array'
            THEN c.about_page -> 'sections'
            ELSE '[]'::jsonb
          END
        ) AS s
      WHERE s -> 'content' ->> 'videoAssetId' = ${assetId}
    )
  `;
  return Boolean(row);
}
