import { requireCommunityManagerPage } from '@/lib/community-auth';
import Link from 'next/link';
import { queryOne } from '@/lib/db';
import { getCommunityBySlug } from '@/lib/community-data';
import { ChevronLeft } from 'lucide-react';
import { BTN_GHOST } from '@/components/community-feed/feed-header';
import { Card, Screen, ScreenHead } from '@/components/community-admin/ui';
import { AUDIENCE_LABEL } from '@/components/emails/BroadcastHistoryList';
import { EmptyState } from '@/components/ds/empty-state';
import { Pill, type PillVariant } from '@/components/ds/pill';
import type { Audience } from '@/lib/broadcasts/audience';
import { buildBroadcastPreviewDocument } from '@/lib/broadcasts/preview-document';

export const dynamic = 'force-dynamic';

interface BroadcastRow {
  id: string;
  subject: string;
  html_content: string;
  preview_text: string | null;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  error_message: string | null;
  audience?: Audience | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS: Record<BroadcastRow['status'], [PillVariant, string]> = {
  pending: ['muted', 'Draft'],
  sending: ['brand', 'Sending'],
  sent: ['ok', 'Sent'],
  partial_failure: ['warn', 'Partly sent'],
  failed: ['live', 'Not sent'],
};

export default async function BroadcastDetailPage(
  props: {
    params: Promise<{ communitySlug: string; broadcastId: string }>;
  }
) {
  const params = await props.params;
  await requireCommunityManagerPage(params.communitySlug);
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  const broadcast = await queryOne<BroadcastRow>`
    SELECT * FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  const back = (
    <Link href={`/${params.communitySlug}/admin/emails`} className={BTN_GHOST}>
      <ChevronLeft aria-hidden="true" />
      Back to emails
    </Link>
  );
  if (!broadcast) {
    return (
      <Screen>
        <EmptyState title="This email doesn't exist" actions={back}>
          It may have been sent from another community.
        </EmptyState>
      </Screen>
    );
  }

  const [variant, label] = STATUS[broadcast.status];
  const when = new Date(broadcast.sent_at ?? broadcast.created_at).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return (
    <Screen>
      <ScreenHead title={broadcast.subject || 'Untitled'} sub={broadcast.preview_text ?? undefined} actions={back} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-ink-2">
        <Pill variant={variant}>{label}</Pill>
        <span className="tabular-nums">
          {broadcast.sent_at ? 'Sent' : 'Created'} {when} UTC
        </span>
        <span className="tabular-nums">
          {broadcast.recipient_count} {broadcast.recipient_count === 1 ? 'member' : 'members'}
          {broadcast.audience && broadcast.audience !== 'all' ? `, ${AUDIENCE_LABEL[broadcast.audience].toLowerCase()}` : ''}
        </span>
      </div>
      {broadcast.error_message && (
        <p className="rounded-xl border border-live/25 bg-live-soft px-4 py-3 text-[14px] text-ink">
          <strong className="block text-live">Delivery note</strong>
          {broadcast.error_message}
        </p>
      )}
      <Card className="mx-auto w-full max-w-2xl overflow-hidden">
        {/* Owner-written HTML: sanitized, and framed with no scripts and an
            opaque origin, so it cannot act in the viewer's session. */}
        <iframe
          title={broadcast.subject || 'Email'}
          srcDoc={buildBroadcastPreviewDocument(broadcast.html_content)}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="block h-[70vh] min-h-[480px] w-full border-0 bg-white"
        />
      </Card>
    </Screen>
  );
}
