import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { communityPath, loginPath } from '@/lib/safe-redirect';
import { getCommunityBySlug, getUserIsAdmin } from '@/lib/community-data';

export default async function AdminLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const { children } = props;

  const session = await getSession();
  if (!session) redirect(loginPath(communityPath(params.communitySlug, '/admin')));

  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) redirect(communityPath(params.communitySlug));

  // The community owner OR a site-wide admin (profiles.is_admin) can manage.
  // Anything else bounces to the community feed.
  const isOwner = community.created_by === session.user.id;
  const canManage = isOwner || (await getUserIsAdmin(session.user.id));
  if (!canManage) redirect(communityPath(params.communitySlug));

  // Chrome around the admin pages is set by the child route groups
  // (with-nav) and (focused) — this layout only enforces access.
  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1 sm:px-6 md:pb-16 md:pt-7">
      {children}
    </div>
  );
}
