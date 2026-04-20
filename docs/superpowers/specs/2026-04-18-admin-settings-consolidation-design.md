# Admin Settings Consolidation — Design

**Date:** 2026-04-18
**Branch:** `refactor/admin-settings-consolidation`
**Scope:** Replace the `CommunitySettingsModal` (1948-line client monolith) with five focused RSC routes under `/[communitySlug]/admin/*`, matching the existing `admin/emails/page.tsx` pattern.

## Motivation

Today the creator-facing community settings live in `components/CommunitySettingsModal.tsx`: a single `"use client"` file with 5 internal tabs (Dashboard, General, Members, Subscriptions, Thread Categories) plus the Stripe onboarding wizard, capped at `max-w-5xl`. The `/[communitySlug]/admin/*` area already exists and already hosts Broadcasts as a sibling. Three concrete problems with the modal:

1. Tables and analytics are cramped at 5xl.
2. The modal is effectively a tabbed page trapped in a dialog — but URLs are not bookmarkable/shareable, and load-everything-on-open wastes work.
3. The whole surface is client-rendered, which fights the project's stated preference for RSC.

Moving everything to `/admin/*` unlocks bookmarkable URLs, per-tab data loading, and smaller client bundles (RSC + islands), while matching the pattern already used by `admin/emails/page.tsx`.

## Non-goals

- Rewriting any of the Stripe onboarding wizard's internals (kept as a modal, just un-nested).
- Introducing Server Actions (codebase uses fetch → API routes; we keep that convention).
- Reworking the feature tour beyond redirecting its modal-open calls to route navigation.
- Any new settings features. The refactor is feature-parity only.

## Architecture

### Route & file layout

```
app/[communitySlug]/admin/
  layout.tsx                   (updated: new nav items; remove broadcasts kill-switch)
  page.tsx                     Dashboard RSC (replaces the redirect)
  general/page.tsx             RSC shell + <GeneralSettingsForm /> island
  members/page.tsx             RSC + <MembersTable /> island
  subscriptions/page.tsx       RSC + <SubscriptionsEditor /> island (opens OnboardingWizard modal)
  thread-categories/page.tsx   RSC shell + <ThreadCategoriesEditor /> island (dnd-kit)
  emails/                      (untouched)

components/admin/
  GeneralSettingsForm.tsx
  MembersTable.tsx
  SubscriptionsEditor.tsx
  ThreadCategoriesEditor.tsx   (reuses existing components/DraggableCategory.tsx)
  DashboardKpis.tsx            (server where possible; client only if interactive)
```

**Deleted after migration:** `components/CommunitySettingsModal.tsx`.

### Navigation

- Admin root `/[slug]/admin` is the Dashboard. No separate "Dashboard" nav item.
- `AdminNav` lists: **General · Members · Subscriptions · Thread Categories · Broadcasts**.

### Data loading

Every page is an async RSC that queries **only** what it needs via `queryOne` / `query` from `@/lib/db`, matching `emails/page.tsx`:

```ts
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
```

| Page | Reads |
|---|---|
| `/admin` | community row; member count; thread count; monthly revenue; Stripe account status |
| `/admin/general` | community row (name, description, image, custom links) |
| `/admin/members` | members list (with pagination if needed) |
| `/admin/subscriptions` | price/tier row; Stripe account status + requirements |
| `/admin/thread-categories` | ordered categories list |

### Mutations

Client islands call existing API routes via `fetch` — no Server Actions. After each mutation the island calls `router.refresh()` to re-render the RSC with fresh data.

| Page | API routes (all already exist) |
|---|---|
| General | `PUT /api/community/[slug]/update`, `POST /api/community/[slug]/update-image` |
| Members | `DELETE /api/community/[slug]/members` |
| Subscriptions | `POST /api/community/[slug]/update-price`, Stripe endpoints |
| Thread Categories | `/api/community/[slug]/categories` (GET/POST/PATCH/DELETE) |

### Auth & gating

- `admin/layout.tsx` keeps the creator check (`community.created_by !== session.user.id` → redirect).
- The `NEXT_PUBLIC_BROADCASTS_ENABLED` kill-switch is removed: it will default to true in production, and it shouldn't gate general settings anyway.
- Per-page gating not needed — children inherit the layout's check.

### Stripe onboarding wizard

- Kept as the existing `OnboardingWizard` modal component.
- Triggered from inside the Subscriptions page (client island `SubscriptionsEditor`), not from inside another modal.
- Zero changes to the wizard's internals.
- Future: may become its own route later (`/admin/subscriptions/stripe-setup`). Out of scope for this refactor.

## Entry-point changes

| Entry point | Today | After |
|---|---|---|
| Gear icon (`FeedClient.tsx:967` `onManageClick`) | `setShowSettingsModal(true)` | `router.push('/{slug}/admin')` |
| Stripe requirements alert (`CommunityHeader.tsx:35`) | Opens modal on Subscriptions tab | `<Link href="/{slug}/admin/subscriptions">` |
| Feature tour (`FeedClient.tsx:323–369`) | Opens modal and highlights `#settings-*` | `router.push('/{slug}/admin/general'` \| `subscriptions` \| `thread-categories')`, then highlights same IDs on the new pages |
| `showSettingsModal` / `isSettingsModalOpen` / `activeSettingsTab` state | Drives open + initial tab | Deleted |

**Preserve tour anchors:** The IDs `#settings-general`, `#settings-subscriptions`, `#settings-thread_categories` are kept on the corresponding form sections in the new pages so the existing tour selectors still work after tour handlers are updated to navigate routes.

## Commit phasing (single PR)

1. **Commit 1 — Add new admin pages.** Create all 5 RSC pages + client islands. Add nav entries to `AdminNav`. Remove `broadcastsEnabled` kill-switch from `admin/layout.tsx`. Modal still exists; creators can reach settings from either place.
2. **Commit 2 — Switch entry points.** Gear icon, Stripe alert, and tour handler route to `/admin/*`. Modal is no longer triggered.
3. **Commit 3 — Delete the modal.** Remove `CommunitySettingsModal.tsx`, its imports, and orphaned props/state from `CommunityHeader.tsx` and `FeedClient.tsx`.

Each commit builds cleanly and can be deployed to preprod independently. If something regresses, we can pause or revert at that phase.

## Branch & deploy workflow

- **Branch:** `refactor/admin-settings-consolidation` off `main`.
- **Development worktree:** `/home/debian/apps/dance-hub-preprod` (never in the main repo — pm2 `dance-hub` serves from there).
- **Deploy script:** `deploy-preprod.sh` currently hardcodes `BRANCH="feature/stream-hub-integration"`. Parameterize it: `./deploy-preprod.sh deploy [branch]` with a sensible default (e.g., `main`). Use `./deploy-preprod.sh deploy refactor/admin-settings-consolidation` for this work.
- **Preprod URL:** https://preprod.dance-hub.io (PM2 app `dance-hub-preprod`, port 3009).
- **Production deploy** post-merge: `./deploy.sh code` (per existing convention).

## Verification (manual, in preprod)

No automated tests exist for this surface; verification is a preprod checklist:

- `bun run build` succeeds with no TS errors.
- Gear icon → lands on `/admin` Dashboard.
- Each tab (`general`, `members`, `subscriptions`, `thread-categories`, `emails`) loads correct data.
- **General:** edit name / description / image / custom links → persists; page re-renders with new values.
- **Members:** remove a member → list updates without full page reload.
- **Subscriptions:** update price; open Stripe onboarding wizard → end-to-end flow works unchanged.
- **Thread Categories:** add, reorder (drag-drop), remove → persists.
- **Stripe requirements alert banner** → deep-links to `/admin/subscriptions`.
- **Feature tour** still highlights the correct elements on the correct routes.
- **Non-creators** redirected away from every `/admin/*` route.
- **DevTools Network tab:** new pages serve HTML (RSC), not client-fetched JSON, on first load.
- **Bundle check:** the gear-icon route no longer pulls in the modal's client bundle.

## Risks

| Risk | Mitigation |
|---|---|
| Feature tour breaks (selectors move / navigation not awaited) | Keep exact same DOM IDs; tour handler uses `router.push` and waits for paint before highlighting |
| Missed entry point to the modal → dead code / TS errors at commit 3 | `grep -r CommunitySettingsModal` before deletion; TS catches orphaned props |
| Mobile `AdminNav` wraps awkwardly with 5 items horizontal | Test at narrow widths; may need a `<select>` / pill layout on mobile |
| Stale data after mutation | Every client-island mutation callback ends with `router.refresh()` |
| Stripe onboarding props dropped during the move | Port the exact render call from the modal to `SubscriptionsEditor` |
| Non-creators reach a sub-route via direct URL | Gate stays in `layout.tsx`; children inherit |
| `deploy-preprod.sh` accidentally deploys the wrong branch after parameterization | Default remains safe (`main`) if arg omitted |

## Open questions (post-refactor, not in scope)

- Should the Stripe onboarding wizard eventually become its own route (`/admin/subscriptions/stripe-setup`)?
- Should Dashboard grow interactive filters (date range, segmentation)? If so, `DashboardKpis` becomes a client island — the RSC shell pattern accommodates this without structural change.
- Mobile nav pattern: if 5 items is too many on phones, revisit after real usage data.
