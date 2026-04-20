import { queryOne, query } from '@/lib/db';
import { MembersTable, MemberRow } from '@/components/admin/MembersTable';

// Match the Emails/Dashboard/General admin pages: opt out of the data cache so
// the RSC re-renders with fresh data after each mutation + router.refresh().
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function MembersPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  // Replicates the GET handler in app/api/community/[communitySlug]/members/route.ts:
  // selects from the `community_members_with_profiles` view and filters to
  // active members with an active or missing subscription. Columns are aliased
  // to match the MemberRow shape directly (no JS mapping needed).
  // Note: the view has no `last_active` column, so we don't select one — the
  // old API returned `undefined` for it and the modal always rendered "N/A".
  const members = await query<MemberRow>`
    SELECT
      id,
      COALESCE(full_name, 'Anonymous') AS "displayName",
      COALESCE(email, '') AS email,
      COALESCE(avatar_url, '') AS "imageUrl",
      joined_at AS "joinedAt",
      COALESCE(status, 'active') AS status
    FROM community_members_with_profiles
    WHERE community_id = ${community.id}
      AND status = 'active'
      AND (subscription_status = 'active' OR subscription_status IS NULL)
    ORDER BY joined_at DESC
  `;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Members
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {members.length} total
        </p>
      </header>

      <MembersTable communitySlug={params.communitySlug} members={members} />
    </div>
  );
}
