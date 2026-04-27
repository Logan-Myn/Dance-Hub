import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserPlus, UserMinus, MessageSquare, AlertTriangle } from 'lucide-react';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';

export function DashboardActivityFeed({
  events,
  communitySlug,
}: {
  events: ActivityEvent[];
  communitySlug: string;
}) {
  if (events.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border/50 p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Recent activity</h2>
        <p className="text-sm text-muted-foreground text-center py-8">No recent activity yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6">
      <h2 className="font-display text-lg font-semibold mb-4">Recent activity</h2>
      <ul className="space-y-3">
        {events.map((e, i) => (
          <ActivityRow key={`${e.type}-${e.at.getTime()}-${i}`} event={e} communitySlug={communitySlug} />
        ))}
      </ul>
    </div>
  );
}

function ActivityRow({ event, communitySlug }: { event: ActivityEvent; communitySlug: string }) {
  if (event.type === 'failed_payment') {
    return (
      <li className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/40 border border-amber-200/40">
        <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{event.displayName}</span>'s payment of €{event.amount.toFixed(2)} failed
          </p>
          <p className="text-xs text-muted-foreground">{formatDistanceToNow(event.at, { addSuffix: true })}</p>
        </div>
        <Link
          href={`/${communitySlug}/admin/members`}
          className="text-xs font-medium text-primary hover:underline self-center"
        >
          Resolve
        </Link>
      </li>
    );
  }

  const icon =
    event.type === 'join' ? <UserPlus className="h-4 w-4 text-primary" /> :
    event.type === 'cancel' ? <UserMinus className="h-4 w-4 text-muted-foreground" /> :
    <MessageSquare className="h-4 w-4 text-primary" />;

  const verb =
    event.type === 'join' ? 'joined' :
    event.type === 'cancel' ? 'cancelled' :
    `posted${event.type === 'post' && event.categoryName ? ` in ${event.categoryName}` : ''}`;

  const body = (
    <>
      <Avatar className="h-9 w-9 flex-shrink-0">
        {event.avatarUrl ? <AvatarImage src={event.avatarUrl} alt={event.displayName} /> : null}
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          {event.displayName[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{event.displayName}</span> {verb}
        </p>
        <p className="text-xs text-muted-foreground">{formatDistanceToNow(event.at, { addSuffix: true })}</p>
      </div>
      <div className="hidden sm:flex h-9 w-9 rounded-full bg-muted/50 items-center justify-center flex-shrink-0">
        {icon}
      </div>
    </>
  );

  if (event.type === 'post') {
    return (
      <li>
        <Link
          href={`/${communitySlug}?thread=${event.threadId}`}
          className="flex items-start gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-muted/40 transition-colors"
        >
          {body}
        </Link>
      </li>
    );
  }

  return <li className="flex items-start gap-3">{body}</li>;
}
