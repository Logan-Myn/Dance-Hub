import { notFound } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import Navbar from '@/app/components/Navbar';
import CommunityNavbar from '@/components/CommunityNavbar';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface CommunityRow {
  id: string;
  created_by: string;
}

interface MemberStatusRow {
  status: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
}

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { communitySlug: string };
}) {
  const community = await queryOne<CommunityRow>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) notFound();

  const session = await getSession();
  const isOwner = !!session && community.created_by === session.user.id;

  let isMember = false;
  if (session) {
    const member = await queryOne<MemberStatusRow>`
      SELECT status, subscription_status, current_period_end
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${session.user.id}
    `;
    if (member) {
      const periodEnd = member.current_period_end ? new Date(member.current_period_end) : null;
      const inGracePeriod =
        member.subscription_status === 'canceling' && periodEnd && periodEnd > new Date();
      isMember = member.status === 'active' || !!inGracePeriod;
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <CommunityNavbar
        communitySlug={params.communitySlug}
        isMember={isMember}
        isOwner={isOwner}
      />
      <main className="flex-grow">{children}</main>
    </div>
  );
}
