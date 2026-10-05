import { requireCommunityManagerPage } from '@/lib/community-auth';
import Link from 'next/link';
import { getCommunityBySlug } from '@/lib/community-data';
import { getQuota } from '@/lib/broadcasts/quota';
import { getAudienceCounts } from '@/lib/broadcasts/recipients';
import { getPublicProfile } from '@/lib/community-data';
import { ChevronLeft } from 'lucide-react';
import { Screen, ScreenHead } from '@/components/community-admin/ui';
import { BTN_GHOST } from '@/components/community-feed/feed-header';
import { EmailComposer } from '@/components/emails/EmailComposer';

export const dynamic = 'force-dynamic';

export default async function NewEmailPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const { session } = await requireCommunityManagerPage(params.communitySlug);

  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  const [quota, audienceCounts, sender] = await Promise.all([
    getQuota(community.id),
    getAudienceCounts(community.id),
    getPublicProfile(session.user.id),
  ]);
  const senderName = (sender?.name ?? session.user.name ?? '').split(' ')[0] || 'Your teacher';

  return (
    <Screen>
      <ScreenHead
        title="New email"
        sub={`Members get it in their inbox, from ${senderName} at ${community.name}.`}
        actions={
          <Link href={`/${params.communitySlug}/admin/emails`} className={BTN_GHOST}>
            <ChevronLeft aria-hidden="true" />
            Back to emails
          </Link>
        }
      />
      <EmailComposer
        communityId={community.id}
        communitySlug={params.communitySlug}
        communityName={community.name}
        senderName={senderName}
        ownerEmail={session.user.email}
        audienceCounts={audienceCounts}
        quota={quota}
      />
    </Screen>
  );
}
