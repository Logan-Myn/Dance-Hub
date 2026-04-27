# Admin Dashboard Redesign — Design

**Date:** 2026-04-27
**Branch:** `feat/admin-dashboard-redesign`
**Scope:** Replace the four-tile KPI grid at `/[communitySlug]/admin/page.tsx` with a teacher-friendly overview that surfaces money, growth, and recent activity. Add a "Dashboard" entry to `AdminNav`. Adapts to free vs paid communities via `community.membership_enabled`.

## Motivation

The current dashboard has four KPI tiles (Total Members, Monthly Revenue, Total Threads, Active Members), and three of them are broken:

- `monthlyRevenue` and `revenueGrowth` are hardcoded to `0`.
- `Total Members` and `Active Members` use overlapping definitions and inconsistent creator-exclusion (Total excludes the creator, Active does not — so on a small community Active can read higher than Total).
- The `+N this month` subline on Total Members filters by `status='active'` while the parent number counts every status, so the parent and subline mean different things.

Beyond the data bugs, the dashboard reads as a generic "stats grid" with no perspective on what a community owner — typically a dance teacher, not a SaaS operator — actually needs to know at a glance: *am I making money, is the community growing, is anything broken?*

This redesign narrows the dashboard around two priorities (money first, growth second), uses plain-language labels for the audience (no "MRR", no "churn"), and adds a chart and a recent-activity feed so the page communicates trend and texture, not just point-in-time counts.

## Non-goals

- Multi-admin support. Admin access is still gated to `community.created_by === session.user.id` (see `app/[communitySlug]/admin/layout.tsx:22`).
- Replacing the deep-dive admin pages (Members, Subscriptions, Broadcasts, Thread Categories). The dashboard is an overview; drilling in still happens in those routes.
- Net-new analytics infrastructure (events table, time-series store). All data comes from existing sources: `community_members`, `threads`, `comments`, and Stripe Connect.
- Real-time updates. The page is server-rendered with `force-no-store`; refresh by reloading.
- Generalising the chart/activity-feed components beyond this page. If reused later, extract then.

## Audience

Community owner — almost always a dance teacher running a small (10–50 paying members) community. Comfortable with money concepts ("how much did I make?") and growth concepts ("how many new students?"), but not with subscription-business jargon ("MRR", "churn rate", "ARPU"). Labels reflect this throughout.

## Architecture

### Page structure

```
app/[communitySlug]/admin/page.tsx     ← server component, orchestrates data
components/admin/
  DashboardHeader.tsx                  ← page title + community context
  DashboardKpis.tsx                    ← REPLACES existing; tile grid (server)
  DashboardChart.tsx                   ← client island, tabbed (Recharts)
  DashboardActivityFeed.tsx            ← server component (no client interactivity needed)
  AdminNav.tsx                         ← updated to add "Dashboard" link
```

The page itself stays an RSC. The chart is the only client island (it needs Recharts + tabs state). KPIs and activity feed are server-rendered for speed and to keep the client bundle small — same pattern already used elsewhere in `app/[communitySlug]/admin/`.

### Layout

Desktop (≥md):

```
┌──────────────────────────────────────────────────────┐
│ Dashboard                                            │
├──────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│ │ Tile 1   │ │ Tile 2   │ │ Tile 3   │               │
│ └──────────┘ └──────────┘ └──────────┘               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│ │ Tile 4   │ │ Tile 5   │ │  (gap)   │               │
│ └──────────┘ └──────────┘ └──────────┘               │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ [Revenue · Members]                              │ │
│ │ ▁▂▃▅▆▇  (chart)                                  │ │
│ └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ Recent activity                                  │ │
│ │ • Marie joined · 2h ago                          │ │
│ │ • Anna's payment failed · 1d ago     [Resolve]   │ │
│ │ • Logan posted in Salsa Tips · 1d ago            │ │
│ │ …                                                │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

Mobile (<md): tiles stack 1-col; chart and feed fill the row.

3-column tile grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). On a paid community there are 5 tiles, leaving one empty cell on row 2 col 3 (intentional white space — matches the airy `font-display` page header). On a free community there are 3 tiles, filling row 1.

### Data sources

| Source | Used for |
|---|---|
| `community_members` (Postgres) | Members, New members, Cancellations tiles; Member-growth chart; Activity feed (joins, cancellations) |
| `threads`, `comments` (Postgres) | Posts tile; Activity feed (new posts) |
| Stripe `charges.list` (per Connect account) | Revenue tile, Revenue chart, Activity feed (failed payments) |
| `communities.membership_enabled` | Drives conditional tile/chart visibility |
| `communities.stripe_account_id` | Required for any Stripe call; absent → revenue/failed-payments shown as zero/empty |

All Postgres queries use the existing `queryOne` / `query` helpers from `lib/db.ts`. Stripe calls use the existing `Stripe` SDK already imported elsewhere.

## KPI tiles — adaptive

Tile visibility depends on `community.membership_enabled`:

| # | Paid (`membership_enabled=true`) | Free (`membership_enabled=false`) | Query |
|---|---|---|---|
| 1 | **Revenue this month** — `€X` · `+Y%` MoM | *hidden* | Stripe `charges.list` for `[startOfMonth, now]`, sum `amount/100` where `status='succeeded'`. Compare against `[startOfLastMonth, startOfMonth]` for MoM. |
| 2 | **Members** — `N total` · `M paying` | **Members** — `N total` | `SELECT COUNT(*) FILTER (WHERE status='active') AS total, COUNT(*) FILTER (WHERE status='active' AND stripe_subscription_id IS NOT NULL) AS paying FROM community_members WHERE community_id=X AND user_id != created_by` |
| 3 | **New members this month** — `N` · `+Y%` MoM | same | `WHERE joined_at >= startOfMonth AND user_id != created_by`. Compare with `[startOfLastMonth, startOfMonth]`. |
| 4 | **Cancellations this month** — `N` · `M last month` | *hidden* | `WHERE status IN ('inactive','cancelled') AND updated_at >= startOfMonth`. Both statuses mean "no longer a member" (see Members tile semantics). Schema does not have a dedicated `cancelled_at` column; `updated_at` is the proxy. |
| 5 | **Posts this month** — `N threads` · `M replies` | same | `SELECT COUNT(*) FROM threads WHERE community_id=X AND created_at >= startOfMonth` + `SELECT COUNT(*) FROM comments WHERE thread_id IN (...) AND created_at >= startOfMonth` |

### Edge cases

- Community has no `stripe_account_id` or `account.charges_enabled === false` → tile 1 shows `€0.00 · +0%` (graceful, no error).
- Last-month value is `0` and this-month value is non-zero → `+Y%` shows `+100%` (mathematical fallback for division-by-zero).
- Last-month and this-month both `0` → `+0%`.
- All counts default to `0` when the underlying query returns no rows.

### "Members" tile semantics

`Total` means **currently active members** (`status='active'`). In this product there is no "inactive but still a member" state — when a subscription is cancelled or fails to be paid, the member is removed from the community. The DB stores two distinct cancellation statuses (`inactive` set by the Stripe webhook on `customer.subscription.deleted`, `cancelled` set by the manual `/leave` route), but both mean the same thing in product terms: the person is no longer a member. Active is the only "current member" state.

`Paying` is the subset of active members that also have a Stripe subscription. On a free community, hide the `paying` line entirely.

## Chart card

Single card with two tabs:

| Tab | Period | Type | Y-axis | Visible on |
|---|---|---|---|---|
| **Revenue** | Last 6 calendar months | Bar | € | Paid communities only |
| **Members** | Last 90 days | Cumulative line | total active members | All communities |

On a free community, the **Revenue** tab is removed — the card shows only the Members chart with no tab strip.

### Library

Use **Recharts**. Reasons:
- De facto React standard, healthy maintenance, plays well with Next.js + Tailwind.
- Used under the hood by shadcn's chart primitives if we adopt those later.
- No charting lib currently in `package.json` (verified) — we add this dependency.

### Data computation

- **Revenue chart**: for each of the last 6 calendar months, query Stripe `charges.list` with `created` window for that month, sum succeeded amounts. **Pagination required** — Stripe's `charges.list` returns max 100 per page, and a 6-month window across all months can plausibly exceed that for active communities. Use the SDK's `autoPagingEach` (or `autoPagingToArray({ limit: 1000 })`) to iterate. The single-month KPI tile uses the same pagination, applied per-month to keep code symmetric.
- **Members chart**: pull rows ordered by `joined_at`, accumulate net membership (`+1` per join, `-1` when an `inactive`/`cancelled` row's `updated_at` falls in the window), bin per day. Server-side computation; chart receives a `[{ date, count }]` array.

### Empty states

- Community younger than the chart period: render the chart axis but show a centered "Not enough data yet" message.
- Stripe call fails: render the Members chart only (or, on free, an empty card with the message).

## Recent activity feed

Last 10 events, mixed types, ordered by recency. Each row is plain-language: actor, verb, target/context, relative time.

| Type | Source | Example row | Notes |
|---|---|---|---|
| **Member joined** | `community_members.joined_at` (any status) | "Marie joined · 2h ago" | Free joins included |
| **Cancellation** | `community_members.updated_at` where `status IN ('inactive','cancelled')` | "Lucas cancelled · 1d ago" | Same proxy as tile 4 |
| **Failed payment** | Stripe `charges.list({status:'failed'})` last 30d | "Anna's payment failed · 2d ago [Resolve]" | Highlighted; "Resolve" links to `/admin/members#<userId>` |
| **New post** | `threads.created_at` | "Logan posted in Salsa Tips · 6h ago" | Category name, not full title, to keep rows skimmable |

Feed query strategy: each event type is its own SELECT (or Stripe call), each capped at 10 rows ordered DESC, then merged client-side and re-sorted by timestamp, sliced to the top 10. This avoids a single union query that's harder to optimise.

### Visual treatment

- One row per event, avatar/icon on the left, text in the middle, relative time on the right.
- **Failed-payment** rows get a subtle amber tint (`bg-amber-50/40 border-amber-200/40`) and an inline "Resolve" link.
- Empty state: "No recent activity yet" centered, same visual weight as the comments-section empty state in `ThreadView.tsx`.

### Why merge in app code, not SQL UNION

A SQL `UNION ALL` across `community_members`, `threads`, and a virtual table for Stripe failed-payments would be neater in theory but:
- Stripe data isn't queryable from Postgres.
- Each event type needs different metadata (post category, member display name, etc.) that's awkward in a flat UNION.
- 10-row caps per type → at most 30+ rows merged in JS, trivial cost.

## Nav update

Add a "Dashboard" link to `components/admin/AdminNav.tsx` as the first item. Currently the nav lists General, Members, Subscriptions, Thread Categories, Broadcasts — and the dashboard is the route's index but has no nav entry, which is confusing. New order:

1. **Dashboard** → `/${slug}/admin`
2. General
3. Members
4. Subscriptions
5. Thread Categories
6. Broadcasts

Active-state styling matches the existing nav pattern (active when `pathname === href` for Dashboard, since the index path is exact-match).

## Caching & performance

- Keep `dynamic = 'force-dynamic'` and `fetchCache = 'force-no-store'`. Owners want fresh numbers; this page is rarely loaded so caching pays little.
- All Postgres queries + Stripe calls run in a single `Promise.all` at the top of the page.
- Stripe calls (revenue current month, revenue last 5 months for chart, failed payments last 30d, account status check) — that's up to 8 Stripe calls. They run in parallel and Stripe handles concurrent requests on a Connect account fine.
- For the failed-payments activity feed call, reuse the account-status retrieval done for the revenue tile (one `accounts.retrieve`, share the result).

## Error handling

- **Stripe outage / account misconfigured**: revenue tile + chart-revenue tab + failed-payments feed entries all degrade to empty/zero. The rest of the page renders normally. No page-level error.
- **DB query fails**: page errors out via Next's default error boundary. Acceptable since the dashboard is unusable without member counts.
- **Per-section errors**: each section component renders its own empty/error state, so one failure doesn't break the whole page.

## Testing

- Unit tests for the helpers in `lib/admin-dashboard-stats.ts` (extract revenue + chart computations from the page so they're testable):
  - Stripe-revenue helper: monthly sum, MoM growth math (incl. zero-baseline edge cases).
  - Member-growth aggregator: cumulative line over a 90d window with mixed joins/cancellations.
  - Activity-feed merge: top-10 across types with correct DESC ordering.
- Existing Jest setup (`bunx jest`, see `__tests__/`) — same harness already used by `ThreadView.test.tsx`.
- Manual QA on preprod against a community with: paid + active members, paid + recent cancellations, free community (no Stripe), brand-new community (empty states).

## Migration / rollout

No database migration required (uses existing columns).

Single PR, single deploy:
1. Develop on `feat/admin-dashboard-redesign` (this branch).
2. Validate on preprod via `./deploy-preprod.sh restart feat/admin-dashboard-redesign` against representative communities.
3. PR to main → squash-merge → `./deploy.sh code` for prod.

The previously-pushed branch `fix/dashboard-revenue` (a partial revenue-only fix) is **superseded by this redesign** — its work is folded into tile 1 + the revenue chart. We will close that branch's PR (if opened) without merging and delete it.

## Open questions for implementation

These don't block design approval; the implementation plan should resolve them:

1. **Chart styling**: Recharts default theme, or wrap in shadcn's chart primitives (added to the project)? Defaulting to plain Recharts unless the codebase already uses shadcn-charts.
2. **Activity-feed avatar source**: members have a `users.avatar_url`. Verify the join in the existing members-list query works the same way here. Failure mode: fall back to initials avatar.
3. **Recharts bundle size**: Recharts isn't tiny (~90KB minzipped). Acceptable for an admin-only page that's not on the critical path. If concerns arise, lazy-load the chart island.
