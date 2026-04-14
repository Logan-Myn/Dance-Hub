import Link from 'next/link';
import { queryOne, query } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';
import { QuotaBadge } from '@/components/emails/QuotaBadge';
import {
  BroadcastHistoryList,
  BroadcastHistoryItem,
} from '@/components/emails/BroadcastHistoryList';

export default async function EmailsListPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{ id: string; name: string }>`
    SELECT id, name FROM communities WHERE slug = ${params.communitySlug}
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
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="flex flex-wrap items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">
            {community.name}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
            Broadcasts
          </h1>
          <div className="mt-4">
            <QuotaBadge tier={quota.tier} used={quota.used} limit={quota.limit} />
          </div>
        </div>

        <Link
          href={`/${params.communitySlug}/admin/emails/new`}
          className="group inline-flex items-center gap-2 text-sm font-medium text-foreground border-b border-primary pb-1 hover:text-primary transition-colors"
        >
          <span>Write a broadcast</span>
          <span
            aria-hidden
            className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      </header>

      <section aria-label="Archive">
        <BroadcastHistoryList
          broadcasts={broadcasts}
          communitySlug={params.communitySlug}
        />
      </section>
    </div>
  );
}
