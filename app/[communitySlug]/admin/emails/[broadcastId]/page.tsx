import Link from 'next/link';
import { queryOne } from '@/lib/db';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface BroadcastRow {
  id: string;
  subject: string;
  html_content: string;
  preview_text: string | null;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<BroadcastRow['status'], string> = {
  pending: 'Draft',
  sending: 'Sending',
  sent: 'Published',
  partial_failure: 'Partial delivery',
  failed: 'Failed',
};

const STATUS_DOT: Record<BroadcastRow['status'], string> = {
  pending: 'bg-slate-400',
  sending: 'bg-primary animate-pulse',
  sent: 'bg-emerald-500',
  partial_failure: 'bg-amber-500',
  failed: 'bg-rose-500',
};

export default async function BroadcastDetailPage({
  params,
}: {
  params: { communitySlug: string; broadcastId: string };
}) {
  const community = await queryOne<{ id: string; name: string }>`
    SELECT id, name FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const broadcast = await queryOne<BroadcastRow>`
    SELECT * FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) {
    return (
      <div className="py-16">
        <p className="font-display text-2xl mb-2">Broadcast not found.</p>
        <Link
          href={`/${params.communitySlug}/admin/emails`}
          className="text-sm text-primary hover:underline"
        >
          ← Back to archive
        </Link>
      </div>
    );
  }

  const when = broadcast.sent_at ?? broadcast.created_at;
  const whenObj = new Date(when);
  const whenLong = format(whenObj, "MMMM d, yyyy 'at' h:mm a");

  return (
    <article className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <Link
        href={`/${params.communitySlug}/admin/emails`}
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors mb-10"
      >
        <span className="mr-1.5">←</span>
        Back to archive
      </Link>

      {/* Masthead */}
      <header className="mb-10 pb-8 border-b border-border/60">
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[broadcast.status]}`} />
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            {STATUS_LABEL[broadcast.status]} · {community.name}
          </span>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground mb-6">
          {broadcast.subject || 'Untitled'}
        </h1>

        {broadcast.preview_text && (
          <p className="font-display text-lg text-muted-foreground italic mb-6 max-w-2xl leading-snug">
            {broadcast.preview_text}
          </p>
        )}

        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-0.5">
              {broadcast.sent_at ? 'Sent' : 'Created'}
            </dt>
            <dd className="text-foreground tabular-nums">{whenLong}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-0.5">
              Readers
            </dt>
            <dd className="text-foreground tabular-nums">
              {broadcast.recipient_count}
            </dd>
          </div>
        </dl>

        {broadcast.error_message && (
          <div className="mt-6 border-l-2 border-rose-400 pl-4 py-2 bg-rose-50/50">
            <p className="text-[10px] uppercase tracking-[0.14em] text-rose-700 font-medium mb-1">
              Delivery note
            </p>
            <p className="text-sm text-rose-800">{broadcast.error_message}</p>
          </div>
        )}
      </header>

      {/* The issue itself — framed like a published page */}
      <div className="mx-auto max-w-2xl">
        <div className="relative bg-white border border-border/60 shadow-[0_2px_24px_-8px_rgba(80,40,120,0.15)] rounded-sm">
          <div
            className="prose prose-sm sm:prose-base max-w-none p-8 sm:p-12
              prose-headings:font-display prose-headings:text-foreground
              prose-p:text-foreground/90 prose-a:text-primary
              prose-strong:text-foreground prose-img:rounded"
            dangerouslySetInnerHTML={{ __html: broadcast.html_content }}
          />
        </div>
        <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-6">
          — End of broadcast —
        </p>
      </div>
    </article>
  );
}
