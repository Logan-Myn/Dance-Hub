import { notFound } from 'next/navigation';
import { getCommunityBySlug, getThreadById } from '@/lib/community-data';
import { getSession } from '@/lib/auth-session';
import ThreadPageClient from './ThreadPageClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ThreadRoutePage({
  params,
}: {
  params: { communitySlug: string; threadId: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const thread = await getThreadById(community.id, params.threadId);
  if (!thread) notFound();

  const session = await getSession();
  const isCreator = !!session && thread.userId === session.user.id;

  return (
    <ThreadPageClient
      communitySlug={params.communitySlug}
      thread={thread}
      isCreator={isCreator}
    />
  );
}
