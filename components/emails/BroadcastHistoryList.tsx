import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Card } from '@/components/community-admin/ui';
import { EmptyState } from '@/components/ds/empty-state';
import { Pill, type PillVariant } from '@/components/ds/pill';
import type { Audience } from '@/lib/broadcasts/audience';

export interface BroadcastHistoryItem {
  id: string;
  subject: string;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  sent_at: string | null;
  created_at: string;
  audience?: Audience | null;
}

const STATUS: Record<BroadcastHistoryItem['status'], [PillVariant, string]> = {
  pending: ['muted', 'Draft'],
  sending: ['brand', 'Sending'],
  sent: ['ok', 'Sent'],
  partial_failure: ['warn', 'Partly sent'],
  failed: ['live', 'Not sent'],
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'All members',
  paying: 'Paying members',
  canceling: 'Members who are canceling',
};

export function BroadcastHistoryList({
  broadcasts,
  communitySlug,
}: {
  broadcasts: BroadcastHistoryItem[];
  communitySlug: string;
}) {
  if (broadcasts.length === 0) {
    return (
      <EmptyState icon={<Mail className="h-7 w-7" />} title="No emails yet">
        Use emails for things members shouldn&apos;t miss: a new course, a schedule change, a special event.
      </EmptyState>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {broadcasts.map((b) => {
          const [variant, label] = STATUS[b.status];
          const date = new Date(b.sent_at ?? b.created_at);
          return (
            <li key={b.id}>
              <Link
                href={`/${communitySlug}/admin/emails/${b.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_200px_110px_96px]"
              >
                <strong className="truncate text-[15px] font-semibold text-ink">{b.subject || 'Untitled'}</strong>
                <span className="hidden truncate text-[13.5px] text-ink-2 sm:block">
                  {b.recipient_count} {b.recipient_count === 1 ? 'member' : 'members'}
                  {b.audience && b.audience !== 'all' ? `, ${AUDIENCE_LABEL[b.audience].toLowerCase()}` : ''}
                </span>
                <span className="justify-self-end sm:justify-self-start">
                  <Pill variant={variant}>{label}</Pill>
                </span>
                <span className="col-span-2 text-[13px] tabular-nums text-ink-3 sm:col-span-1 sm:text-right">
                  {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
