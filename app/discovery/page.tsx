import Navbar from "@/app/components/Navbar";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";
import { query, queryOne } from "@/lib/db";
import type { DiscoveryCommunity } from "@/lib/discovery";
import DiscoveryClient from "./DiscoveryClient";

export const dynamic = 'force-dynamic';

interface Row extends Omit<DiscoveryCommunity, "opening_date" | "isMember" | "isOwner"> {
  opening_date: Date | string | null;
  is_member: boolean;
  is_owner: boolean;
}

export default async function DiscoveryPage() {
  const session = await getSession();
  const userId = session?.user.id ?? null;

  // Inactive communities can't be joined, so they aren't listed. Members are
  // the ones with access today, and the busiest communities come first.
  const [profile, viewer, rows] = await Promise.all([
    userId ? getProfileForUser(userId) : Promise.resolve(null),
    userId ? queryOne<{ timezone: string | null }>`SELECT timezone FROM profiles WHERE id = ${userId}` : Promise.resolve(null),
    query<Row>`
      SELECT
        c.id, c.slug, c.name, c.description, c.image_url,
        c.image_focal_x, c.image_focal_y, c.image_zoom, c.status, c.opening_date,
        (SELECT COUNT(*) FROM community_members m
          WHERE m.community_id = c.id AND m.role != 'admin' AND m.status = 'active')::int AS members_count,
        EXISTS (SELECT 1 FROM community_members m
          WHERE m.community_id = c.id AND m.user_id = ${userId} AND m.status = 'active') AS is_member,
        COALESCE(c.created_by = ${userId}, false) AS is_owner
      FROM communities c
      WHERE COALESCE(c.status, 'active') != 'inactive'
      ORDER BY members_count DESC, c.created_at DESC
    `,
  ]);

  const communities: DiscoveryCommunity[] = rows.map(({ is_member, is_owner, opening_date, ...c }) => ({
    ...c,
    opening_date: opening_date ? new Date(opening_date).toISOString() : null,
    isMember: is_member,
    isOwner: is_owner,
  }));
  const savedTimeZone = viewer?.timezone && viewer.timezone !== "UTC" ? viewer.timezone : null;

  return (
    <>
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />
      <DiscoveryClient communities={communities} signedIn={!!session} savedTimeZone={savedTimeZone} />
    </>
  );
}
