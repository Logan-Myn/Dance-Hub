import { InitialsAvatar } from '@/components/ds/initials-avatar';
import { formatAdminDate } from '@/lib/admin-platform/display';
import { cn } from '@/lib/utils';

/** A square picture for a community or course, or its first letter. */
export function Thumb({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  return imageUrl ? (
    <img src={imageUrl} alt="" loading="lazy" className={cn('h-9 w-9 shrink-0 rounded-[10px] object-cover', className)} />
  ) : (
    <span aria-hidden="true" className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft font-display text-[15px] font-semibold text-brand-ink', className)}>
      {name.charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** Picture, a name and a muted line under it. */
export function NameCell({
  title,
  sub,
  picture,
  width = 'max-w-[260px]',
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  picture?: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {picture}
      <div className={cn('flex min-w-0 flex-col', width)}>
        <span className="truncate font-semibold text-ink">{title}</span>
        {sub && <span className="truncate text-[13px] text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}

/** A person with their avatar. */
export function PersonCell({ id, name, sub, avatarUrl }: { id: string; name: string; sub?: string; avatarUrl: string | null }) {
  return <NameCell title={name} sub={sub} picture={<InitialsAvatar id={id} name={name} imageUrl={avatarUrl} size={32} />} width="max-w-[180px]" />;
}

export function NoneCell() {
  return <span className="text-[13.5px] text-ink-3">None</span>;
}

export function DateCell({ date }: { date: Date }) {
  return <span className="whitespace-nowrap text-ink-2">{formatAdminDate(date)}</span>;
}

/** A number with an icon in front. */
export function CountCell({ icon: Icon, value, tone }: { icon: React.ComponentType<{ className?: string }>; value: number; tone?: 'warn' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 tabular-nums', tone === 'warn' ? 'font-semibold text-warn' : 'text-ink-2')}>
      <Icon className={cn('h-3.5 w-3.5', tone === 'warn' ? 'text-warn' : 'text-ink-3')} aria-hidden="true" />
      {value.toLocaleString('en-GB')}
    </span>
  );
}
