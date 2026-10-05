import { requireCommunityManagerPage } from '@/lib/community-auth';
import Link from 'next/link';
import { query } from '@/lib/db';
import { getCommunityBySlug } from '@/lib/community-data';
import { getQuota } from '@/lib/broadcasts/quota';
import { Plus } from 'lucide-react';
import { QuotaBadge } from '@/components/emails/QuotaBadge';
import { Screen, ScreenHead } from '@/components/community-admin/ui';
import { BTN_PRIMARY } from '@/components/community-feed/feed-header';
import {
  BroadcastHistoryList,
  BroadcastHistoryItem,
} from '@/components/emails/BroadcastHistoryList';

// force-dynamic alone wasn't enough: the Neon HTTP driver's fetch() responses
// were being served from Next.js's Data Cache on soft-nav, returning stale
// empty results. force-no-store opts every fetch in this segment out of it.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function EmailsListPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  await requireCommunityManagerPage(params.communitySlug);
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  const [quota, broadcasts] = await Promise.all([
    getQuota(community.id),
    query<BroadcastHistoryItem>`
      SELECT id, subject, recipient_count, status, sent_at, created_at::text AS created_at, audience
      FROM email_broadcasts
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
      LIMIT 100
    `,
  ]);

  return (
    <Screen>
      <ScreenHead
        title="Emails to members"
        sub="Announcements that land in members' inboxes, beyond the community feed."
        actions={
          <Link href={`/${params.communitySlug}/admin/emails/new`} className={BTN_PRIMARY}>
            <Plus aria-hidden="true" />
            New email
          </Link>
        }
      />
      <QuotaBadge tier={quota.tier} used={quota.used} limit={quota.limit} />
      <BroadcastHistoryList broadcasts={broadcasts} communitySlug={params.communitySlug} />
    </Screen>
  );
}
