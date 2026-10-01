import { notFound, redirect } from 'next/navigation';
import { getCommunityBySlug, getThreadById } from '@/lib/community-data';
import { getSession } from '@/lib/auth-session';
import { canViewCommunity } from '@/lib/community-auth';
import ThreadPageClient from './ThreadPageClient';
import { communityPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ThreadRoutePage(
  props: {
    params: Promise<{ communitySlug: string; threadId: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  // Members-only, same gate as the feed page: everyone else goes to /about.
  const session = await getSession();
  if (!session) redirect(communityPath(params.communitySlug, '/about'));
  if (!(await canViewCommunity(session.user.id, community, { allowPreRegistered: true }))) {
    redirect(communityPath(params.communitySlug, '/about'));
  }

  const thread = await getThreadById(community.id, params.threadId);
  if (!thread) notFound();

  const isCreator = community.created_by === session.user.id;

  return (
    <ThreadPageClient
      communitySlug={params.communitySlug}
      thread={thread}
      isCreator={isCreator}
      threadCategories={community.thread_categories}
    />
  );
}
