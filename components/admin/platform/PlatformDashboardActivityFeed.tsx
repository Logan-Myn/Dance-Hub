import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardHead } from '@/components/community-admin/ui';
import { InitialsAvatar } from '@/components/ds/initials-avatar';
import { communityPath } from '@/lib/safe-redirect';
import type { PlatformActivityEvent } from '@/lib/admin-platform/types';
import { cn } from '@/lib/utils';

const LINK = 'font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]';

export function PlatformDashboardActivityFeed({ events }: { events: PlatformActivityEvent[] }) {
  return (
    <Card as="section" aria-labelledby="platform-activity-h">
      <CardHead id="platform-activity-h" title="Recent activity" />
      {events.length === 0 ? (
        <p className="px-5 pb-6 pt-3 text-[14.5px] text-ink-2">Nothing yet. Sign-ups, new communities and failed payments show up here.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {events.map((e, i) => (
            <ActivityRow key={`${e.type}-${e.at.getTime()}-${i}`} event={e} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityRow({ event }: { event: PlatformActivityEvent }) {
  const ago = formatDistanceToNow(event.at, { addSuffix: true });
  let picture: React.ReactNode;
  let text: React.ReactNode;

  if (event.type === 'failed_payment') {
    picture = <Badge className="bg-live-soft text-live"><AlertTriangle className="h-4 w-4" /></Badge>;
    text = (
      <>
        <span className="font-semibold">{event.displayName}</span>&apos;s payment of €{event.amount.toFixed(2)} failed
        {event.communitySlug && (
          <>
            {' '}in{' '}
            <Link href={communityPath(event.communitySlug)} className={LINK}>
              {event.communitySlug}
            </Link>
          </>
        )}
      </>
    );
  } else if (event.type === 'admin_action') {
    picture = <Badge className="bg-surface-2 text-ink-2"><ShieldCheck className="h-4 w-4" /></Badge>;
    text = (
      <>
        <span className="font-semibold">{event.adminName ?? 'An admin'}</span>{' '}
        <span className="text-ink-2">
          {event.action}
          {event.resourceType ? ` ${event.resourceType}` : ''}
        </span>
      </>
    );
  } else {
    picture = <InitialsAvatar id={event.userId} name={event.displayName} imageUrl={event.avatarUrl} size={34} />;
    text =
      event.type === 'signup' ? (
        <>
          <span className="font-semibold">{event.displayName}</span> <span className="text-ink-2">signed up</span>
        </>
      ) : (
        <>
          <span className="font-semibold">{event.displayName}</span> <span className="text-ink-2">created</span>{' '}
          <Link href={communityPath(event.communitySlug)} className={LINK}>
            {event.communityName}
          </Link>
        </>
      );
  }

  return (
    <li className={cn('flex items-center gap-3 px-5 py-3', event.type === 'failed_payment' && 'bg-live-soft/40')}>
      {picture}
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] text-ink">{text}</p>
        <p className="text-[12.5px] text-ink-3">{ago}</p>
      </div>
    </li>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full', className)}>
      {children}
    </span>
  );
}
