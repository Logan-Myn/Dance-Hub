import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getActivePrivateLessons,
} from '@/lib/community-data';
import PrivateLessonsPage from '@/components/PrivateLessonsPage';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityPrivateLessonsPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isCreator = !!session && community.created_by === session.user.id;
  const isMember =
    !!session && (await getCommunityMembership(community.id, session.user.id));

  const initialLessons = await getActivePrivateLessons(community.id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
