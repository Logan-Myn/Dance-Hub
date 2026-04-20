import { queryOne } from '@/lib/db';
import { DashboardKpis } from '@/components/admin/DashboardKpis';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AdminDashboardPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  const [totalMembersResult, newMembersResult, activeMembersResult, threadsResult] =
    await Promise.all([
      queryOne<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM community_members
        WHERE community_id = ${community.id}
          AND user_id != ${community.created_by}
      `,
      queryOne<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM community_members
        WHERE community_id = ${community.id}
          AND status = 'active'
          AND joined_at >= ${thirtyDaysAgoIso}
      `,
      queryOne<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM community_members
        WHERE community_id = ${community.id}
          AND status = 'active'
      `,
      queryOne<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM threads
        WHERE community_id = ${community.id}
      `,
    ]);

  const stats = {
    totalMembers: totalMembersResult?.count ?? 0,
    activeMembers: activeMembersResult?.count ?? 0,
    totalThreads: threadsResult?.count ?? 0,
    newMembersThisMonth: newMembersResult?.count ?? 0,
    // TODO: plumb live Stripe data for Monthly Revenue + MoM growth.
    // The old modal's `/api/community/[slug]/stats` returns 0 for both too — the
    // Stripe aggregation isn't wired up yet. Tracked as follow-up after this refactor.
    monthlyRevenue: 0,
    revenueGrowth: 0,
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Dashboard
        </h1>
      </header>

      <DashboardKpis stats={stats} />
    </div>
  );
}
