import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { getCommunityBySlug, getUserIsAdmin } from '@/lib/community-data';
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

  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) redirect(`/${params.communitySlug}`);

  // The community owner OR a site-wide admin (profiles.is_admin) can manage.
  // Anything else bounces to the community feed.
  const isOwner = community.created_by === session.user.id;
  const canManage = isOwner || (await getUserIsAdmin(session.user.id));
  if (!canManage) redirect(`/${params.communitySlug}`);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 lg:py-14 font-sans pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-14">
      <div className="flex flex-col md:flex-row gap-3 lg:gap-4">
        <AdminNav
          communitySlug={params.communitySlug}
          communityName={community.name}
        />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
