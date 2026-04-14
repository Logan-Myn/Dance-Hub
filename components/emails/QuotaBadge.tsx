import { cn } from '@/lib/utils';

export interface QuotaBadgeProps {
  tier: 'vip' | 'paid' | 'free';
  used: number;
  limit: number | null;
  className?: string;
}

export function QuotaBadge({ tier, used, limit, className }: QuotaBadgeProps) {
  if (tier === 'vip') {
    return (
      <span className={cn('inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-medium', className)}>
        VIP · Unlimited
      </span>
    );
  }
  if (tier === 'paid') {
    return (
      <span className={cn('inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-3 py-1 text-xs font-medium', className)}>
        Unlimited · {used} sent this month
      </span>
    );
  }
  const atLimit = limit !== null && used >= limit;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
      atLimit ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800',
      className
    )}>
      {used} / {limit} this month
    </span>
  );
}
