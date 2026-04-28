import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  UserPlus,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { PlatformActivityEvent } from '@/lib/admin-platform/types';

export function PlatformDashboardActivityFeed({
  events,
}: {
  events: PlatformActivityEvent[];
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6">
      <h2 className="font-display text-lg font-semibold mb-4">Recent activity</h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No recent activity yet
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((e, i) => (
            <ActivityRow key={`${e.type}-${e.at.getTime()}-${i}`} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ event }: { event: PlatformActivityEvent }) {
  const ago = formatDistanceToNow(event.at, { addSuffix: true });

  if (event.type === 'failed_payment') {
    return (
      <li className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/40 border border-amber-200/40">
        <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{event.displayName}</span>'s payment of €
            {event.amount.toFixed(2)} failed
            {event.communitySlug ? (
              <>
                {' '}in{' '}
                <Link
                  href={`/${event.communitySlug}`}
                  className="text-primary hover:underline font-medium"
                >
                  {event.communitySlug}
                </Link>
              </>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">{ago}</p>
        </div>
      </li>
    );
  }

  if (event.type === 'admin_action') {
    return (
      <li className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{event.adminName ?? 'Admin'}</span>{' '}
            <span className="text-muted-foreground">
              {event.action}
              {event.resourceType ? ` ${event.resourceType}` : ''}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{ago}</p>
        </div>
      </li>
    );
  }

  // signup or community_created
  const icon =
    event.type === 'signup' ? (
      <UserPlus className="h-4 w-4 text-primary" />
    ) : (
      <Sparkles className="h-4 w-4 text-secondary" />
    );

  return (
    <li className="flex items-start gap-3">
      <Avatar className="h-9 w-9 flex-shrink-0">
        {event.avatarUrl ? (
          <AvatarImage src={event.avatarUrl} alt={event.displayName} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          {event.displayName[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{event.displayName}</span>{' '}
          {event.type === 'signup' ? (
            <span className="text-muted-foreground">signed up</span>
          ) : (
            <>
              <span className="text-muted-foreground">created </span>
              <Link
                href={`/${event.communitySlug}`}
                className="text-primary hover:underline font-medium"
              >
                {event.communityName}
              </Link>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{ago}</p>
      </div>
      <div className="hidden sm:flex h-9 w-9 rounded-full bg-muted/50 items-center justify-center flex-shrink-0">
        {icon}
      </div>
    </li>
  );
}
