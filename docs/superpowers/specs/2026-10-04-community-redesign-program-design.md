# Community pages redesign: program, quick fixes and foundation

Date: 2026-10-04
Status: approved in conversation, awaiting spec review

## Goal

Build the approved refined redesigns of the six community pages in the real app:

| Page | Approved prototype |
|---|---|
| Community feed | https://claude.ai/artifact/M5ee8CCteMk1XWyfFDkSWB |
| Classroom (list + player) | https://claude.ai/artifact/TeseEzQXz4FTMtB6PWya5b |
| Calendar | https://claude.ai/artifact/HpbBgprGSBJZptQjdBuHC7 |
| Private lessons | https://claude.ai/artifact/4oAqavgWj1DUjbM9BPFXfT |
| About (flexible blocks) | https://claude.ai/artifact/XgRHiN8xuLoCZDSPJ1QWr2 |
| Admin panel | https://claude.ai/artifact/8oXwEfs9tuscNL6uXbeNZc |

The prototypes are the target. They keep today's layout concept, the lavender brand, Outfit (display) and Figtree (body); the "Preview states" panels in them are prototype tooling and are not built.

This document covers the whole program, then specifies Phase 0 (quick fixes) and Phase 1 (foundation) in detail. Each page gets its own short spec and plan right before it is built.

## Decisions

- **Sequencing:** redesign every page first, on today's data, one page per release. Large new features come after, each as its own project.
- **Page order (members' daily path):** Community, Classroom, Calendar, Private lessons, About, Admin.
- **Rollout:** each page goes straight to prod after a preprod check. The old version is replaced; no feature flag. Rollback is `./deploy.sh rollback`.
- **No dark mode.** Light only. The prototypes' dark styles are not built.
- **Colors (option B):** new color names are added next to the existing ones. Redesigned pages use the new names; old pages keep the old ones untouched. After the last page, old names are folded into the new ones and leftovers deleted.
- **Components may change to match the designs.** Community-only components (for example `ThreadCardFluid`, `CommunitySidebar`, `CourseCard`, `PrivateLessonCard`, `WeekCalendar`, `CommunityHeader`, `ComposerBox`, `CategoryPills`) can be rewritten freely. Components shared with non-community pages (`components/ui/*` such as `Button`, `Dialog`, `Input`) get a new variant instead of a changed default, so un-redesigned pages don't shift.

## Scope rule: what ships with a page

A page release contains:

1. **The redesign on existing data:** layout, merged top bar, cards, loading/empty/error states, keyboard access, phone layout, and new behaviour that only needs data the page already has (in-page search and filters, time zones, collapsible pinned post, Latest/Top sort, Complete and continue, video speed and mirror, member detail panel from existing data).
2. **Features the page depends on**, when they stay inside the page with at most a small migration, no new background job and no payment change.

Anything else is a separate feature project. Where a prototype shows a deferred feature, the page either omits it or shows today's behaviour in the new style. No buttons that do nothing.

## Program

| Phase | Release | Ships with it |
|---|---|---|
| 0 | Quick fixes | See Phase 0 |
| 1 | Foundation | Colors, merged top bar, phone nav rules, shared components, time helpers, Offerings settings (columns + nav filtering) |
| 2 | Community feed | "New" markers on posts (track last visit per member), Add to Google Calendar on the next-class card |
| 3 | Classroom | Replays row, free preview lesson (flag on a lesson) |
| 4 | Calendar | Repeat weekly for N weeks (creates the classes at once), cancel a class but keep it visible, the viewer's private lessons on the calendar |
| 5 | Private lessons | Teacher notes and recording shown to the student (columns already exist) |
| 6 | About | Automatic blocks (follow the Offerings settings), "Add block" library, templates, rename/move/remove blocks |
| 7 | Admin | Offerings switches screen, "Needs your attention" from existing data, email audiences |
| 8+ | Feature projects, in this order | 1. Weekly hours for private lessons. 2. Reminders and "Tell me when times open" notifications. 3. Calendar `.ics` feed. 4. Reschedule a private lesson. 5. Give a free month. |

Weekly hours comes first among feature projects because BachataFlow has zero availability slots in prod today, so members cannot book.

## Phase 0: quick fixes

One small release, before the foundation:

1. **Admin entry independent of the broadcasts kill-switch.** `components/CommunityNavbar.tsx` and `components/MobileNav.tsx` hide Admin when `NEXT_PUBLIC_BROADCASTS_ENABLED` isn't `true`. It is `true` on prod and preprod today, so nobody is affected yet, but turning the broadcasts kill-switch off would hide the whole admin. Owners and site admins always see Admin.
2. **Rounded discount badge.** `components/PrivateLessonCard.tsx` and `components/LessonBookingModal.tsx` show the member discount percentage rounded to a whole number ("29% off", not "28.57% off").
3. **Loading is not "empty".** `components/community/CommunitySidebar.tsx` shows a skeleton while upcoming classes load (SWR `data === undefined`) instead of "No upcoming classes".
4. **No "0 members" flash.** The feed page counts the roster on the server (same filter as `GET /api/community/[slug]/members`) and the header starts from that number until the roster loads. The stored counters (`communities.active_member_count`, `members_count`) are not used: they drift from the real roster (for example `the-salsa-club` stores 9 active but has 4).

Each fix gets a regression test where the logic is testable (badge rounding, loading vs empty, initial count, admin visibility).

## Phase 1: foundation

### 1.1 Colors

Add CSS variables to `app/globals.css` (`:root` only, no dark values) and matching Tailwind colors in `tailwind.config.js`:

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F6F4FA` | Page background in the community area |
| `surface` / `surface-2` / `surface-3` | `#FFFFFF` / `#F1EDF8` / `#E7E1F1` | Cards; hover and inset fills; tracks and skeletons |
| `ink` / `ink-2` / `ink-3` | `#1E1730` / `#5D5571` / `#736B88` | Text: primary, secondary, tertiary (all pass 4.5:1 on white) |
| `line` / `line-strong` | `#E4DEEE` / `#CFC5E0` | Borders and dividers |
| `brand` / `brand-hover` | `#8E57DB` / `#7A45C8` | Primary actions (same purple as today's `--primary`) |
| `brand-ink` / `brand-soft` / `brand-line` | `#6834B2` / `#F1EAFD` / `#D8C7F6` | Brand text on white; selected backgrounds; selected borders |
| `ok` / `ok-soft` | `#1D7447` / `#E3F4EA` | Success |
| `warn` / `warn-soft` | `#8A4B00` / `#FFF2DE` | Warnings |
| `live` / `live-soft` | `#CF2637` / `#FDECEE` | Live now, errors, destructive actions |

Shadows: `shadow-card`, `shadow-raised`, `shadow-overlay` (values from the prototypes). Existing color names (`background`, `card`, `muted`, `primary`, ...) are not changed. The community layout's wrapper switches from `bg-background` to `bg-canvas`.

### 1.2 Merged top bar

A new client component (`components/community-shell/top-bar.tsx`) replaces the two stacked bars (`app/components/Navbar.tsx` + `components/CommunityNavbar.tsx`) on desktop inside `app/[communitySlug]/layout.tsx` only. Landing, dashboard and discovery keep `Navbar`.

- Left: Dance-Hub mark linking to `/dashboard`; community switcher (shows the current community; its menu has "Find more communities" and "My dashboard". Listing the viewer's other communities is out of scope for Phase 1).
- Tabs with a sliding underline that follows hover and focus. Tab rules: Community and About always; Classroom and Calendar for members, owners and site admins; Private lessons for everyone; Admin for owners and site admins. Classroom, Calendar and Private lessons are also hidden when the matching Offerings setting is off (1.5).
- Right: the existing `NotificationsButton` and `UserAccountNav`; signed-out visitors get Sign in and Join buttons that open the existing auth modal.
- Sticky at `top: env(safe-area-inset-top)`, 60px tall.
- Keeps the element IDs the onboarding tour targets: `#navigation-tab-buttons` and `#tab-<label>` on each tab.
- Global search is out of scope in this program; search lives inside pages.

`components/MobileNav.tsx` is restyled with the new colors and uses the same tab rules (Admin always in More for managers).

`components/CommunityNavbar.tsx` is deleted once nothing imports it.

### 1.3 Shared components

New folder `components/ds/` (kebab-case files), each with Jest tests where it has logic:

- `pill.tsx`: status pill with variants `neutral`, `brand`, `ok`, `warn`, `live`, `muted`.
- `chip.tsx`: filter chip (button with `aria-pressed`, optional colored dot and count).
- `segmented.tsx`: two-to-four option toggle (`aria-pressed` buttons).
- `empty-state.tsx`: icon, title, text, actions.
- `skeleton.tsx`: shimmer block; static when `prefers-reduced-motion`.
- `date-tile.tsx`: month/day tile, with brand and live variants.
- `initials-avatar.tsx` and `facepile.tsx`: deterministic hue per user id, used where there is no avatar image.
- `inline-confirm.tsx`: in-page confirmation box (message, cancel, confirm) that replaces `window.confirm` in redesigned flows.

The toast library stays (`react-hot-toast`); its `Toaster` gets the new look (dark ink pill, bottom center, above the phone tab bar).

Time helpers in `lib/time/` built on `lib/calendar-week.ts`: format a moment in the viewer's zone and in a fixed zone (for "7:00 PM your time, 19:00 CEST in Berlin"), relative day words (Today, Tomorrow, weekday), and a "starts in" countdown string. Hooks `useNow(intervalMs)` and `useCountdown(target)`.

### 1.4 Typography

Redesigned pages use a 15px body size (today many community texts are 14px) and this scale: 12.5, 13.5, 15, 17, 19, 22, 26, 30/32. Headings use Outfit with `text-wrap: balance`. No new fonts.

### 1.5 Offerings settings

- Migration in `supabase/migrations/` adds to `communities`: `offers_live_classes`, `offers_courses`, `offers_private_lessons`, all `boolean NOT NULL DEFAULT true`. Every existing community keeps its current behaviour.
- `getCommunityBySlug` returns them; `lib/offerings.ts` exposes `getOfferings(community)`.
- Top bar and `MobileNav` hide the tabs of switched-off offerings.
- Opening a switched-off page by URL: members are redirected to the feed; owners and site admins can still open it and see a banner "Off for members. Turn it on in Admin, Offerings."
- No screen to change them in this phase; it ships with Admin (Phase 7).

## Testing and rollout (every release)

- Built in its own git worktree, never in the main repo directory.
- `bun run test` (Jest) passes, with new tests for new logic. Remove any env file from the worktree before running Jest (B2 bucket is shared with prod).
- Related Playwright specs in `e2e/` updated and run with the local e2e recipe.
- One code-quality review of the whole release before the preprod checkpoint.
- Deploy to preprod with `./deploy-preprod.sh restart <branch>` for Logan to check. After approval, merge and deploy to prod with `./deploy.sh code`.
- UI copy follows the house rules: no em dashes, no vendor names (Stripe, Mux, LiveKit, ...), sentence case.

## Out of scope for this program

Dark mode; global search; the prototype "Preview states" panels; the five feature projects in Phase 8+ (each gets its own spec); redesigning pages outside the community area (landing, onboarding, dashboard, discovery).

## Risks

- **Top bar touches every community page at once.** Mitigation: Phase 1 keeps page contents unchanged and is checked on preprod across all six pages before prod.
- **Onboarding tour selectors.** The owner tour (`lib/tourSteps.ts`, with page routing in `components/NextStepWrapper.tsx`) walks across the feed (`#community-header`, `#write-post`, `#thread-categories`, `#member-count`, `#manage-community-button`), the nav (`#navigation-tab-buttons`, `#tab-*`), Private lessons (`#manage-private-lessons`) and admin pages (`#settings-general`, `#settings-subscriptions`, `#settings-thread_categories`). Every phase keeps the IDs on the elements it rebuilds, or updates both tour files in the same release, and runs the tour once on preprod.
- **Two color systems live side by side** until the end of Phase 7. Mitigation: the cleanup that folds old names into new ones is a named task at the end of Phase 7.
