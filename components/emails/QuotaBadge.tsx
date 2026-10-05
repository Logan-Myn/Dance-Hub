import { Pill } from '@/components/ds/pill';
import { cn } from '@/lib/utils';

export interface QuotaBadgeProps {
  tier: 'vip' | 'paid' | 'free';
  used: number;
  limit: number | null;
  className?: string;
}

/** How many emails the owner can still send this month. */
export function QuotaBadge({ tier, used, limit, className }: QuotaBadgeProps) {
  if (tier === 'vip' || tier === 'paid') {
    return (
      <p className={cn('flex items-center gap-2 text-[13.5px] text-ink-2', className)}>
        <Pill variant="ok">Unlimited</Pill>
        {used} sent this month
      </p>
    );
  }
  const atLimit = limit !== null && used >= limit;
  return (
    <p className={cn('flex items-center gap-2 text-[13.5px] text-ink-2', className)}>
      <Pill variant={atLimit ? 'warn' : 'neutral'}>
        {used} of {limit}
      </Pill>
      emails this month
    </p>
  );
}
