import { query } from '@/lib/db';

export interface BroadcastRecipient {
  userId: string;
  email: string;
  displayName: string;
  unsubscribeToken: string | null;
}

interface RecipientRow {
  user_id: string;
  email: string;
  full_name: string | null;
  unsubscribe_token: string | null;
}

export async function getActiveRecipientsForCommunity(
  communityId: string
): Promise<BroadcastRecipient[]> {
  const rows = await query<RecipientRow>`
    SELECT
      m.user_id,
      p.email,
      p.full_name,
      ep.unsubscribe_token
    FROM community_members m
    JOIN profiles p ON p.auth_user_id = m.user_id
    LEFT JOIN email_preferences ep ON ep.email = p.email
    WHERE m.community_id = ${communityId}
      AND m.status = 'active'
      AND (
        m.subscription_status IS NULL
        OR m.subscription_status NOT IN ('canceled', 'unpaid', 'past_due', 'incomplete', 'incomplete_expired')
      )
      AND (ep.teacher_broadcast IS DISTINCT FROM false)
      AND (ep.unsubscribed_all IS DISTINCT FROM true)
      AND p.email IS NOT NULL
  `;

  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.full_name ?? 'there',
    unsubscribeToken: row.unsubscribe_token,
  }));
}
