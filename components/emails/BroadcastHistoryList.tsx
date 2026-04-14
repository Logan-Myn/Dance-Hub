import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export interface BroadcastHistoryItem {
  id: string;
  subject: string;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  sent_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<BroadcastHistoryItem['status'], string> = {
  pending: 'Pending',
  sending: 'Sending…',
  sent: 'Sent',
  partial_failure: 'Partial delivery',
  failed: 'Failed',
};

const STATUS_COLOR: Record<BroadcastHistoryItem['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  sending: 'bg-indigo-100 text-indigo-800',
  sent: 'bg-emerald-100 text-emerald-800',
  partial_failure: 'bg-amber-100 text-amber-800',
  failed: 'bg-rose-100 text-rose-800',
};

export function BroadcastHistoryList({
  broadcasts, communitySlug,
}: { broadcasts: BroadcastHistoryItem[]; communitySlug: string }) {
  if (broadcasts.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No broadcasts yet.</p>;
  }

  return (
    <ul className="divide-y border rounded-lg">
      {broadcasts.map((b) => (
        <li key={b.id}>
          <Link
            href={`/${communitySlug}/admin/emails/${b.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{b.subject}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {b.sent_at
                  ? `Sent ${formatDistanceToNow(new Date(b.sent_at), { addSuffix: true })}`
                  : `Created ${formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}`}
                {' · '}
                {b.recipient_count} recipient{b.recipient_count === 1 ? '' : 's'}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[b.status]}`}>
              {STATUS_LABEL[b.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
