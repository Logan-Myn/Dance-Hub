import Link from 'next/link';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ArrowUpRight } from 'lucide-react';

export interface BroadcastHistoryItem {
  id: string;
  subject: string;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  sent_at: string | null;
  created_at: string;
}

const STATUS_META: Record<
  BroadcastHistoryItem['status'],
  { label: string; dot: string; text: string }
> = {
  pending: { label: 'Draft', dot: 'bg-slate-400', text: 'text-slate-600' },
  sending: { label: 'Sending', dot: 'bg-primary animate-pulse', text: 'text-primary' },
  sent: { label: 'Published', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  partial_failure: { label: 'Partial delivery', dot: 'bg-amber-500', text: 'text-amber-700' },
  failed: { label: 'Failed', dot: 'bg-rose-500', text: 'text-rose-700' },
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
      <div className="py-16 border-t border-border/50">
        <p className="font-display text-2xl text-foreground/80 mb-2">
          Nothing published yet.
        </p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your archive will live here. Start with a welcome note, a class
          announcement, or a Sunday recap.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {broadcasts.map((b) => {
        const status = STATUS_META[b.status];
        const date = b.sent_at ?? b.created_at;
        const dateObj = new Date(date);
        const absolute = format(dateObj, 'MMM d, yyyy');
        const relative = formatDistanceToNowStrict(dateObj, { addSuffix: true });

        return (
          <li key={b.id}>
            <Link
              href={`/${communitySlug}/admin/emails/${b.id}`}
              className="group grid grid-cols-[1fr_auto] items-baseline gap-6 py-5 transition-colors hover:bg-muted/20 -mx-2 px-2 rounded-sm"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot} shrink-0 translate-y-[-2px]`} />
                  <span className={`text-[10px] uppercase tracking-[0.14em] font-medium ${status.text}`}>
                    {status.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    · {b.recipient_count} {b.recipient_count === 1 ? 'reader' : 'readers'}
                  </span>
                </div>
                <h3 className="font-display text-xl sm:text-2xl leading-tight text-foreground truncate group-hover:text-primary transition-colors">
                  {b.subject || 'Untitled'}
                </h3>
              </div>

              <div className="text-right shrink-0 self-center">
                <p className="text-sm text-foreground tabular-nums">{absolute}</p>
                <p className="text-xs text-muted-foreground">{relative}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
