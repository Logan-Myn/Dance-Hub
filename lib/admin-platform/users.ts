import { query } from '@/lib/db';

export interface AdminUserCommunity {
  name: string;
  slug: string;
}

export interface AdminUserRow {
  id: string;
  authUserId: string | null;
  email: string;
  fullName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: Date;
  createdCommunities: AdminUserCommunity[];
  joinedCommunities: AdminUserCommunity[];
}

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: Date;
}

interface CommunityCreatedRow {
  created_by: string;
  name: string;
  slug: string;
}

interface CommunityJoinedRow {
  user_id: string;
  name: string;
  slug: string;
}

// communities.created_by and community_members.user_id are FKs to user.id
// (text), not profiles.id (uuid). Join on auth_user_id, not the profile PK.
export async function getAllAdminUsers(): Promise<AdminUserRow[]> {
  const profiles = await query<ProfileRow>`
    SELECT id, auth_user_id, email, full_name, display_name, avatar_url, is_admin, created_at
    FROM profiles
    ORDER BY created_at DESC
  `;

  if (profiles.length === 0) return [];

  const authUserIds = profiles
    .map((p) => p.auth_user_id)
    .filter((id): id is string => Boolean(id));

  // Bail early if no profiles have an auth_user_id — avoids passing an empty
  // array to ANY() which Postgres rejects.
  if (authUserIds.length === 0) {
    return profiles.map((p) => mapProfile(p, [], []));
  }

  const [createdRows, joinedRows] = await Promise.all([
    query<CommunityCreatedRow>`
      SELECT created_by, name, slug
      FROM communities
      WHERE created_by = ANY(${authUserIds})
    `,
    query<CommunityJoinedRow>`
      SELECT cm.user_id, c.name, c.slug
      FROM community_members cm
      JOIN communities c ON c.id = cm.community_id
      WHERE cm.user_id = ANY(${authUserIds})
        AND cm.status = 'active'
    `,
  ]);

  return profiles.map((p) =>
    mapProfile(p, createdRows, joinedRows)
  );
}

function mapProfile(
  p: ProfileRow,
  createdRows: CommunityCreatedRow[],
  joinedRows: CommunityJoinedRow[]
): AdminUserRow {
  const auth = p.auth_user_id;
  return {
    id: p.id,
    authUserId: auth,
    email: p.email,
    fullName: p.full_name,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    isAdmin: p.is_admin,
    createdAt: new Date(p.created_at),
    createdCommunities: auth
      ? createdRows
          .filter((c) => c.created_by === auth)
          .map((c) => ({ name: c.name, slug: c.slug }))
      : [],
    joinedCommunities: auth
      ? joinedRows
          .filter((c) => c.user_id === auth)
          .map((c) => ({ name: c.name, slug: c.slug }))
      : [],
  };
}
