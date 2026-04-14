import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import Navbar from '@/app/components/Navbar';
import CommunityNavbar from '@/components/CommunityNavbar';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { communitySlug: string };
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const community = await queryOne<{ id: string; created_by: string; name: string; is_broadcast_vip: boolean }>`
    SELECT id, created_by, name, is_broadcast_vip FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) redirect(`/${params.communitySlug}`);
  if (community.created_by !== session.user.id) redirect(`/${params.communitySlug}`);

  // Kill-switch: admin section is only accessible when the feature flag is on,
  // or when this community is explicitly marked VIP (pilot / gift access).
  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true';
  if (!broadcastsEnabled && !community.is_broadcast_vip) {
    redirect(`/${params.communitySlug}`);
  }

  return (
    <div className="flex flex-col min-h-screen bg-background font-sans">
      <Navbar />
      <CommunityNavbar
        communitySlug={params.communitySlug}
        activePage="admin"
        isMember={true}
        isOwner={true}
      />
      <main className="flex-grow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
          <div className="flex flex-col sm:flex-row gap-6 lg:gap-8">
            <AdminNav
              communitySlug={params.communitySlug}
              communityName={community.name}
            />
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
