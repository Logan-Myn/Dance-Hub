# Admin Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken 4-tile KPI grid at `/[communitySlug]/admin/page.tsx` with an adaptive 5-tile overview, a tabbed Recharts card (revenue 6m / member growth 90d), and a 10-event recent-activity feed. Add a Dashboard link to AdminNav.

**Architecture:** Server component orchestrates data; pure helpers in `lib/admin-dashboard/` compute stats and activity events (Postgres + Stripe). Tiles and feed are server-rendered; the chart is the only client island. Adaptive to free vs paid communities via `community.membership_enabled`. Reference spec: `docs/superpowers/specs/2026-04-27-admin-dashboard-redesign-design.md`.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind · Postgres via `@/lib/db` (`queryOne`, `query`, tagged-template SQL) · Stripe Connect via `@/lib/stripe` · Recharts (new dep) · Jest + @testing-library/react.

**Working environment:** All edits + builds happen in the preprod worktree at `/home/debian/apps/dance-hub-preprod` (current branch `feat/admin-dashboard-redesign`). NEVER `bun run build` in `/home/debian/apps/dance-hub` — pm2 serves prod from there.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | modify | Add `recharts` dependency |
| `components/admin/AdminNav.tsx` | modify | Add Dashboard link as first item; fix active matching for the index path |
| `lib/admin-dashboard/stats.ts` | create | Pure helpers: month range, MoM math, revenue (current + chart), member growth series |
| `lib/admin-dashboard/activity-feed.ts` | create | Build + merge event lists (joins, cancellations, posts, failed payments) |
| `lib/admin-dashboard/types.ts` | create | Shared types: `Tile`, `RevenuePoint`, `GrowthPoint`, `ActivityEvent` |
| `__tests__/lib/admin-dashboard/stats.test.ts` | create | Unit tests for stats helpers |
| `__tests__/lib/admin-dashboard/activity-feed.test.ts` | create | Unit tests for activity-feed helpers |
| `components/admin/DashboardKpis.tsx` | rewrite | Adaptive 5-tile grid (paid) / 3-tile (free); server-renderable |
| `components/admin/DashboardChart.tsx` | create | Client island, Recharts + Tabs (Revenue 6m / Members 90d) |
| `components/admin/DashboardActivityFeed.tsx` | create | Server component, renders the merged event list with plain-language rows |
| `app/[communitySlug]/admin/page.tsx` | rewrite | Orchestrate community + stats + feed in a single Promise.all; render the three sections |

Out of scope (follow-up): delete dead `app/api/community/[communitySlug]/stripe-revenue/route.ts` and `app/api/community/[communitySlug]/stats/route.ts` — leaving them for a separate cleanup PR.

---

## Task 1: Add Recharts dependency

**Files:**
- Modify: `package.json`, `bun.lockb`

- [ ] **Step 1: Install recharts**

```bash
cd /home/debian/apps/dance-hub-preprod && bun add recharts
```

Expected: `package.json` adds `"recharts"` under `dependencies` (version 2.x.x); `bun.lockb` updated.

- [ ] **Step 2: Verify it imports**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i recharts
```

Expected: no output (no recharts errors).

- [ ] **Step 3: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add package.json bun.lockb && git commit -m "chore: add recharts for admin dashboard charts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add Dashboard nav link

**Files:**
- Modify: `components/admin/AdminNav.tsx`

The current nav doesn't include Dashboard, and active matching uses `startsWith()` — which would always match for the index path `/${slug}/admin`. We add Dashboard first and switch to exact match for that one item.

- [ ] **Step 1: Update nav items + active matching**

Replace the body of `AdminNav` with:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AdminNav({
  communitySlug,
  communityName,
}: {
  communitySlug: string;
  communityName: string;
}) {
  const pathname = usePathname();
  const items = [
    { href: `/${communitySlug}/admin`,                   label: 'Dashboard',       exact: true  },
    { href: `/${communitySlug}/admin/general`,           label: 'General',         exact: false },
    { href: `/${communitySlug}/admin/members`,           label: 'Members',         exact: false },
    { href: `/${communitySlug}/admin/subscriptions`,     label: 'Subscriptions',   exact: false },
    { href: `/${communitySlug}/admin/thread-categories`, label: 'Thread Categories', exact: false },
    { href: `/${communitySlug}/admin/emails`,            label: 'Broadcasts',      exact: false },
  ];

  return (
    <nav className="w-full md:w-48 md:shrink-0">
      <p className="hidden md:block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3 pl-1">
        {communityName}
      </p>
      <ul className="flex md:flex-col gap-0.5 overflow-x-auto scrollbar-hide md:overflow-visible -mx-1 px-1 pb-1 md:pb-0 md:mx-0 md:px-0">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center gap-2 pl-3 pr-3 py-2 text-sm transition-colors relative whitespace-nowrap rounded-md md:rounded-none min-h-[44px] md:min-h-0',
                  active
                    ? 'text-foreground font-medium bg-muted md:bg-transparent'
                    : 'text-muted-foreground hover:text-foreground md:hover:bg-transparent'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'hidden md:block absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full transition-all',
                    active
                      ? 'bg-primary opacity-100'
                      : 'bg-primary/0 opacity-0 group-hover:opacity-40'
                  )}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "AdminNav|admin/page" | head -5
```

Expected: no output (file is clean).

- [ ] **Step 3: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add components/admin/AdminNav.tsx && git commit -m "feat(admin): add Dashboard link to admin nav

Switch active-state matching to exact for the Dashboard root so it
doesn't always read as active while on subpages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stats helpers — month range + MoM growth (TDD)

**Files:**
- Create: `lib/admin-dashboard/types.ts`
- Create: `lib/admin-dashboard/stats.ts`
- Create: `__tests__/lib/admin-dashboard/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/admin-dashboard/stats.test.ts`:

```ts
import { getCalendarMonthRange, computeMoMGrowth } from '@/lib/admin-dashboard/stats';

describe('getCalendarMonthRange', () => {
  it('returns start of current month and start of next month with offset 0', () => {
    const now = new Date(2026, 3, 15); // April 15, 2026
    const { start, end } = getCalendarMonthRange(now, 0);
    expect(start).toEqual(new Date(2026, 3, 1));
    expect(end).toEqual(new Date(2026, 4, 1));
  });

  it('returns previous month with offset -1', () => {
    const now = new Date(2026, 3, 15);
    const { start, end } = getCalendarMonthRange(now, -1);
    expect(start).toEqual(new Date(2026, 2, 1));
    expect(end).toEqual(new Date(2026, 3, 1));
  });

  it('handles year boundary (January)', () => {
    const now = new Date(2026, 0, 15);
    const { start, end } = getCalendarMonthRange(now, -1);
    expect(start).toEqual(new Date(2025, 11, 1));
    expect(end).toEqual(new Date(2026, 0, 1));
  });
});

describe('computeMoMGrowth', () => {
  it('returns positive % when current > previous', () => {
    expect(computeMoMGrowth(120, 100)).toBe(20);
  });
  it('returns negative % when current < previous', () => {
    expect(computeMoMGrowth(75, 100)).toBe(-25);
  });
  it('returns 0 when both are 0', () => {
    expect(computeMoMGrowth(0, 0)).toBe(0);
  });
  it('returns 100 when previous is 0 and current is non-zero', () => {
    expect(computeMoMGrowth(50, 0)).toBe(100);
  });
  it('rounds to integer', () => {
    expect(computeMoMGrowth(10.7, 10)).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module '@/lib/admin-dashboard/stats'".

- [ ] **Step 3: Create types file**

Create `lib/admin-dashboard/types.ts`:

```ts
export type RevenuePoint = { month: string; revenue: number };
export type GrowthPoint = { date: string; count: number };
export type ActivityEvent =
  | { type: 'join'; at: Date; userId: string; displayName: string; avatarUrl: string | null }
  | { type: 'cancel'; at: Date; userId: string; displayName: string; avatarUrl: string | null }
  | { type: 'post'; at: Date; userId: string; displayName: string; avatarUrl: string | null; threadId: string; categoryName: string | null }
  | { type: 'failed_payment'; at: Date; userId: string | null; displayName: string; amount: number };
```

- [ ] **Step 4: Implement helpers**

Create `lib/admin-dashboard/stats.ts`:

```ts
/**
 * Calendar month range. start is inclusive (1st of month at 00:00 local),
 * end is exclusive (1st of the *next* month). offsetMonths shifts both by N.
 */
export function getCalendarMonthRange(
  now: Date = new Date(),
  offsetMonths: number = 0
): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1);
  return { start, end };
}

/**
 * Rounded percentage change. previous=0 with current>0 returns 100
 * (no baseline; treated as full growth). Both 0 returns 0.
 */
export function computeMoMGrowth(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) return 100;
  return 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts 2>&1 | tail -15
```

Expected: 8 passing tests.

- [ ] **Step 6: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add lib/admin-dashboard/types.ts lib/admin-dashboard/stats.ts __tests__/lib/admin-dashboard/stats.test.ts && git commit -m "feat(admin): stats helpers — month range + MoM growth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Stats helpers — revenue (current month + MoM) (TDD)

**Files:**
- Modify: `lib/admin-dashboard/stats.ts` (append)
- Modify: `__tests__/lib/admin-dashboard/stats.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/admin-dashboard/stats.test.ts`:

```ts
import { getMonthlyRevenue } from '@/lib/admin-dashboard/stats';

const mockChargesList = jest.fn();
const mockAccountsRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { retrieve: (...a: unknown[]) => mockAccountsRetrieve(...a) },
    charges: { list: (...a: unknown[]) => mockChargesList(...a) },
  },
}));

describe('getMonthlyRevenue', () => {
  beforeEach(() => {
    mockChargesList.mockReset();
    mockAccountsRetrieve.mockReset();
  });

  it('returns 0/0 when stripeAccountId is null', async () => {
    const result = await getMonthlyRevenue(null, new Date(2026, 3, 15));
    expect(result).toEqual({ monthlyRevenue: 0, revenueGrowth: 0 });
    expect(mockAccountsRetrieve).not.toHaveBeenCalled();
  });

  it('returns 0/0 when account is not charges_enabled', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: false });
    const result = await getMonthlyRevenue('acct_x', new Date(2026, 3, 15));
    expect(result).toEqual({ monthlyRevenue: 0, revenueGrowth: 0 });
  });

  it('sums succeeded charges and computes MoM', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    mockChargesList
      .mockResolvedValueOnce({ data: [
        { status: 'succeeded', amount: 5000 },
        { status: 'succeeded', amount: 3000 },
        { status: 'failed',    amount: 1000 },
      ] })
      .mockResolvedValueOnce({ data: [
        { status: 'succeeded', amount: 4000 },
      ] });
    const result = await getMonthlyRevenue('acct_x', new Date(2026, 3, 15));
    expect(result.monthlyRevenue).toBe(80); // (5000+3000)/100
    expect(result.revenueGrowth).toBe(100); // (80-40)/40 = 100%
  });

  it('falls back to 0/0 when accounts.retrieve throws', async () => {
    mockAccountsRetrieve.mockRejectedValueOnce(new Error('stripe down'));
    const result = await getMonthlyRevenue('acct_x', new Date(2026, 3, 15));
    expect(result).toEqual({ monthlyRevenue: 0, revenueGrowth: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module '@/lib/admin-dashboard/stats'" or "getMonthlyRevenue is not a function".

- [ ] **Step 3: Implement helper**

Append to `lib/admin-dashboard/stats.ts`:

```ts
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

async function sumSucceeded(
  stripeAccountId: string,
  start: Date,
  end: Date
): Promise<number> {
  const charges = await stripe.charges.list(
    {
      created: {
        gte: Math.floor(start.getTime() / 1000),
        lt: Math.floor(end.getTime() / 1000),
      },
      limit: 100,
    },
    { stripeAccount: stripeAccountId }
  );
  return charges.data.reduce(
    (total: number, c: Stripe.Charge) =>
      c.status === 'succeeded' ? total + c.amount / 100 : total,
    0
  );
}

export async function getMonthlyRevenue(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<{ monthlyRevenue: number; revenueGrowth: number }> {
  if (!stripeAccountId) return { monthlyRevenue: 0, revenueGrowth: 0 };

  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) return { monthlyRevenue: 0, revenueGrowth: 0 };
  } catch {
    return { monthlyRevenue: 0, revenueGrowth: 0 };
  }

  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const [thisMonthRevenue, lastMonthRevenue] = await Promise.all([
    sumSucceeded(stripeAccountId, thisMonth.start, thisMonth.end),
    sumSucceeded(stripeAccountId, lastMonth.start, lastMonth.end),
  ]);

  return {
    monthlyRevenue: thisMonthRevenue,
    revenueGrowth: computeMoMGrowth(thisMonthRevenue, lastMonthRevenue),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts 2>&1 | tail -15
```

Expected: 12 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add lib/admin-dashboard/stats.ts __tests__/lib/admin-dashboard/stats.test.ts && git commit -m "feat(admin): getMonthlyRevenue helper with MoM growth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Stats helpers — 6-month revenue chart (TDD)

**Files:**
- Modify: `lib/admin-dashboard/stats.ts` (append)
- Modify: `__tests__/lib/admin-dashboard/stats.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { getRevenueChart6Months } from '@/lib/admin-dashboard/stats';

describe('getRevenueChart6Months', () => {
  beforeEach(() => {
    mockChargesList.mockReset();
    mockAccountsRetrieve.mockReset();
  });

  it('returns 6 zero points when stripeAccountId is null', async () => {
    const result = await getRevenueChart6Months(null, new Date(2026, 3, 15));
    expect(result).toHaveLength(6);
    expect(result.every((p) => p.revenue === 0)).toBe(true);
    expect(result[result.length - 1].month).toBe('2026-04');
    expect(result[0].month).toBe('2025-11');
  });

  it('queries Stripe per month and sums succeeded charges', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    // 6 months = 6 list calls. Earliest first.
    for (let i = 0; i < 6; i++) {
      mockChargesList.mockResolvedValueOnce({
        data: [{ status: 'succeeded', amount: (i + 1) * 1000 }],
      });
    }
    const result = await getRevenueChart6Months('acct_x', new Date(2026, 3, 15));
    expect(result.map((p) => p.revenue)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(result.map((p) => p.month)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    ]);
  });

  it('returns zero points when account is not charges_enabled', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: false });
    const result = await getRevenueChart6Months('acct_x', new Date(2026, 3, 15));
    expect(result.every((p) => p.revenue === 0)).toBe(true);
    expect(mockChargesList).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts -t "getRevenueChart6Months" 2>&1 | tail -10
```

Expected: FAIL — "getRevenueChart6Months is not a function".

- [ ] **Step 3: Implement helper**

Append to `lib/admin-dashboard/stats.ts`:

```ts
import type { RevenuePoint } from './types';

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getRevenueChart6Months(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<RevenuePoint[]> {
  // Build the 6 month markers (earliest first), -5..0
  const months = Array.from({ length: 6 }, (_, i) => getCalendarMonthRange(now, i - 5));
  const zeros: RevenuePoint[] = months.map((m) => ({ month: formatYearMonth(m.start), revenue: 0 }));

  if (!stripeAccountId) return zeros;
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) return zeros;
  } catch {
    return zeros;
  }

  const revenues = await Promise.all(
    months.map(({ start, end }) => sumSucceeded(stripeAccountId, start, end))
  );
  return months.map(({ start }, i) => ({
    month: formatYearMonth(start),
    revenue: revenues[i],
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts 2>&1 | tail -15
```

Expected: all stats.test.ts tests pass (15 total).

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add lib/admin-dashboard/stats.ts __tests__/lib/admin-dashboard/stats.test.ts && git commit -m "feat(admin): getRevenueChart6Months for revenue tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> **Note on pagination:** `sumSucceeded` uses `limit: 100`. If a single community ever has >100 charges in one month, that month's number will undercount. Acceptable for now; tracked as a follow-up to switch to `autoPagingEach` if any community exceeds it.

---

## Task 6: Stats helpers — member growth 90d series (TDD)

**Files:**
- Modify: `lib/admin-dashboard/stats.ts` (append)
- Modify: `__tests__/lib/admin-dashboard/stats.test.ts` (append)

The chart shows current active member count over the last 90 days. Computation: starting from the count of currently-active members, walk *backwards* through joins (subtract) and cancellations (add), giving the active count as it was on each prior day. Forward-render as a 90-element array.

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { buildMemberGrowthSeries } from '@/lib/admin-dashboard/stats';

describe('buildMemberGrowthSeries', () => {
  it('produces a 90-day series ending at currentActive', () => {
    const now = new Date(2026, 3, 15); // Apr 15
    const series = buildMemberGrowthSeries({
      now,
      currentActiveCount: 10,
      joins: [],         // no joins in window
      cancellations: [], // no cancels in window
    });
    expect(series).toHaveLength(90);
    expect(series[series.length - 1].count).toBe(10);
    expect(series[0].count).toBe(10); // flat
  });

  it('walks back: a join 30 days ago means the count was 1 lower before that day', () => {
    const now = new Date(2026, 3, 15);
    const joinedAt = new Date(2026, 2, 16); // 30 days before
    const series = buildMemberGrowthSeries({
      now,
      currentActiveCount: 5,
      joins: [{ at: joinedAt }],
      cancellations: [],
    });
    expect(series[series.length - 1].count).toBe(5);          // today: 5
    expect(series[series.length - 30].count).toBe(5);         // join day: still 5 (event happened)
    expect(series[series.length - 31].count).toBe(4);         // day before: 4
    expect(series[0].count).toBe(4);                          // 90 days ago: 4
  });

  it('walks back: a cancellation 10 days ago means the count was 1 higher before that day', () => {
    const now = new Date(2026, 3, 15);
    const cancelledAt = new Date(2026, 3, 5); // 10 days before
    const series = buildMemberGrowthSeries({
      now,
      currentActiveCount: 7,
      joins: [],
      cancellations: [{ at: cancelledAt }],
    });
    expect(series[series.length - 1].count).toBe(7);   // today
    expect(series[series.length - 10].count).toBe(7);  // cancel day: 7 (event applied)
    expect(series[series.length - 11].count).toBe(8);  // day before: 8
  });

  it('clamps at 0 (never returns negative counts)', () => {
    const now = new Date(2026, 3, 15);
    const cancelledAt = new Date(2026, 3, 5);
    const series = buildMemberGrowthSeries({
      now,
      currentActiveCount: 0,
      joins: [],
      cancellations: [{ at: cancelledAt }],
    });
    // walking back, day-before-cancel would be 1 (recovered) which is fine
    // but day-before-90d-with-extra-cancels stays >= 0
    expect(series.every((p) => p.count >= 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts -t "buildMemberGrowthSeries" 2>&1 | tail -10
```

Expected: FAIL — "buildMemberGrowthSeries is not a function".

- [ ] **Step 3: Implement helper**

Append to `lib/admin-dashboard/stats.ts`:

```ts
import type { GrowthPoint } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Builds a 90-day cumulative active-member-count series ending today.
 * Algorithm: start from the current active count and walk *backward*
 * through events. A join in the window means the count was 1 lower
 * BEFORE the join day; a cancellation means it was 1 higher before
 * the cancel day. Then write counts forward into the result array.
 */
export function buildMemberGrowthSeries({
  now,
  currentActiveCount,
  joins,
  cancellations,
}: {
  now: Date;
  currentActiveCount: number;
  joins: { at: Date }[];
  cancellations: { at: Date }[];
}): GrowthPoint[] {
  const today = startOfDay(now);
  const startDay = new Date(today.getTime() - 89 * DAY_MS);

  // Initialize each day with the *current* count; we'll subtract later.
  const days: GrowthPoint[] = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(startDay.getTime() + i * DAY_MS);
    days.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      count: currentActiveCount,
    });
  }

  // For each event in the window, retroactively adjust earlier days.
  // A join on day J means days BEFORE J had one fewer member.
  for (const j of joins) {
    const jDay = startOfDay(j.at);
    if (jDay.getTime() < startDay.getTime() || jDay.getTime() > today.getTime()) continue;
    const idx = Math.round((jDay.getTime() - startDay.getTime()) / DAY_MS);
    for (let i = 0; i < idx; i++) days[i].count -= 1;
  }
  // A cancel on day C means days BEFORE C had one more member.
  for (const c of cancellations) {
    const cDay = startOfDay(c.at);
    if (cDay.getTime() < startDay.getTime() || cDay.getTime() > today.getTime()) continue;
    const idx = Math.round((cDay.getTime() - startDay.getTime()) / DAY_MS);
    for (let i = 0; i < idx; i++) days[i].count += 1;
  }

  // Clamp at 0 (defensive; cancellations of members that joined before the window
  // could push values negative if data is messy).
  for (const d of days) if (d.count < 0) d.count = 0;
  return days;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/stats.test.ts 2>&1 | tail -15
```

Expected: all stats.test.ts tests pass (19 total).

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add lib/admin-dashboard/stats.ts __tests__/lib/admin-dashboard/stats.test.ts && git commit -m "feat(admin): buildMemberGrowthSeries for the Members chart

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Activity-feed helpers — merge events (TDD)

**Files:**
- Create: `lib/admin-dashboard/activity-feed.ts`
- Create: `__tests__/lib/admin-dashboard/activity-feed.test.ts`

This task adds the pure merge-and-truncate function. The DB/Stripe queries that produce the inputs live directly in the page (one DB query per type), and we test the merge logic in isolation.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/admin-dashboard/activity-feed.test.ts`:

```ts
import { mergeActivityEvents } from '@/lib/admin-dashboard/activity-feed';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';

const make = (overrides: Partial<ActivityEvent>): ActivityEvent =>
  ({
    type: 'join',
    at: new Date(2026, 3, 1),
    userId: 'u1',
    displayName: 'X',
    avatarUrl: null,
    ...overrides,
  } as ActivityEvent);

describe('mergeActivityEvents', () => {
  it('merges multiple lists, sorts DESC by at, caps at limit', () => {
    const a: ActivityEvent[] = [
      make({ at: new Date('2026-04-10T09:00:00Z'), userId: 'a1' }),
      make({ at: new Date('2026-04-05T09:00:00Z'), userId: 'a2' }),
    ];
    const b: ActivityEvent[] = [
      make({ at: new Date('2026-04-12T09:00:00Z'), userId: 'b1', type: 'cancel' }),
      make({ at: new Date('2026-04-08T09:00:00Z'), userId: 'b2', type: 'cancel' }),
    ];
    const result = mergeActivityEvents([a, b], 3);
    expect(result.map((e) => e.userId)).toEqual(['b1', 'a1', 'b2']);
  });

  it('returns empty array when all inputs empty', () => {
    expect(mergeActivityEvents([[], [], []], 10)).toEqual([]);
  });

  it('preserves stable order between same-timestamp events', () => {
    const t = new Date('2026-04-12T09:00:00Z');
    const a: ActivityEvent[] = [make({ at: t, userId: 'a1' })];
    const b: ActivityEvent[] = [make({ at: t, userId: 'b1' })];
    const result = mergeActivityEvents([a, b], 10);
    expect(result.map((e) => e.userId)).toEqual(['a1', 'b1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/activity-feed.test.ts 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module '@/lib/admin-dashboard/activity-feed'".

- [ ] **Step 3: Implement merge helper**

Create `lib/admin-dashboard/activity-feed.ts`:

```ts
import type { ActivityEvent } from './types';

/**
 * Concatenate event lists, sort newest-first by `at`, slice to `limit`.
 * Stable: equal timestamps keep their relative input order.
 */
export function mergeActivityEvents(
  lists: ActivityEvent[][],
  limit: number
): ActivityEvent[] {
  const flat: { event: ActivityEvent; idx: number }[] = [];
  let counter = 0;
  for (const list of lists) {
    for (const event of list) {
      flat.push({ event, idx: counter++ });
    }
  }
  flat.sort((a, b) => {
    const diff = b.event.at.getTime() - a.event.at.getTime();
    return diff !== 0 ? diff : a.idx - b.idx;
  });
  return flat.slice(0, limit).map((x) => x.event);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/activity-feed.test.ts 2>&1 | tail -15
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add lib/admin-dashboard/activity-feed.ts __tests__/lib/admin-dashboard/activity-feed.test.ts && git commit -m "feat(admin): mergeActivityEvents helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Activity-feed helper — getRecentFailedPayments (TDD)

**Files:**
- Modify: `lib/admin-dashboard/activity-feed.ts` (append)
- Modify: `__tests__/lib/admin-dashboard/activity-feed.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { getRecentFailedPayments } from '@/lib/admin-dashboard/activity-feed';

const mockChargesList = jest.fn();
const mockAccountsRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { retrieve: (...a: unknown[]) => mockAccountsRetrieve(...a) },
    charges: { list: (...a: unknown[]) => mockChargesList(...a) },
  },
}));

describe('getRecentFailedPayments', () => {
  beforeEach(() => {
    mockChargesList.mockReset();
    mockAccountsRetrieve.mockReset();
  });

  it('returns [] when stripeAccountId is null', async () => {
    const result = await getRecentFailedPayments(null);
    expect(result).toEqual([]);
    expect(mockChargesList).not.toHaveBeenCalled();
  });

  it('returns [] when account is not charges_enabled', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: false });
    const result = await getRecentFailedPayments('acct_x');
    expect(result).toEqual([]);
  });

  it('maps failed charges to ActivityEvent rows', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    const t = new Date('2026-04-12T09:00:00Z');
    mockChargesList.mockResolvedValueOnce({
      data: [
        {
          status: 'failed',
          amount: 1500,
          created: Math.floor(t.getTime() / 1000),
          billing_details: { name: 'Anna Test' },
          metadata: { user_id: 'u1' },
        },
      ],
    });
    const result = await getRecentFailedPayments('acct_x');
    expect(result).toEqual([
      {
        type: 'failed_payment',
        at: t,
        userId: 'u1',
        displayName: 'Anna Test',
        amount: 15,
      },
    ]);
  });

  it('falls back to "Unknown" displayName when billing_details.name is missing', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    mockChargesList.mockResolvedValueOnce({
      data: [{ status: 'failed', amount: 1000, created: 1700000000, billing_details: {}, metadata: {} }],
    });
    const result = await getRecentFailedPayments('acct_x');
    expect(result[0].displayName).toBe('Unknown');
    expect(result[0].userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/activity-feed.test.ts -t "getRecentFailedPayments" 2>&1 | tail -10
```

Expected: FAIL — "getRecentFailedPayments is not a function".

- [ ] **Step 3: Implement helper**

Append to `lib/admin-dashboard/activity-feed.ts`:

```ts
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function getRecentFailedPayments(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<ActivityEvent[]> {
  if (!stripeAccountId) return [];
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) return [];
  } catch {
    return [];
  }

  const sinceSec = Math.floor(now.getTime() / 1000) - THIRTY_DAYS_SECONDS;
  const charges = await stripe.charges.list(
    { created: { gte: sinceSec }, limit: 10 },
    { stripeAccount: stripeAccountId }
  );

  return charges.data
    .filter((c: Stripe.Charge) => c.status === 'failed')
    .map((c: Stripe.Charge) => ({
      type: 'failed_payment' as const,
      at: new Date(c.created * 1000),
      userId: (c.metadata?.user_id as string | undefined) ?? null,
      displayName: c.billing_details?.name ?? 'Unknown',
      amount: c.amount / 100,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard/activity-feed.test.ts 2>&1 | tail -15
```

Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add lib/admin-dashboard/activity-feed.ts __tests__/lib/admin-dashboard/activity-feed.test.ts && git commit -m "feat(admin): getRecentFailedPayments for activity feed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Rewrite DashboardKpis — adaptive 5-tile grid

**Files:**
- Rewrite: `components/admin/DashboardKpis.tsx`

- [ ] **Step 1: Replace the file**

Replace `components/admin/DashboardKpis.tsx` with:

```tsx
import { Users, TrendingUp, TrendingDown, DollarSign, MessageSquare, UserMinus } from 'lucide-react';

export interface DashboardStats {
  isPaid: boolean;
  monthlyRevenue: number;        // EUR; 0 on free
  revenueGrowth: number;         // %; 0 on free
  membersTotal: number;          // currently active members, excl. creator
  membersPaying: number;         // subset; 0 on free
  newMembersThisMonth: number;
  newMembersGrowth: number;
  cancellationsThisMonth: number;     // 0 on free
  cancellationsLastMonth: number;     // 0 on free
  postsThreadsThisMonth: number;
  postsCommentsThisMonth: number;
}

export function DashboardKpis({ stats }: { stats: DashboardStats }) {
  const tiles: React.ReactNode[] = [];

  if (stats.isPaid) {
    tiles.push(
      <Tile
        key="revenue"
        label="Revenue this month"
        value={`€${stats.monthlyRevenue.toFixed(2)}`}
        sublineNumber={stats.revenueGrowth}
        sublineSuffix="vs last month"
        icon={<DollarSign className="h-5 w-5 text-secondary" />}
        iconBg="bg-secondary/20"
      />
    );
  }

  tiles.push(
    <Tile
      key="members"
      label="Members"
      value={stats.membersTotal.toString()}
      sublineText={stats.isPaid ? `${stats.membersPaying} paying` : undefined}
      icon={<Users className="h-5 w-5 text-primary" />}
      iconBg="bg-primary/10"
    />
  );

  tiles.push(
    <Tile
      key="new"
      label="New members this month"
      value={stats.newMembersThisMonth.toString()}
      sublineNumber={stats.newMembersGrowth}
      sublineSuffix="vs last month"
      icon={<TrendingUp className="h-5 w-5 text-primary" />}
      iconBg="bg-primary/10"
    />
  );

  if (stats.isPaid) {
    tiles.push(
      <Tile
        key="cancellations"
        label="Cancellations this month"
        value={stats.cancellationsThisMonth.toString()}
        sublineText={`${stats.cancellationsLastMonth} last month`}
        icon={<UserMinus className="h-5 w-5 text-secondary" />}
        iconBg="bg-secondary/20"
      />
    );
  }

  tiles.push(
    <Tile
      key="posts"
      label="Posts this month"
      value={`${stats.postsThreadsThisMonth} threads`}
      sublineText={`${stats.postsCommentsThisMonth} replies`}
      icon={<MessageSquare className="h-5 w-5 text-accent" />}
      iconBg="bg-accent/20"
    />
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tiles}
    </div>
  );
}

function Tile({
  label,
  value,
  sublineNumber,
  sublineSuffix,
  sublineText,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  sublineNumber?: number;
  sublineSuffix?: string;
  sublineText?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const showNumber = typeof sublineNumber === 'number';
  const isPositive = showNumber && (sublineNumber as number) >= 0;

  return (
    <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="font-display text-3xl font-bold text-foreground">{value}</p>
      {showNumber ? (
        <p className={`text-sm font-medium ${isPositive ? 'text-primary' : 'text-destructive'}`}>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 inline mr-1" />
          ) : (
            <TrendingDown className="h-4 w-4 inline mr-1" />
          )}
          {isPositive ? '+' : ''}
          {sublineNumber}% {sublineSuffix}
        </p>
      ) : sublineText ? (
        <p className="text-sm text-muted-foreground">{sublineText}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "DashboardKpis"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add components/admin/DashboardKpis.tsx && git commit -m "feat(admin): rewrite DashboardKpis as adaptive 5-tile grid

Drives tile visibility from stats.isPaid; plain-language labels; uses
TrendingDown for negative MoM growth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: DashboardChart client island

**Files:**
- Create: `components/admin/DashboardChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { RevenuePoint, GrowthPoint } from '@/lib/admin-dashboard/types';

export function DashboardChart({
  isPaid,
  revenue,
  growth,
}: {
  isPaid: boolean;
  revenue: RevenuePoint[];
  growth: GrowthPoint[];
}) {
  const hasGrowthData = growth.some((p) => p.count > 0);
  const hasRevenueData = revenue.some((p) => p.revenue > 0);

  if (!isPaid) {
    return (
      <div className="bg-card rounded-2xl border border-border/50 p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Member growth (last 90 days)</h2>
        {hasGrowthData ? <GrowthChart data={growth} /> : <EmptyState />}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6">
      <Tabs defaultValue="revenue">
        <TabsList className="mb-4">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue">
          {hasRevenueData ? <RevenueChart data={revenue} /> : <EmptyState />}
        </TabsContent>
        <TabsContent value="members">
          {hasGrowthData ? <GrowthChart data={growth} /> : <EmptyState />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
        <YAxis tickLine={false} axisLine={false} className="text-xs" tickFormatter={(v) => `€${v}`} />
        <Tooltip formatter={(v: number) => [`€${v.toFixed(2)}`, 'Revenue']} />
        <Bar dataKey="revenue" radius={[6, 6, 0, 0]} className="fill-primary" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} className="text-xs" interval={14} />
        <YAxis tickLine={false} axisLine={false} className="text-xs" allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="count" strokeWidth={2} dot={false} className="stroke-primary" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyState() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      Not enough data yet
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "DashboardChart"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add components/admin/DashboardChart.tsx && git commit -m "feat(admin): DashboardChart client island (Recharts + Tabs)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: DashboardActivityFeed server component

**Files:**
- Create: `components/admin/DashboardActivityFeed.tsx`

- [ ] **Step 1: Create the component**

```tsx
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

  return (
    <li className="flex items-start gap-3">
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
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "DashboardActivityFeed"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add components/admin/DashboardActivityFeed.tsx && git commit -m "feat(admin): DashboardActivityFeed server component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Wire up the dashboard page

**Files:**
- Rewrite: `app/[communitySlug]/admin/page.tsx`

- [ ] **Step 1: Replace the page**

```tsx
import { queryOne, query } from '@/lib/db';
import {
  getCalendarMonthRange,
  getMonthlyRevenue,
  getRevenueChart6Months,
  buildMemberGrowthSeries,
  computeMoMGrowth,
} from '@/lib/admin-dashboard/stats';
import {
  mergeActivityEvents,
  getRecentFailedPayments,
} from '@/lib/admin-dashboard/activity-feed';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';
import { DashboardKpis } from '@/components/admin/DashboardKpis';
import { DashboardChart } from '@/components/admin/DashboardChart';
import { DashboardActivityFeed } from '@/components/admin/DashboardActivityFeed';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type CommunityRow = {
  id: string;
  created_by: string;
  membership_enabled: boolean;
  stripe_account_id: string | null;
};

type MembersCounts = { total: number; paying: number };
type CountRow = { count: number };
type JoinEvent = { user_id: string; display_name: string | null; avatar_url: string | null; joined_at: Date };
type CancelEvent = { user_id: string; display_name: string | null; avatar_url: string | null; updated_at: Date };
type PostEvent = { id: string; user_id: string; author_name: string | null; author_image: string | null; category_name: string | null; created_at: Date };

export default async function AdminDashboardPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<CommunityRow>`
    SELECT id, created_by, membership_enabled, stripe_account_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const now = new Date();
  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    membersCountsRow,
    newMembersThisMonthRow,
    newMembersLastMonthRow,
    cancellationsThisMonthRow,
    cancellationsLastMonthRow,
    threadsRow,
    commentsRow,
    revenue,
    revenueChart,
    joinsLast90,
    cancelsLast90,
    recentJoinEvents,
    recentCancelEvents,
    recentPostEvents,
    failedPayments,
  ] = await Promise.all([
    queryOne<MembersCounts>`
      SELECT
        COUNT(*) FILTER (WHERE status='active')::int AS total,
        COUNT(*) FILTER (WHERE status='active' AND stripe_subscription_id IS NOT NULL)::int AS paying
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND joined_at >= ${thisMonth.start.toISOString()}
        AND joined_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND joined_at >= ${lastMonth.start.toISOString()}
        AND joined_at < ${lastMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
        AND updated_at >= ${thisMonth.start.toISOString()}
        AND updated_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
        AND updated_at >= ${lastMonth.start.toISOString()}
        AND updated_at < ${lastMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM threads
      WHERE community_id = ${community.id}
        AND created_at >= ${thisMonth.start.toISOString()}
        AND created_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM comments c
      JOIN threads t ON c.thread_id = t.id
      WHERE t.community_id = ${community.id}
        AND c.created_at >= ${thisMonth.start.toISOString()}
        AND c.created_at < ${thisMonth.end.toISOString()}
    `,
    getMonthlyRevenue(community.stripe_account_id, now),
    getRevenueChart6Months(community.stripe_account_id, now),
    query<{ joined_at: Date }>`
      SELECT joined_at
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND joined_at >= ${ninetyDaysAgo.toISOString()}
    `,
    query<{ updated_at: Date }>`
      SELECT updated_at
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
        AND updated_at >= ${ninetyDaysAgo.toISOString()}
    `,
    query<JoinEvent>`
      SELECT user_id, formatted_display_name AS display_name, avatar_url, joined_at
      FROM community_members_with_profiles
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
      ORDER BY joined_at DESC
      LIMIT 10
    `,
    query<CancelEvent>`
      SELECT user_id, formatted_display_name AS display_name, avatar_url, updated_at
      FROM community_members_with_profiles
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
      ORDER BY updated_at DESC
      LIMIT 10
    `,
    query<PostEvent>`
      SELECT id, user_id, author_name, author_image, category_name, created_at
      FROM threads
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
      LIMIT 10
    `,
    getRecentFailedPayments(community.stripe_account_id, now),
  ]);

  const membersTotal = membersCountsRow?.total ?? 0;
  const membersPaying = membersCountsRow?.paying ?? 0;
  const newMembersThisMonth = newMembersThisMonthRow?.count ?? 0;
  const newMembersLastMonth = newMembersLastMonthRow?.count ?? 0;
  const cancellationsThisMonth = cancellationsThisMonthRow?.count ?? 0;
  const cancellationsLastMonth = cancellationsLastMonthRow?.count ?? 0;
  const threadsThisMonth = threadsRow?.count ?? 0;
  const commentsThisMonth = commentsRow?.count ?? 0;

  const stats = {
    isPaid: community.membership_enabled,
    monthlyRevenue: revenue.monthlyRevenue,
    revenueGrowth: revenue.revenueGrowth,
    membersTotal,
    membersPaying,
    newMembersThisMonth,
    newMembersGrowth: computeMoMGrowth(newMembersThisMonth, newMembersLastMonth),
    cancellationsThisMonth,
    cancellationsLastMonth,
    postsThreadsThisMonth: threadsThisMonth,
    postsCommentsThisMonth: commentsThisMonth,
  };

  const growth = buildMemberGrowthSeries({
    now,
    currentActiveCount: membersTotal,
    joins: joinsLast90.map((r) => ({ at: new Date(r.joined_at) })),
    cancellations: cancelsLast90.map((r) => ({ at: new Date(r.updated_at) })),
  });

  const joins: ActivityEvent[] = recentJoinEvents.map((r) => ({
    type: 'join',
    at: new Date(r.joined_at),
    userId: r.user_id,
    displayName: r.display_name ?? 'Anonymous',
    avatarUrl: r.avatar_url,
  }));
  const cancels: ActivityEvent[] = recentCancelEvents.map((r) => ({
    type: 'cancel',
    at: new Date(r.updated_at),
    userId: r.user_id,
    displayName: r.display_name ?? 'Anonymous',
    avatarUrl: r.avatar_url,
  }));
  const posts: ActivityEvent[] = recentPostEvents.map((r) => ({
    type: 'post',
    at: new Date(r.created_at),
    userId: r.user_id,
    displayName: r.author_name ?? 'Anonymous',
    avatarUrl: r.author_image,
    threadId: r.id,
    categoryName: r.category_name,
  }));

  const events = mergeActivityEvents([joins, cancels, posts, failedPayments], 10);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Dashboard
        </h1>
      </header>

      <DashboardKpis stats={stats} />

      <DashboardChart isPaid={stats.isPaid} revenue={revenueChart} growth={growth} />

      <DashboardActivityFeed events={events} communitySlug={params.communitySlug} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "admin/page"
```

Expected: no output.

- [ ] **Step 3: Run all admin-dashboard tests**

```bash
cd /home/debian/apps/dance-hub-preprod && bunx jest __tests__/lib/admin-dashboard 2>&1 | tail -10
```

Expected: 22 passing tests across two files.

- [ ] **Step 4: Commit**

```bash
cd /home/debian/apps/dance-hub-preprod && git add app/\[communitySlug\]/admin/page.tsx && git commit -m "feat(admin): wire up dashboard page with new components

Single Promise.all orchestrates DB + Stripe queries; tile/chart/feed
components consume the assembled stats.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Build, deploy preprod, manual QA

**Files:** none

- [ ] **Step 1: Build in the worktree**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build 2>&1 | tail -20
```

Expected: build completes without errors. Look for `▲ Next.js` and `✓ Compiled successfully`.

- [ ] **Step 2: Push the branch**

```bash
cd /home/debian/apps/dance-hub-preprod && git push -u origin feat/admin-dashboard-redesign 2>&1 | tail -3
```

Expected: branch pushed (or already up-to-date).

- [ ] **Step 3: Deploy to preprod**

```bash
cd /home/debian/apps/dance-hub-preprod && ./deploy-preprod.sh restart feat/admin-dashboard-redesign 2>&1 | tail -10
```

Expected: `Done! Preprod restarted.` and pm2 process `dance-hub-preprod` online.

- [ ] **Step 4: Verify it serves**

```bash
sleep 3 && curl -sS -o /dev/null -w "preprod: HTTP %{http_code} | %{time_total}s\n" http://localhost:3009
```

Expected: `HTTP 200`.

- [ ] **Step 5: Manual QA — ask the user to verify**

Visit `https://preprod.dance-hub.io/<community-slug>/admin` for:

| Scenario | What to check |
|---|---|
| Paid community with active members + recent joins/cancellations | All 5 tiles populated; chart tabs both render; feed shows recent events |
| Free community (`membership_enabled=false`) | Revenue + Cancellations tiles hidden; chart card has no tabs (Members only) |
| Community with no `stripe_account_id` | Revenue tile shows €0.00 / +0%; failed-payments don't appear in feed |
| Brand-new community | Empty state for chart ("Not enough data yet"); empty state for feed ("No recent activity yet") |
| Nav | Dashboard link active when on `/admin`; subpages do NOT highlight Dashboard |

If anything renders wrong, fix in another task and redeploy preprod.

---

## Task 14: Ship to production

**Files:** none

- [ ] **Step 1: Open PR**

```bash
cd /home/debian/apps/dance-hub-preprod && gh pr create --base main --head feat/admin-dashboard-redesign --title "feat(admin): redesign community admin dashboard" --body "$(cat <<'EOF'
## Summary

Replaces the broken 4-tile KPI grid at `/[communitySlug]/admin` with:

- An adaptive 5-tile overview (3 tiles for free communities) — Revenue, Members, New members, Cancellations, Posts — all in plain language.
- A tabbed Recharts card: revenue last 6 months (paid only) + member growth last 90 days.
- A 10-event recent-activity feed: joins, cancellations, failed payments (highlighted), and new posts.
- A Dashboard link in the admin nav, with exact-match active state for the index path.

Spec: `docs/superpowers/specs/2026-04-27-admin-dashboard-redesign-design.md`
Plan: `docs/superpowers/plans/2026-04-27-admin-dashboard-redesign.md`

Validated on preprod (https://preprod.dance-hub.io).

## Test plan
- [ ] Paid community: all 5 tiles populated; both chart tabs render; feed shows recent events
- [ ] Free community: Revenue + Cancellations hidden; chart shows Members only (no tabs)
- [ ] Community without Stripe Connect: revenue gracefully shows €0.00 / +0%
- [ ] Brand-new community: empty states for chart + feed
- [ ] Dashboard nav link: active only on `/admin`, not on subpages

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 2: Squash-merge after user approval**

```bash
gh pr merge <PR-number> --squash 2>&1 | tail -5
```

Expected: merged.

- [ ] **Step 3: Deploy prod**

```bash
cd /home/debian/apps/dance-hub && ./deploy.sh code 2>&1 | tail -10
```

Expected: `Done! Redeployed.` and pm2 process `dance-hub` restarted.

- [ ] **Step 4: Verify prod**

```bash
sleep 3 && curl -sS -o /dev/null -w "prod: HTTP %{http_code} | %{time_total}s\n" https://dance-hub.io
```

Expected: `HTTP 200`.

- [ ] **Step 5: Clean up preprod worktree**

```bash
cd /home/debian/apps/dance-hub-preprod && git fetch origin && git checkout --detach origin/main && git fetch --prune origin && git branch -D feat/admin-dashboard-redesign 2>&1 | tail -3
```

Expected: HEAD detached on the new origin/main; merged branch deleted locally.

- [ ] **Step 6: Delete the abandoned `fix/dashboard-revenue` branch**

```bash
git push origin --delete fix/dashboard-revenue 2>&1 | tail -3
```

Expected: remote branch deleted (the work is folded into this redesign).

---

## Notes for follow-ups

These were called out in the spec or surfaced during planning:

1. **Stripe pagination**: `sumSucceeded` uses `limit: 100`. Fine for current community sizes; switch to `autoPagingEach` if any community exceeds 100 charges/month.
2. **Dead routes**: `app/api/community/[communitySlug]/stripe-revenue/route.ts` and `app/api/community/[communitySlug]/stats/route.ts` are unused after this redesign. Delete in a follow-up cleanup PR.
3. **shadcn-charts**: if the team adopts shadcn's chart primitives later, wrap the Recharts components in `<ChartContainer>` for a more cohesive theme.
4. **Activity-feed Resolve link**: currently navigates to `/admin/members` without anchoring to the specific row. If the members page adds row anchoring, update the link to `/admin/members#<userId>`.
