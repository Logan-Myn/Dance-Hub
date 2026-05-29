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
