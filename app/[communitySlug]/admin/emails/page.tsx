import Link from 'next/link';
import { queryOne, query } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';
import { Button } from '@/components/ui/button';
import { QuotaBadge } from '@/components/emails/QuotaBadge';
import { BroadcastHistoryList, BroadcastHistoryItem } from '@/components/emails/BroadcastHistoryList';

export default async function EmailsListPage({ params }: { params: { communitySlug: string } }) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const [quota, broadcasts] = await Promise.all([
    getQuota(community.id),
    query<BroadcastHistoryItem>`
      SELECT id, subject, recipient_count, status, sent_at, created_at::text AS created_at
      FROM email_broadcasts
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
      LIMIT 100
    `,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Emails</h2>
          <QuotaBadge tier={quota.tier} used={quota.used} limit={quota.limit} />
        </div>
        <Button asChild>
          <Link href={`/${params.communitySlug}/admin/emails/new`}>+ New email</Link>
        </Button>
      </div>
      <BroadcastHistoryList broadcasts={broadcasts} communitySlug={params.communitySlug} />
    </div>
  );
}
