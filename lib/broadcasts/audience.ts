// Who a broadcast goes to. No database here, so routes and tests can use it freely.

/** Who a broadcast goes to. */
export const AUDIENCES = ['all', 'paying', 'canceling'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const isAudience = (v: unknown): v is Audience => (AUDIENCES as readonly unknown[]).includes(v);

/** Paying = a paid subscription that's still running (canceling ones too, they paid for this period). */
export function inAudience(row: { subscription_status?: string | null; has_subscription?: boolean | null }, audience: Audience): boolean {
  if (audience === 'paying') return !!row.has_subscription && (row.subscription_status === 'active' || row.subscription_status === 'canceling');
  if (audience === 'canceling') return row.subscription_status === 'canceling';
  return true;
}

