import { cn } from '@/lib/utils';

export interface QuotaBadgeProps {
  tier: 'vip' | 'paid' | 'free';
  used: number;
  limit: number | null;
  className?: string;
}

/**
 * Narrative quota line — intentionally typographic, not a pill.
 * Use in the emails list hero and composer side panel.
 */
export function QuotaBadge({ tier, used, limit, className }: QuotaBadgeProps) {
  if (tier === 'vip') {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 align-middle" />
        <span className="text-foreground font-medium">VIP access</span>
        <span className="text-muted-foreground"> · unlimited broadcasts</span>
      </p>
    );
  }

  if (tier === 'paid') {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mr-2 align-middle" />
        <span className="text-foreground font-medium">Unlimited</span>
        <span className="text-muted-foreground">
          {' · '}
          {used} sent this month
        </span>
      </p>
    );
  }

  const atLimit = limit !== null && used >= limit;
  const dotColor = atLimit ? 'bg-amber-500' : 'bg-slate-400';

  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-2 align-middle', dotColor)} />
      <span className="text-foreground font-medium">
        {used} of {limit}
      </span>
      <span className="text-muted-foreground"> broadcasts this month</span>
    </p>
  );
}
