import { notFound, redirect } from 'next/navigation';
import { communityPath } from '@/lib/safe-redirect';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getActivePrivateLessons,
  getUserIsAdmin,
} from '@/lib/community-data';
import PrivateLessonsPage from '@/components/PrivateLessonsPage';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityPrivateLessonsPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isCreator = !!session && community.created_by === session.user.id;
  const isMember =
    !!session && (await getCommunityMembership(community.id, session.user.id));
  const isAdmin = !!session && (await getUserIsAdmin(session.user.id));

  const access = offeringAccess(getOfferings(community), 'privateLessons', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  // Owners see inactive lessons too (with a "Hidden" badge) — same pattern
  // as classroom showing private courses to the teacher.
  const initialLessons = await getActivePrivateLessons(community.id, isCreator);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {access === 'banner' && <OfferingOffBanner />}
      <PrivateLessonsPage
        communitySlug={params.communitySlug}
        communityId={community.id}
        isCreator={isCreator}
        isMember={isMember}
        initialLessons={initialLessons}
      />
    </div>
  );
}
