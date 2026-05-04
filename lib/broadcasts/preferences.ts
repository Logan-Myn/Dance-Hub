import { sql, query } from '@/lib/db';

export interface CommunityPreference {
  communityId: string;
  name: string;
  slug: string;
  broadcastsEnabled: boolean;
}

interface PreferenceRow {
  community_id: string;
  name: string;
  slug: string;
  broadcasts_enabled: boolean;
}

/**
 * Lists every community the user is an active member of, with their
 * per-community broadcasts_enabled preference. LEFT JOIN means missing
 * preference rows surface as broadcastsEnabled = true (default-allow).
 */
export async function getCommunityPreferencesForUser(
  userId: string
): Promise<CommunityPreference[]> {
  const rows = await query<PreferenceRow>`
    SELECT
      c.id AS community_id,
      c.name,
      c.slug,
      COALESCE(cep.broadcasts_enabled, true) AS broadcasts_enabled
    FROM community_members m
    JOIN profiles p ON p.auth_user_id = m.user_id
    JOIN communities c ON c.id = m.community_id
    LEFT JOIN community_email_preferences cep
      ON cep.user_id = p.id AND cep.community_id = c.id
    WHERE p.id = ${userId}
      AND m.status = 'active'
    ORDER BY c.name
  `;
  return rows.map((row) => ({
    communityId: row.community_id,
    name: row.name,
    slug: row.slug,
    broadcastsEnabled: row.broadcasts_enabled,
  }));
}

/**
 * Upsert the per-community preference. Stamps unsubscribed_at when
 * disabling so we can audit when each user opted out.
 */
export async function setCommunityBroadcastsEnabled(
  userId: string,
  communityId: string,
  enabled: boolean
): Promise<void> {
  const unsubscribedAt = enabled ? null : new Date();
  await sql`
    INSERT INTO community_email_preferences
      (user_id, community_id, broadcasts_enabled, unsubscribed_at)
    VALUES (${userId}, ${communityId}, ${enabled}, ${unsubscribedAt})
    ON CONFLICT (user_id, community_id) DO UPDATE
      SET broadcasts_enabled = EXCLUDED.broadcasts_enabled,
          unsubscribed_at = EXCLUDED.unsubscribed_at,
          updated_at = NOW()
  `;
}
