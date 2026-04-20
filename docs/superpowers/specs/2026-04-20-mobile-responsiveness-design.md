# Mobile Responsiveness — Design

**Date:** 2026-04-20
**Status:** Spec approved, ready for implementation plan
**Owner:** Logan

## Problem

Dance-Hub was built desktop-first. On a phone it renders as a squished desktop view: the 6-tab community navigation (Community · Classroom · Private Lessons · Calendar · About · Admin) doesn't collapse, modals are tiny centered boxes, the calendar horizontally scrolls an 800px week grid, admin tables overflow, and several `grid-cols-2`/`grid-cols-3` layouts never stack. Members increasingly hit the app from mobile but the experience is hostile.

## Goal

Make Dance-Hub fully mobile-friendly without breaking the existing desktop experience or disrupting production users. Ship in phases, each phase deployed and QA'd on preprod (`preprod.dance-hub.io`) before merging.

## Non-goals

- Pull-to-refresh, swipe-to-delete, or swipe gestures beyond basic bottom-sheet dismissal.
- Offline mode, service workers, PWA install prompts.
- Native app wrapping (Capacitor, React Native rewrite).
- Design-system overhaul — mobile inherits the current purple/white aesthetic.
- Dark-mode adjustments beyond verifying nothing obviously breaks.
- Lighthouse performance targets (can follow as a separate phase).
- Accessibility audit (separate project).

## Decisions

1. **Scope:** all user-facing surfaces — community feed, classroom, private lessons, calendar, admin, auth, onboarding, landing, discovery.
2. **Quality bar: Hybrid.** Native-feel patterns (bottom tab bar, bottom-sheet modals, full-screen deep routes) on the core member flows; clean responsive layouts on admin, settings, and low-traffic pages.
3. **Shipping: phased sub-PRs.** One epic intent, four PRs. Each independently deployable and revertable.
4. **Tablet: treated as small desktop.** Tablets render the desktop layout. Only `< md` gets mobile treatment.
5. **Architecture: CSS-driven responsive shell (approach C).** Default to one component with Tailwind breakpoints. Split into mobile/desktop components only when the DOM genuinely differs. No `useIsMobile()` hook in the render path — SSR-safe and RSC-friendly.
6. **Mobile/desktop cutoff: `md` (768px).** Below: mobile. At and above: desktop.

## Architecture

### Breakpoint strategy

Tailwind default breakpoints, no customization. Mobile-first base styles, `md:` adds desktop. The contract: any component's base class list is the mobile rendering; `md:` overrides apply to desktop.

### Component strategy

Two rules, applied per component:

1. **Default — one component, responsive via Tailwind.** Feed cards, forms, buttons, modals, lesson tiles. Rewritten mobile-first in place. Single DOM tree.
2. **Exception — split into `<Mobile*>` + `<*>` components.** Used when mobile and desktop need structurally different DOM. Rendered via CSS visibility:
   ```tsx
   <div className="md:hidden"><MobileNav /></div>
   <div className="hidden md:block"><CommunityNavbar /></div>
   ```
   No conditional rendering via JS. Both subtrees SSR, one is hidden in the browser. This keeps components as Server Components where possible and avoids hydration flash.

Components that qualify for splitting: global navigation, thread modal (inline panel on desktop vs. full-screen route on mobile), lesson player, private-lesson video session layout.

### Behavior hook (not a layout hook)

A new `hooks/use-is-mobile.ts` — a client-side hook used only for **behavior** inside already-`'use client'` components. Never gates what gets rendered. Examples: enabling swipe-down dismissal on a sheet, choosing between inline and route-based thread navigation. Layout always driven by Tailwind classes, never this hook.

### Viewport + safe area

- Root `app/layout.tsx` sets `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- `globals.css` exposes `--safe-area-inset-bottom: env(safe-area-inset-bottom)` and friends.
- Utility: `.pb-safe { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }` used by bottom tab bar, bottom sheet handles, sticky composers.
- `<html class="overscroll-none">` to prevent iOS rubber-band when sheets are open.

### Tailwind config

No breakpoint changes. Optional `safe-area` utilities added via arbitrary values (`pb-[env(safe-area-inset-bottom)]`).

## Global Navigation

The biggest visible change.

**Desktop — unchanged.** `components/Navbar.tsx` (top header with logo, dashboard button, notifications, user menu) and `components/CommunityNavbar.tsx` (6-tab row) continue to render at `md+`.

**Mobile — new `<MobileNav>`.** Replaces both desktop components below `md`. Composed of:

1. **Top header (minimal):** community avatar + community name + 🔔 notifications bell. No tabs. No "Dashboard" button.
2. **Bottom tab bar (5 tabs):** Community · Classroom · Lessons · Calendar · More.
   - "Private Lessons" renames to "Lessons" for space.
   - Active tab rendered in primary purple, icon + 10px label.
   - Tab bar anchored to bottom with `pb-safe` so it clears the iOS home indicator.
3. **"More" bottom sheet:** community-level items (About, Admin — shown only to admins, Switch community) and user-level items (My Dashboard, Profile, Sign out), separated by a divider. Opens as a bottom sheet; dismisses on tap-outside or swipe-down.

Rendered from `app/[communitySlug]/layout.tsx` and `app/[communitySlug]/admin/layout.tsx`.

### Admin nav

The admin area uses its own tab set in the mobile bottom bar: **Members · Emails · Subs · Settings · More**. More sheet contains the remaining admin sections plus the community-switcher and user profile access.

## Shared Mobile Patterns

A small library of primitives used across phases.

### `<ResponsiveDialog>`

Wraps shadcn's existing `Dialog` and `Sheet`. At `md+` renders as a centered `Dialog`. Below `md` renders as a `Sheet` (bottom, 80–95% height, swipe-handle). Migrations happen within each phase as the affected pages are worked on — not as a global sweep. Specific targets: `Thread` modal, `ComposerBox`, `CreatePrivateLessonModal`, `LessonBookingModal`, `PaymentModal`, admin form modals. Other `<Dialog>` usages stay as-is unless the phase touching that page migrates them.

### Full-screen routes for deep views

On desktop, the thread modal overlays the feed. On mobile, the thread opens as a dedicated route `/[communitySlug]/threads/[threadId]` so the native back button works. Same thread component rendered either as modal or as route page. Same pattern applies to the lesson player and private-lesson video session.

### Touch targets

Minimum **44×44 px** for anything tappable (Apple HIG). Default button size is bumped below `md` via shadcn button variant config.

### Table → card list

`components/admin/MembersTable.tsx` and similar tables render a card-list variant below `md`. Each row becomes a card with the 2–3 most important fields prominent and a `⋯` menu for secondary actions. Desktop table unchanged.

### Grid → stack

Every `grid-cols-2` and `grid-cols-3` without a breakpoint becomes `grid-cols-1 md:grid-cols-N`. Mechanical sweep across ~15 files (`CreatePrivateLessonModal`, `LessonBookingModal`, Stripe Connect onboarding steps, etc.).

### Fixed-width killed

- `WeekCalendar` (`min-w-[800px]`) gets a real redesign: day-view on mobile, week-view on desktop. Not a scroll.
- `w-[200px]` etc. become `w-full md:w-[200px]`.

### Typography

Body text stays 14–16px. Headings drop a step on mobile (`text-2xl md:text-3xl`, etc.). Systemized across pages.

## Phases

Each phase is one PR, merged to `main` after preprod QA. Each phase also gets **its own implementation plan** written separately before that phase is executed — this spec is the design; the plans are per-phase.

### Phase 1 — Foundation

Lays the primitives. Desktop is pixel-identical.

**Files changed (expected):**
- `app/layout.tsx` — viewport meta, `overscroll-none`
- `globals.css` — safe-area CSS vars, `.pb-safe` utility
- `hooks/use-is-mobile.ts` — new
- `components/ui/responsive-dialog.tsx` — new wrapper
- `components/MobileNav.tsx` — new (top header + bottom tab bar + More sheet)
- `components/MobileAdminNav.tsx` — new (admin variant)
- `app/[communitySlug]/layout.tsx` — render `MobileNav` below `md`, hide `Navbar`/`CommunityNavbar`
- `app/[communitySlug]/admin/layout.tsx` — render `MobileAdminNav`
- Mechanical grid-stack sweep across ~15 files

**Verification:**
- Desktop: pixel-identical at `md+` — no regressions.
- Mobile: tap-through all 5 tabs, open/close More sheet, verify no overlap with iOS home indicator, rotate portrait/landscape.

### Phase 2 — Core member flows

The pages members touch daily.

**Files changed (expected):**
- `components/FeedClient.tsx` — feed cards stack, composer sticky-top on mobile
- `components/Thread.tsx` — becomes a route page on mobile
- `app/[communitySlug]/threads/[threadId]/page.tsx` — new route for mobile thread view
- `components/CommunityHeader.tsx` — reflow hero for mobile
- `components/ClassroomPageClient.tsx` — course grid stacks
- `app/[communitySlug]/classroom/[courseSlug]/**` — course/lesson pages mobile-first
- `components/LessonPlayer.tsx` (or equivalent) — video fills width, description below, touch-sized controls
- `app/[communitySlug]/private-lessons/page.tsx` — card stack
- `components/CreatePrivateLessonModal.tsx` — mobile stacking, use `<ResponsiveDialog>`
- `components/LessonBookingModal.tsx` — mobile stacking, use `<ResponsiveDialog>`
- `components/VideoSessionPage.tsx` + `LiveKitVideoCall.tsx` + `LiveKitControlBar.tsx` + `LiveKitChat.tsx` — surround chrome works at phone width. LiveKit's own controls mostly self-contained; verify our wrapper (Stream-Hub integration) behaves.
- `components/WeekCalendar.tsx` — day-view on mobile (single column, swipe left/right to navigate days), week-view on desktop.

**Note:** video session uses **LiveKit via Stream-Hub** (`lib/stream-hub.ts`), not Daily.co. The CLAUDE.md at repo root is stale on this.

**Verification:** Golden-path pass on preprod from a real phone — post a message, open a thread, browse classroom, watch a lesson, book a private lesson, open the calendar, switch days.

### Phase 3 — Admin & settings

**Files changed (expected):**
- `app/[communitySlug]/admin/**` — layouts reflow
- `components/admin/MembersTable.tsx` — card-list variant below `md`
- Emails, subscriptions, thread-categories tables — same card-list treatment
- Admin settings forms — stack inputs, full-width buttons
- Stripe Connect onboarding components — fix `grid-cols-2`/`grid-cols-3`

**Verification:** From a phone, manage members, send a broadcast email, update general settings, complete a Stripe Connect step.

### Phase 4 — Onboarding & polish

**Files changed (expected):**
- `app/auth/**` — sign-in / sign-up polish
- `components/OnboardingWizard.tsx` — full-screen on mobile
- `app/onboarding/**` — mobile-first
- `components/landing/**` — spot-fixes
- `app/discovery/**` — community cards stack
- Final polish pass: toast positions, dropdown positioning, dark-mode sanity check, any residue from phases 1–3.

**Verification:** New-user signup end-to-end on a phone — no dead ends, no overflow, no tiny buttons.

## Workflow

### Branching

Each phase opens its own PR against `main`:

- `feat/mobile-foundation`
- `feat/mobile-core-flows`
- `feat/mobile-admin`
- `feat/mobile-onboarding-polish`

No long-lived epic branch. Each branch cuts from latest `main` after the prior phase merges.

### Worktrees

Each phase gets its own git worktree under `/home/debian/apps/dance-hub-mobile-pN/` so we never disturb the production `pm2 dance-hub` process serving `/home/debian/apps/dance-hub`. Matches the project rule "never build in main repo for test."

### Preprod deploys

After each PR is green in CI, deploy the branch to preprod:
```bash
./deploy-preprod.sh deploy <branch>
```
Preprod targets `preprod.dance-hub.io` with the Neon preprod database branch (isolated from prod).

### Production merges

Merged PRs deploy via `./deploy.sh code` (per existing project rule).

### QA devices

- **iPhone Safari** on a real phone (primary QA device)
- **Chrome DevTools mobile emulation** — iPhone 12/14 Pro and Pixel 5 presets (quick feedback during development)
- **iPad** — spot check only (treated as small desktop)

### Regression safety

Before each PR merges, spot-check desktop on the same pages. Goal: desktop pixel-identical above `md`. If anything shifts, that's a bug.

### Rollback

Each phase is a git revert away from the prior state. No cumulative state to unwind.

## Risks

- **LiveKit/Stream-Hub video chrome on phones.** Their own UI mostly handles itself; our `LiveKit*` wrapper components need a pass. If anything is fundamentally broken, we flag, not rebuild — surround chrome only.
- **Stripe Checkout mobile view.** Rendered by Stripe, we don't own it. Verify it works, don't rebuild.
- **Hydration flash with CSS visibility.** Mitigation: both subtrees SSR (no JS gating), so the correct one is visible from first paint. Approach C is specifically chosen to avoid this.
- **Admin table → card layout drift.** Admin users may be surprised by the card format. Mitigation: column info parity, clear action affordances.
- **Long-running plan across 4 phases.** Mitigation: each phase is independently shippable; stopping after phase 2 still leaves users in a significantly better place than today.

## Open questions

None. All design decisions locked.

## Appendix — audit snapshot

Current state of responsiveness in the codebase (as of 2026-04-20):

- Root layout has no viewport meta or safe-area handling.
- `CommunityNavbar` is the 6-tab row from the screenshot; no collapse.
- `Navbar` is desktop-only with fixed `py-4 px-6`.
- `tailwind.config.js` uses Tailwind default breakpoints.
- ~160 responsive class uses total (65 `md:`, 61 `sm:`, 36 `lg:`).
- No `useMediaQuery`, `useIsMobile`, or `@/hooks/use-mobile` exists.
- Known hostile patterns: `WeekCalendar` `min-w-[800px]`; admin tables without responsive wrappers; `CreatePrivateLessonModal` / `LessonBookingModal` / Stripe onboarding with `grid-cols-2`/`grid-cols-3` and no stacking; fixed widths `w-[200px]` on dropdowns.
- Preprod infrastructure exists: `.env.preprod`, `deploy-preprod.sh`, `preprod.dance-hub.io`, Neon preprod branch (`br-small-union-ahrks3mo`).
