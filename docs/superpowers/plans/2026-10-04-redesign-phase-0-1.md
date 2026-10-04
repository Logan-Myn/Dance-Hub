# Redesign Phase 0 (quick fixes) and Phase 1 (foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two releases: four quick fixes (Phase 0), then the shared foundation for the community redesign (Phase 1): new color tokens, Offerings settings, time helpers, shared components, tab rules, the merged top bar and offering gating.

**Architecture:** Phase 0 patches existing components in place. Phase 1 adds new, independent units (`app/globals.css` tokens, `lib/offerings.ts`, `lib/time/format.ts`, `lib/community-nav.ts`, `components/ds/*`, `components/community-shell/*`) and then swaps the community layout's two desktop bars for one top bar. Page contents are untouched in Phase 1.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 3.4, SWR, Jest 29 + Testing Library (jsdom), Postgres (postgres.js via `lib/db.ts`).

**Spec:** `docs/superpowers/specs/2026-10-04-community-redesign-program-design.md`

## Execution mode (lean, decided 2026-10-04)

Logan asked not to repeat per-task test cycles. Run this plan natively and lean:

- Write the code for each task directly. Skip the "write the failing test / run it to see it fail" steps.
- Keep only the tests for pure logic, written alongside the code: `format-discount`, `offerings`, `community-nav`, `time-format`, `design-tokens`. Skip the new component tests (`ds.test.tsx`, `TopBar.test.tsx`, `use-now.test.tsx`, `OfferingOffBanner.test.tsx`, `CommunityNavbar.test.tsx`) and the new cases added to existing component test files, except the MobileNav admin test change, which must change because the old expectation becomes wrong.
- Fix existing tests that break because of the change; don't add new component tests.
- Don't run tests per task. Run `bun run test -- --selectProjects lib components`, `bun lint` and `bun run build` once per release (Tasks 5 and 14), then one review per release.
- Commit per task as written.

## Global Constraints

- Light theme only. Do not add dark values for new tokens.
- Existing Tailwind/CSS color names (`background`, `card`, `muted`, `primary`, `border`, ...) must not change value.
- New CSS variables use the `--ds-` prefix and RGB channels (`246 244 250`) so Tailwind opacity modifiers work.
- Components in `components/ui/*` are shared with non-community pages: add variants, never change defaults.
- New component files are kebab-case (`components/ds/pill.tsx`).
- UI copy: no em dashes, no vendor names (Stripe, Mux, LiveKit, Daily, Resend), sentence case.
- Keep the onboarding tour IDs on rebuilt elements: `#navigation-tab-buttons`, `#tab-community`, `#tab-classroom`, `#tab-private-lessons`, `#tab-calendar`, `#tab-about`.
- Never run `bun run build` in `/home/debian/apps/dance-hub`; build only in the worktree.
- The worktree must not contain `.env.local` or `.env` when running Jest (the B2 bucket is shared with prod).
- Test command: `bun run test` (Jest). Never `bun test`.
- Prod deploys use `./deploy.sh code`; preprod uses `./deploy-preprod.sh restart <branch>`, both run from `/home/debian/apps/dance-hub`.

## Review Focus

- **Discount close to 100%:** a 99.6% member discount must read "99% off", never "100% off" (that would read as free). Test in Task 2.
- **Upcoming classes request fails:** the sidebar must say the classes didn't load, not spin forever and not claim "No upcoming classes". Test in Task 3.
- **Database without the new columns:** a community row with no `offers_*` fields (migration not yet applied on that environment) must behave as all-on. Test in Task 7.
- **Signed-out visitor in the community area:** the top bar shows "Sign in" and "Sign up" (the e2e suite clicks `/sign in|log in/i`), no Admin, no Classroom, no Calendar. Test in Task 11.
- **Active tab on nested routes and similar slugs:** `/salsa/classroom/footwork` highlights Classroom, `/salsa/private-lessons` doesn't highlight Community, and `/salsa-club` is not "inside" `/salsa`. Test in Task 10.

---

## Before you start

- [ ] **Create the Phase 0 worktree** with superpowers:using-git-worktrees:

```bash
cd /home/debian/apps/dance-hub
git worktree add ../dance-hub-redesign -b redesign/phase-0-quick-fixes main
cd ../dance-hub-redesign
cp /home/debian/apps/dance-hub/docs/superpowers/specs/2026-10-04-community-redesign-program-design.md docs/superpowers/specs/
cp /home/debian/apps/dance-hub/docs/superpowers/plans/2026-10-04-redesign-phase-0-1.md docs/superpowers/plans/
bun install
ls -a | grep -E '^\.env' || echo "no env files, good"
```

- [ ] **Confirm the baseline is green:**

Run: `bun run test -- --selectProjects lib components`
Expected: all suites pass.

- [ ] **Commit the spec and plan on the branch:**

```bash
git add docs/superpowers/specs/2026-10-04-community-redesign-program-design.md docs/superpowers/plans/2026-10-04-redesign-phase-0-1.md
git commit -m "docs: community redesign program spec and phase 0-1 plan"
```

---

# Part A: Phase 0, quick fixes

### Task 1: Admin entry no longer depends on the broadcasts kill-switch

**Files:**
- Modify: `components/CommunityNavbar.tsx` (remove the `broadcastsEnabled` check)
- Modify: `components/MobileNav.tsx:56-58` (`showAdmin`)
- Modify: `__tests__/components/MobileNav.test.tsx` (the two env-based Admin tests)
- Create: `__tests__/components/CommunityNavbar.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (behaviour only).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/CommunityNavbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import CommunityNavbar from "@/components/CommunityNavbar";

jest.mock("next/navigation", () => ({ usePathname: () => "/salsa" }));

const original = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
afterEach(() => {
  process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = original;
});

it("shows Admin to the owner even when the broadcasts kill-switch is off", () => {
  process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = "false";
  render(<CommunityNavbar communitySlug="salsa" isMember isOwner />);
  expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
});

it("shows Admin to a site admin who doesn't own the community", () => {
  process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = "false";
  render(<CommunityNavbar communitySlug="salsa" isMember={false} isAdmin />);
  expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
});

it("hides Admin from members", () => {
  process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = "true";
  render(<CommunityNavbar communitySlug="salsa" isMember />);
  expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
});
```

In `__tests__/components/MobileNav.test.tsx`, replace the test named `"shows Admin in More sheet for owners when broadcasts are enabled"` (and its body) with:

```tsx
  it('shows Admin in More sheet for owners even when broadcasts are disabled', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'false';

    render(<MobileNav {...baseProps} isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('shows Admin in More sheet for site admins', () => {
    render(<MobileNav {...baseProps} isOwner={false} isAdmin={true} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- --selectProjects components -t "Admin"`
Expected: FAIL. The owner/admin tests with the switch off can't find "Admin".

- [ ] **Step 3: Implement**

In `components/CommunityNavbar.tsx`, delete this line:

```tsx
  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === "true";
```

and delete this line inside the `visibleItems` filter:

```tsx
    if (item.label === "Admin" && !broadcastsEnabled) return false;
```

In `components/MobileNav.tsx`, replace:

```tsx
  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true';
  // Site admins (profiles.is_admin) get full chrome on every community —
  // same tabs as a member/owner — so they can actually moderate.
  const hasFullAccess = isMember || isOwner || isAdmin;
  const showAdmin = (isOwner || isAdmin) && broadcastsEnabled;
```

with:

```tsx
  // Site admins (profiles.is_admin) get full chrome on every community, the
  // same tabs as a member or owner, so they can actually moderate.
  const hasFullAccess = isMember || isOwner || isAdmin;
  // The broadcasts kill-switch only gates broadcasts (lib/broadcasts/auth.ts),
  // never the whole admin.
  const showAdmin = isOwner || isAdmin;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects components -t "Admin"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/CommunityNavbar.tsx components/MobileNav.tsx __tests__/components/CommunityNavbar.test.tsx __tests__/components/MobileNav.test.tsx
git commit -m "fix(nav): show Admin to managers regardless of the broadcasts kill-switch"
```

---

### Task 2: Rounded member discount badge

**Files:**
- Create: `lib/format-discount.ts`
- Create: `__tests__/lib/format-discount.test.ts`
- Modify: `components/PrivateLessonCard.tsx:64`
- Modify: `components/LessonBookingModal.tsx:231`

**Interfaces:**
- Produces: `formatDiscountBadge(percent: number | string | null | undefined): string | null` returning e.g. `"29% off"`, or `null` when there is no positive discount.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/format-discount.test.ts`:

```ts
import { formatDiscountBadge } from "@/lib/format-discount";

describe("formatDiscountBadge", () => {
  it("rounds to a whole percent", () => {
    expect(formatDiscountBadge(28.57)).toBe("29% off");
    expect(formatDiscountBadge("25.00")).toBe("25% off");
    expect(formatDiscountBadge(12.4)).toBe("12% off");
  });

  it("never rounds a partial discount up to 100%", () => {
    expect(formatDiscountBadge(99.6)).toBe("99% off");
    expect(formatDiscountBadge(100)).toBe("100% off");
  });

  it("returns null when there is no discount", () => {
    expect(formatDiscountBadge(0)).toBeNull();
    expect(formatDiscountBadge(-5)).toBeNull();
    expect(formatDiscountBadge(null)).toBeNull();
    expect(formatDiscountBadge(undefined)).toBeNull();
    expect(formatDiscountBadge("not a number")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects lib -t formatDiscountBadge`
Expected: FAIL, "Cannot find module '@/lib/format-discount'".

- [ ] **Step 3: Implement**

Create `lib/format-discount.ts`:

```ts
/**
 * The member discount badge on private lessons: "28.57" -> "29% off".
 * A partial discount never rounds up to 100%, which would read as free.
 */
export function formatDiscountBadge(
  percent: number | string | null | undefined
): string | null {
  const n = typeof percent === "string" ? parseFloat(percent) : percent ?? NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = n < 100 ? Math.min(Math.round(n), 99) : 100;
  return `${rounded}% off`;
}
```

In `components/PrivateLessonCard.tsx`, add the import next to the other `@/lib` imports:

```tsx
import { formatDiscountBadge } from "@/lib/format-discount";
```

and replace line 64:

```tsx
                {lesson.member_discount_percentage}% off
```

with:

```tsx
                {formatDiscountBadge(lesson.member_discount_percentage)}
```

In `components/LessonBookingModal.tsx`, add the same import and replace line 231:

```tsx
                {lesson.member_discount_percentage}% off
```

with:

```tsx
                {formatDiscountBadge(lesson.member_discount_percentage)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects lib components -t "formatDiscountBadge|PrivateLesson|LessonBooking"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format-discount.ts __tests__/lib/format-discount.test.ts components/PrivateLessonCard.tsx components/LessonBookingModal.tsx
git commit -m "fix(lessons): round the member discount badge to a whole percent"
```

---

### Task 3: Upcoming classes: loading and error are not "empty"

**Files:**
- Modify: `components/community/CommunitySidebar.tsx` (SWR read and the Upcoming Classes body)
- Modify: `__tests__/components/CommunitySidebar.test.tsx` (add three tests)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/CommunitySidebar.test.tsx`:

```tsx
it("shows a loading state, not 'No upcoming classes', while classes load", () => {
  global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
  render(sidebar(baseProps));
  expect(screen.getByText("Loading classes")).toBeInTheDocument();
  expect(screen.queryByText("No upcoming classes")).not.toBeInTheDocument();
});

it("says the classes didn't load when the request fails", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response)
  ) as jest.Mock;
  render(sidebar(baseProps));
  expect(await screen.findByText(/Classes didn't load/)).toBeInTheDocument();
  expect(screen.queryByText("No upcoming classes")).not.toBeInTheDocument();
});

it("shows the empty state once an empty list arrives", async () => {
  render(sidebar(baseProps));
  expect(await screen.findByText("No upcoming classes")).toBeInTheDocument();
  expect(screen.queryByText("Loading classes")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- --selectProjects components -t "loading state|didn't load|empty state once"`
Expected: FAIL. "Loading classes" and "Classes didn't load" are not found.

- [ ] **Step 3: Implement**

In `components/community/CommunitySidebar.tsx`, replace:

```tsx
  const { data } = useSWR<UpcomingClass[]>(
    `/api/community/${communitySlug}/upcoming-classes`,
    fetcher,
    { refreshInterval: 30000 }
  );
  const upcomingClasses = Array.isArray(data) ? data : [];
```

with:

```tsx
  const { data, error } = useSWR<UpcomingClass[]>(
    `/api/community/${communitySlug}/upcoming-classes`,
    fetcher,
    { refreshInterval: 30000 }
  );
  const upcomingClasses = Array.isArray(data) ? data : [];
  // No answer yet is not the same as "no classes".
  const classesLoading = data === undefined && !error;
  const classesFailed = data === undefined && !!error;
```

Then replace the opening of the list body:

```tsx
        {upcomingClasses.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
```

with:

```tsx
        {classesLoading ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading classes</span>
            <div aria-hidden="true" className="h-16 rounded-xl bg-muted/50 animate-pulse motion-reduce:animate-none" />
            <div aria-hidden="true" className="h-16 rounded-xl bg-muted/50 animate-pulse motion-reduce:animate-none" />
          </div>
        ) : classesFailed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Classes didn&apos;t load. They&apos;ll show up when the connection is back.
          </p>
        ) : upcomingClasses.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
```

(The rest of the ternary, the empty state and the list, stays as it is.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects components -t CommunitySidebar`
Expected: PASS, including the existing canceling/hydration tests.

- [ ] **Step 5: Commit**

```bash
git add components/community/CommunitySidebar.tsx __tests__/components/CommunitySidebar.test.tsx
git commit -m "fix(feed): show loading and error states for upcoming classes"
```

---

### Task 4: No "0 members" flash on the feed

**Files:**
- Modify: `lib/community-data.ts` (add `getRosterCount` after `getCommunityBySlug`)
- Modify: `app/[communitySlug]/page.tsx` (fetch the count, pass `initialMemberCount`)
- Modify: `app/[communitySlug]/FeedClient.tsx:124-135, 233` (prop + initial state)
- Modify: `__tests__/components/FeedClient.test.tsx` (helper option + new test)

**Interfaces:**
- Produces: `getRosterCount(communityId: string): Promise<number>` in `lib/community-data.ts`; new optional prop `initialMemberCount?: number` on `FeedClient`.

- [ ] **Step 1: Write the failing test**

In `__tests__/components/FeedClient.test.tsx`, change the `renderFeed` helper's parameter type and render so it accepts the new prop:

```tsx
function renderFeed(membership: {
  memberStatus: string | null;
  subscriptionStatus: string | null;
  accessEndDate: string | null;
  isMember?: boolean;
  isAdmin?: boolean;
  initialMemberCount?: number;
}) {
```

(The JSX already spreads `{...membership}` onto `FeedClient`, so no other change is needed there.)

Append this test:

```tsx
it("shows the server's member count before the roster loads", () => {
  global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
  renderFeed({ ...ACTIVE, initialMemberCount: 12 });
  expect(screen.getByTestId("members-count")).toHaveTextContent("12");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects components -t "server's member count"`
Expected: FAIL, the header shows "0".

- [ ] **Step 3: Implement**

In `lib/community-data.ts`, add after `getCommunityBySlug`:

```ts
// Same people as the roster served by GET /api/community/[slug]/members, so
// the feed header can start from the right number before that request lands.
// The stored counters on communities drift from this and aren't used.
export const getRosterCount = cache(async (communityId: string): Promise<number> => {
  const row = await queryOne<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM community_members_with_profiles
    WHERE community_id = ${communityId}
      AND status = 'active'
      AND role != 'admin'
      AND (subscription_status = 'active' OR subscription_status IS NULL)
  `;
  return row?.count ?? 0;
});
```

In `app/[communitySlug]/page.tsx`, add `getRosterCount` to the import from `@/lib/community-data`, then replace:

```tsx
  const [membership, isAdmin] = await Promise.all([
    getMembershipStatus(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
  ]);
```

with:

```tsx
  const [membership, isAdmin, initialMemberCount] = await Promise.all([
    getMembershipStatus(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
    getRosterCount(community.id),
  ]);
```

and add the prop to the `<FeedClient` element:

```tsx
      initialMemberCount={initialMemberCount}
```

In `app/[communitySlug]/FeedClient.tsx`, add to `FeedClientProps`:

```tsx
  /** Roster size counted on the server; shown until the roster loads. */
  initialMemberCount?: number;
```

add `initialMemberCount = 0,` to the destructured props of `FeedClient`, and replace:

```tsx
  const [totalMembers, setTotalMembers] = useState(0);
```

with:

```tsx
  const [totalMembers, setTotalMembers] = useState(initialMemberCount);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects components -t FeedClient`
Expected: PASS, including the existing membership tests.

- [ ] **Step 5: Commit**

```bash
git add lib/community-data.ts "app/[communitySlug]/page.tsx" "app/[communitySlug]/FeedClient.tsx" __tests__/components/FeedClient.test.tsx
git commit -m "fix(feed): start the member count from the server's roster count"
```

---

### Task 5: Release Phase 0

**Files:** none (verification and deploy).

- [ ] **Step 1: Run the affected suites**

Run: `bun run test -- --selectProjects lib components`
Expected: all pass. (No API routes changed in this phase, so the `api` and `storage` projects, which need a database, are not part of this gate.)

- [ ] **Step 2: Lint and build in the worktree**

Run: `bun lint && bun run build`
Expected: no errors. Build output ends with the route table.

- [ ] **Step 3: One code-quality review of the release**

Dispatch one reviewer subagent (session model) with: the spec path, this plan's Part A, and `git diff main...HEAD`. Fix anything it confirms, re-run Step 1, commit fixes as `fix: address phase 0 review`.

- [ ] **Step 4: Push and deploy to preprod (ask Logan first)**

```bash
git push -u origin redesign/phase-0-quick-fixes
cd /home/debian/apps/dance-hub && ./deploy-preprod.sh restart redesign/phase-0-quick-fixes
```

Expected: script ends with "Done! Preprod restarted."

- [ ] **Step 5: Logan checks preprod**

Checklist to send: Admin tab visible as owner; a private lesson with a 28.57% discount shows "29% off"; feed sidebar shows a loading state on a slow connection (devtools throttling) and never "No upcoming classes" while loading; feed header shows the member count immediately.

- [ ] **Step 6: Merge and deploy to prod (after Logan approves)**

```bash
cd /home/debian/apps/dance-hub
git checkout main && git pull
git merge --no-ff redesign/phase-0-quick-fixes -m "Merge redesign phase 0: quick fixes"
git push origin main
./deploy.sh code
```

Expected: deploy finishes and the site serves the new release.

---

# Part B: Phase 1, foundation

Start Phase 1 from the merged `main`:

```bash
cd /home/debian/apps/dance-hub-redesign
git fetch origin && git checkout -b redesign/phase-1-foundation origin/main
```

### Task 6: Color tokens and shadows

**Files:**
- Modify: `app/globals.css` (add `--ds-*` variables inside the first `@layer base { :root { ... } }`)
- Modify: `tailwind.config.js` (add colors and `boxShadow` under `theme.extend`)
- Create: `__tests__/lib/design-tokens.test.ts`

**Interfaces:**
- Produces Tailwind classes used by every later task: `bg-canvas`, `bg-surface`, `bg-surface-2`, `bg-surface-3`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-line`, `border-line-strong`, `bg-brand`, `bg-brand-hover`, `text-brand-ink`, `bg-brand-soft`, `border-brand-line`, `text-ok`/`bg-ok-soft`, `text-warn`/`bg-warn-soft`, `text-live`/`bg-live-soft`, `shadow-card`, `shadow-raised`, `shadow-overlay`. All colors support opacity modifiers (`bg-live/35`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/design-tokens.test.ts`:

```ts
import fs from "fs";
import path from "path";

// tailwind.config.js is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require("../../tailwind.config.js");
const css = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

const TOKENS = [
  "canvas", "surface", "surface-2", "surface-3",
  "ink", "ink-2", "ink-3", "line", "line-strong",
  "brand", "brand-hover", "brand-ink", "brand-soft", "brand-line",
  "ok", "ok-soft", "warn", "warn-soft", "live", "live-soft",
];

describe("design tokens", () => {
  it.each(TOKENS)("defines --ds-%s as RGB channels", (token) => {
    expect(css).toMatch(new RegExp(`--ds-${token}:\\s*\\d{1,3} \\d{1,3} \\d{1,3};`));
  });

  it("maps tokens to Tailwind with opacity support", () => {
    const c = config.theme.extend.colors;
    expect(c.canvas).toBe("rgb(var(--ds-canvas) / <alpha-value>)");
    expect(c.surface.DEFAULT).toBe("rgb(var(--ds-surface) / <alpha-value>)");
    expect(c.surface["2"]).toBe("rgb(var(--ds-surface-2) / <alpha-value>)");
    expect(c.ink["3"]).toBe("rgb(var(--ds-ink-3) / <alpha-value>)");
    expect(c.line.strong).toBe("rgb(var(--ds-line-strong) / <alpha-value>)");
    expect(c.brand.soft).toBe("rgb(var(--ds-brand-soft) / <alpha-value>)");
    expect(c.live.soft).toBe("rgb(var(--ds-live-soft) / <alpha-value>)");
  });

  it("keeps the old color names unchanged", () => {
    const c = config.theme.extend.colors;
    expect(c.primary.DEFAULT).toBe("hsl(var(--primary))");
    expect(c.background).toBe("hsl(var(--background))");
  });

  it("defines the three shadows", () => {
    const s = config.theme.extend.boxShadow;
    expect(Object.keys(s)).toEqual(expect.arrayContaining(["card", "raised", "overlay"]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects lib -t "design tokens"`
Expected: FAIL, `--ds-canvas` not found.

- [ ] **Step 3: Implement**

In `app/globals.css`, inside the first `@layer base { :root { ... } }` block, right after `--radius: 0.5rem;`, add:

```css
    /* Redesign tokens (light only). RGB channels so Tailwind opacity works. */
    --ds-canvas: 246 244 250;
    --ds-surface: 255 255 255;
    --ds-surface-2: 241 237 248;
    --ds-surface-3: 231 225 241;
    --ds-ink: 30 23 48;
    --ds-ink-2: 93 85 113;
    --ds-ink-3: 115 107 136;
    --ds-line: 228 222 238;
    --ds-line-strong: 207 197 224;
    --ds-brand: 142 87 219;
    --ds-brand-hover: 122 69 200;
    --ds-brand-ink: 104 52 178;
    --ds-brand-soft: 241 234 253;
    --ds-brand-line: 216 199 246;
    --ds-ok: 29 116 71;
    --ds-ok-soft: 227 244 234;
    --ds-warn: 138 75 0;
    --ds-warn-soft: 255 242 222;
    --ds-live: 207 38 55;
    --ds-live-soft: 253 236 238;
```

In `tailwind.config.js`, inside `theme.extend.colors`, after the `chart` entry, add:

```js
        // Redesign tokens (see docs/superpowers/specs/2026-10-04-community-redesign-program-design.md)
        canvas: "rgb(var(--ds-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--ds-surface) / <alpha-value>)",
          2: "rgb(var(--ds-surface-2) / <alpha-value>)",
          3: "rgb(var(--ds-surface-3) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ds-ink) / <alpha-value>)",
          2: "rgb(var(--ds-ink-2) / <alpha-value>)",
          3: "rgb(var(--ds-ink-3) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--ds-line) / <alpha-value>)",
          strong: "rgb(var(--ds-line-strong) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--ds-brand) / <alpha-value>)",
          hover: "rgb(var(--ds-brand-hover) / <alpha-value>)",
          ink: "rgb(var(--ds-brand-ink) / <alpha-value>)",
          soft: "rgb(var(--ds-brand-soft) / <alpha-value>)",
          line: "rgb(var(--ds-brand-line) / <alpha-value>)",
        },
        ok: {
          DEFAULT: "rgb(var(--ds-ok) / <alpha-value>)",
          soft: "rgb(var(--ds-ok-soft) / <alpha-value>)",
        },
        warn: {
          DEFAULT: "rgb(var(--ds-warn) / <alpha-value>)",
          soft: "rgb(var(--ds-warn-soft) / <alpha-value>)",
        },
        live: {
          DEFAULT: "rgb(var(--ds-live) / <alpha-value>)",
          soft: "rgb(var(--ds-live-soft) / <alpha-value>)",
        },
```

and inside `theme.extend`, after `borderRadius`, add:

```js
      boxShadow: {
        card: "0 1px 2px rgba(30, 23, 48, .06), 0 1px 1px rgba(30, 23, 48, .03)",
        raised: "0 10px 28px -12px rgba(30, 23, 48, .22), 0 2px 6px rgba(30, 23, 48, .05)",
        overlay: "0 24px 60px -20px rgba(30, 23, 48, .35), 0 4px 12px rgba(30, 23, 48, .08)",
      },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- --selectProjects lib -t "design tokens"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tailwind.config.js __tests__/lib/design-tokens.test.ts
git commit -m "feat(design): add redesign color tokens and shadows"
```

---

### Task 7: Offerings settings (columns, type, helpers)

**Files:**
- Create: `supabase/migrations/2026-10-05_community_offerings.sql`
- Modify: `lib/community-data.ts` (`CommunityRow`: three optional fields)
- Create: `lib/offerings.ts`
- Create: `__tests__/lib/offerings.test.ts`

**Interfaces:**
- Produces:
  - `type OfferingKey = "liveClasses" | "courses" | "privateLessons"`
  - `type Offerings = Record<OfferingKey, boolean>`
  - `getOfferings(c: { offers_live_classes?: boolean | null; offers_courses?: boolean | null; offers_private_lessons?: boolean | null }): Offerings`
  - `type OfferingAccess = "allow" | "banner" | "redirect"`
  - `offeringAccess(offerings: Offerings, key: OfferingKey, canManage: boolean): OfferingAccess`
  - `ALL_OFFERINGS: Offerings` (all true, for tests and defaults)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/offerings.test.ts`:

```ts
import { ALL_OFFERINGS, getOfferings, offeringAccess } from "@/lib/offerings";

describe("getOfferings", () => {
  it("reads the three columns", () => {
    expect(
      getOfferings({ offers_live_classes: false, offers_courses: true, offers_private_lessons: false })
    ).toEqual({ liveClasses: false, courses: true, privateLessons: false });
  });

  it("treats missing columns (migration not applied yet) as on", () => {
    expect(getOfferings({})).toEqual(ALL_OFFERINGS);
  });

  it("treats null as on", () => {
    expect(
      getOfferings({ offers_live_classes: null, offers_courses: null, offers_private_lessons: null })
    ).toEqual(ALL_OFFERINGS);
  });
});

describe("offeringAccess", () => {
  const coursesOff = { ...ALL_OFFERINGS, courses: false };

  it("allows everyone when the offering is on", () => {
    expect(offeringAccess(ALL_OFFERINGS, "courses", false)).toBe("allow");
    expect(offeringAccess(ALL_OFFERINGS, "courses", true)).toBe("allow");
  });

  it("redirects members when it's off", () => {
    expect(offeringAccess(coursesOff, "courses", false)).toBe("redirect");
  });

  it("lets managers in with a banner when it's off", () => {
    expect(offeringAccess(coursesOff, "courses", true)).toBe("banner");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects lib -t "getOfferings|offeringAccess"`
Expected: FAIL, "Cannot find module '@/lib/offerings'".

- [ ] **Step 3: Implement**

Create `supabase/migrations/2026-10-05_community_offerings.sql`:

```sql
-- Offerings: which parts of a community are switched on (community redesign,
-- phase 1). All default to true, so every existing community keeps the tabs
-- it has today. The admin screen that changes them ships in phase 7.
--
-- Safe to run more than once.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS offers_live_classes boolean NOT NULL DEFAULT true;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS offers_courses boolean NOT NULL DEFAULT true;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS offers_private_lessons boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN communities.offers_live_classes IS 'Live classes and the Calendar tab are on for members.';
COMMENT ON COLUMN communities.offers_courses IS 'Courses and the Classroom tab are on for members.';
COMMENT ON COLUMN communities.offers_private_lessons IS 'Private lessons and their tab are on.';
```

In `lib/community-data.ts`, add to `interface CommunityRow` (after `about_page`):

```ts
  offers_live_classes?: boolean | null;
  offers_courses?: boolean | null;
  offers_private_lessons?: boolean | null;
```

Create `lib/offerings.ts`:

```ts
export type OfferingKey = "liveClasses" | "courses" | "privateLessons";
export type Offerings = Record<OfferingKey, boolean>;

export const ALL_OFFERINGS: Offerings = {
  liveClasses: true,
  courses: true,
  privateLessons: true,
};

interface OfferingColumns {
  offers_live_classes?: boolean | null;
  offers_courses?: boolean | null;
  offers_private_lessons?: boolean | null;
}

/** Anything but an explicit false is on (covers rows from before the migration). */
export function getOfferings(c: OfferingColumns): Offerings {
  return {
    liveClasses: c.offers_live_classes !== false,
    courses: c.offers_courses !== false,
    privateLessons: c.offers_private_lessons !== false,
  };
}

export type OfferingAccess = "allow" | "banner" | "redirect";

/**
 * What happens when someone opens a page that belongs to an offering: members
 * are sent to the feed when it's off; owners and site admins still get in, with
 * a banner, so they can see what they turned off.
 */
export function offeringAccess(
  offerings: Offerings,
  key: OfferingKey,
  canManage: boolean
): OfferingAccess {
  if (offerings[key]) return "allow";
  return canManage ? "banner" : "redirect";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- --selectProjects lib -t "getOfferings|offeringAccess"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-10-05_community_offerings.sql lib/community-data.ts lib/offerings.ts __tests__/lib/offerings.test.ts
git commit -m "feat(offerings): add community offerings columns and helpers"
```

---

### Task 8: Time helpers and hooks

**Files:**
- Create: `lib/time/format.ts`
- Create: `hooks/use-now.ts`
- Create: `hooks/use-countdown.ts`
- Create: `__tests__/lib/time-format.test.ts`
- Create: `__tests__/components/use-now.test.tsx`

**Interfaces:**
- Consumes: `dateKeyInTz(instant: Date | string, tz: string): string` and `addDaysToKey(key: string, days: number): string` from `lib/calendar-week.ts`.
- Produces:
  - `formatTimeInZone(instant: Date | string | number, timeZone?: string, locale?: string): string`
  - `zoneAbbreviation(instant: Date | string | number, timeZone: string): string`
  - `sameUtcOffset(instant: Date | string | number, a: string, b: string): boolean`
  - `relativeDayWord(instant: Date | string | number, now: Date, timeZone: string, locale?: string): string`
  - `startsIn(target: Date | string | number, now: Date): string`
  - `useNow(intervalMs?: number): Date`
  - `useCountdown(target: Date | string | number | null | undefined, intervalMs?: number): string | null`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/time-format.test.ts`:

```ts
import {
  formatTimeInZone,
  relativeDayWord,
  sameUtcOffset,
  startsIn,
  zoneAbbreviation,
} from "@/lib/time/format";

const SUNDAY_17Z = new Date("2026-10-04T17:00:00Z"); // 19:00 in Berlin (CEST)

describe("formatTimeInZone", () => {
  it("formats the wall-clock time in a given zone", () => {
    expect(formatTimeInZone(SUNDAY_17Z, "Europe/Berlin", "en-GB")).toBe("19:00");
    expect(formatTimeInZone(SUNDAY_17Z, "Europe/Tallinn", "en-GB")).toBe("20:00");
    // Newer ICU puts a narrow no-break space before PM; compare with plain spaces.
    expect(formatTimeInZone(SUNDAY_17Z, "America/New_York", "en-US").replace(/\s/g, " ")).toBe("1:00 PM");
  });
});

describe("zoneAbbreviation", () => {
  it("names the zone at that moment", () => {
    expect(zoneAbbreviation(SUNDAY_17Z, "Europe/Berlin")).toBe("CEST");
    expect(zoneAbbreviation(new Date("2026-01-11T18:00:00Z"), "Europe/Berlin")).toBe("CET");
  });
});

describe("sameUtcOffset", () => {
  it("compares offsets at that moment", () => {
    expect(sameUtcOffset(SUNDAY_17Z, "Europe/Berlin", "Europe/Madrid")).toBe(true);
    expect(sameUtcOffset(SUNDAY_17Z, "Europe/Berlin", "Europe/Tallinn")).toBe(false);
  });
});

describe("relativeDayWord", () => {
  const now = new Date("2026-10-04T08:00:00Z");

  it("says Today and Tomorrow in the given zone", () => {
    expect(relativeDayWord(SUNDAY_17Z, now, "Europe/Berlin", "en-US")).toBe("Today");
    expect(relativeDayWord(new Date("2026-10-05T17:00:00Z"), now, "Europe/Berlin", "en-US")).toBe("Tomorrow");
  });

  it("uses the zone's calendar day, not UTC's", () => {
    // 23:30 UTC on Oct 4 is 01:30 on Oct 5 in Berlin.
    expect(relativeDayWord(new Date("2026-10-04T23:30:00Z"), now, "Europe/Berlin", "en-US")).toBe("Tomorrow");
  });

  it("falls back to the weekday name", () => {
    expect(relativeDayWord(new Date("2026-10-07T18:00:00Z"), now, "Europe/Berlin", "en-US")).toBe("Wednesday");
  });
});

describe("startsIn", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const plus = (ms: number) => new Date(now.getTime() + ms);
  const MIN = 60_000;

  it("counts minutes, hours and days", () => {
    expect(startsIn(plus(4 * MIN), now)).toBe("in 4 min");
    expect(startsIn(plus(30_000), now)).toBe("in 1 min");
    expect(startsIn(plus(192 * MIN), now)).toBe("in 3 h 12 min");
    expect(startsIn(plus(180 * MIN), now)).toBe("in 3 h");
    expect(startsIn(plus(24 * 60 * MIN), now)).toBe("in 1 day");
    expect(startsIn(plus((52 * 60) * MIN), now)).toBe("in 2 days, 4 h");
  });

  it("says now once the moment has passed", () => {
    expect(startsIn(plus(-5 * MIN), now)).toBe("now");
    expect(startsIn(now, now)).toBe("now");
  });
});
```

Create `__tests__/components/use-now.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { useNow } from "@/hooks/use-now";
import { useCountdown } from "@/hooks/use-countdown";

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-04T12:00:00Z"));
});
afterEach(() => jest.useRealTimers());

it("useNow ticks on the interval", () => {
  const { result } = renderHook(() => useNow(60_000));
  expect(result.current.toISOString()).toBe("2026-10-04T12:00:00.000Z");
  act(() => {
    jest.advanceTimersByTime(60_000);
  });
  expect(result.current.toISOString()).toBe("2026-10-04T12:01:00.000Z");
});

it("useCountdown updates as time passes", () => {
  const target = new Date("2026-10-04T12:10:00Z");
  const { result } = renderHook(() => useCountdown(target, 60_000));
  expect(result.current).toBe("in 10 min");
  act(() => {
    jest.advanceTimersByTime(5 * 60_000);
  });
  expect(result.current).toBe("in 5 min");
});

it("useCountdown returns null without a target", () => {
  const { result } = renderHook(() => useCountdown(null));
  expect(result.current).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- --selectProjects lib components -t "formatTimeInZone|zoneAbbreviation|sameUtcOffset|relativeDayWord|startsIn|useNow|useCountdown"`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `lib/time/format.ts`:

```ts
import { addDaysToKey, dateKeyInTz } from "@/lib/calendar-week";

type Instant = Date | string | number;
const toDate = (i: Instant) => (i instanceof Date ? i : new Date(i));

/** "7:00 PM" (en-US) or "19:00" (en-GB) at that moment in `timeZone`. */
export function formatTimeInZone(instant: Instant, timeZone?: string, locale?: string): string {
  return toDate(instant).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
}

/** Short zone name at that moment, for example "CEST" or "CET". */
export function zoneAbbreviation(instant: Instant, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(toDate(instant))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).formatToParts(instant).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

/** True when both zones show the same wall-clock time at that moment. */
export function sameUtcOffset(instant: Instant, a: string, b: string): boolean {
  const d = toDate(instant);
  return offsetMinutes(d, a) === offsetMinutes(d, b);
}

/** "Today", "Tomorrow", or the weekday name, using the calendar day in `timeZone`. */
export function relativeDayWord(instant: Instant, now: Date, timeZone: string, locale?: string): string {
  const d = toDate(instant);
  const key = dateKeyInTz(d, timeZone);
  const today = dateKeyInTz(now, timeZone);
  if (key === today) return "Today";
  if (key === addDaysToKey(today, 1)) return "Tomorrow";
  return d.toLocaleDateString(locale, { weekday: "long", timeZone });
}

/** "in 4 min", "in 3 h 12 min", "in 2 days, 4 h", or "now" once it has started. */
export function startsIn(target: Instant, now: Date): string {
  const ms = toDate(target).getTime() - now.getTime();
  if (ms <= 0) return "now";
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `in ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `in ${d} ${d === 1 ? "day" : "days"}${hh ? `, ${hh} h` : ""}`;
}
```

Create `hooks/use-now.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs`. Client components only. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

Create `hooks/use-countdown.ts`:

```ts
"use client";

import { startsIn } from "@/lib/time/format";
import { useNow } from "@/hooks/use-now";

/** "in 3 h 12 min" for `target`, kept fresh; null when there is no target. */
export function useCountdown(
  target: Date | string | number | null | undefined,
  intervalMs = 30_000
): string | null {
  const now = useNow(intervalMs);
  if (target == null) return null;
  return startsIn(target, now);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects lib components -t "formatTimeInZone|zoneAbbreviation|sameUtcOffset|relativeDayWord|startsIn|useNow|useCountdown"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/time/format.ts hooks/use-now.ts hooks/use-countdown.ts __tests__/lib/time-format.test.ts __tests__/components/use-now.test.tsx
git commit -m "feat(time): add time zone formatting helpers and countdown hooks"
```

---

### Task 9: Shared components (`components/ds/`)

**Files:**
- Create: `components/ds/pill.tsx`, `components/ds/chip.tsx`, `components/ds/segmented.tsx`, `components/ds/empty-state.tsx`, `components/ds/skeleton.tsx`, `components/ds/date-tile.tsx`, `components/ds/initials-avatar.tsx`, `components/ds/facepile.tsx`, `components/ds/inline-confirm.tsx`
- Create: `__tests__/components/ds.test.tsx`

**Interfaces:**
- Consumes: Task 6 Tailwind classes; `cn` from `@/lib/utils`.
- Produces:
  - `Pill({ variant?: "neutral" | "brand" | "ok" | "warn" | "live" | "muted", ...span props })`
  - `Chip({ label: string; pressed: boolean; count?: number; dotColor?: string; ...button props })`
  - `Segmented<T extends string>({ options: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; label: string; className?: string })`
  - `EmptyState({ icon?: React.ReactNode; title: string; children?: React.ReactNode; actions?: React.ReactNode; className?: string })`
  - `Skeleton({ className?: string })`
  - `DateTile({ date: Date | string | number; timeZone?: string; variant?: "brand" | "live"; showWeekday?: boolean; className?: string })`
  - `hueForId(id: string): number` and `InitialsAvatar({ id: string; name: string; imageUrl?: string | null; size?: number; className?: string })`
  - `Facepile({ people: { id: string; name: string; imageUrl?: string | null }[]; max?: number; size?: number; total?: number })`
  - `InlineConfirm({ title: string; children?: React.ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void; destructive?: boolean; busy?: boolean })`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/ds.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pill } from "@/components/ds/pill";
import { Chip } from "@/components/ds/chip";
import { Segmented } from "@/components/ds/segmented";
import { EmptyState } from "@/components/ds/empty-state";
import { Skeleton } from "@/components/ds/skeleton";
import { DateTile } from "@/components/ds/date-tile";
import { InitialsAvatar, hueForId } from "@/components/ds/initials-avatar";
import { Facepile } from "@/components/ds/facepile";
import { InlineConfirm } from "@/components/ds/inline-confirm";

it("Pill renders its text", () => {
  render(<Pill variant="ok">Paid</Pill>);
  expect(screen.getByText("Paid")).toBeInTheDocument();
});

it("Chip exposes pressed state, count and click", async () => {
  const onClick = jest.fn();
  render(<Chip label="Technique" pressed={false} count={2} dotColor="#10b981" onClick={onClick} />);
  const chip = screen.getByRole("button", { name: /technique/i });
  expect(chip).toHaveAttribute("aria-pressed", "false");
  expect(chip).toHaveTextContent("2");
  await userEvent.click(chip);
  expect(onClick).toHaveBeenCalled();
});

it("Segmented marks the selected option and reports changes", async () => {
  const onChange = jest.fn();
  render(
    <Segmented
      label="Sort posts"
      value="latest"
      onChange={onChange}
      options={[{ value: "latest", label: "Latest" }, { value: "top", label: "Top" }]}
    />
  );
  expect(screen.getByRole("group", { name: "Sort posts" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Latest" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Top" }));
  expect(onChange).toHaveBeenCalledWith("top");
});

it("EmptyState shows title, text and actions", () => {
  render(
    <EmptyState title="No posts yet" actions={<button>Write the first post</button>}>
      Introduce yourself.
    </EmptyState>
  );
  expect(screen.getByRole("heading", { name: "No posts yet" })).toBeInTheDocument();
  expect(screen.getByText("Introduce yourself.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Write the first post" })).toBeInTheDocument();
});

it("Skeleton is hidden from assistive tech", () => {
  const { container } = render(<Skeleton className="h-4" />);
  expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
});

it("DateTile shows month and day in the given zone", () => {
  // 23:30 UTC on Oct 4 is Oct 5 in Berlin.
  render(<DateTile date="2026-10-04T23:30:00Z" timeZone="Europe/Berlin" showWeekday />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText(/oct/i)).toBeInTheDocument();
  expect(screen.getByText(/mon/i)).toBeInTheDocument();
});

it("InitialsAvatar uses a stable hue and the first letter", () => {
  expect(hueForId("user-1")).toBe(hueForId("user-1"));
  render(<InitialsAvatar id="user-1" name="anika" />);
  expect(screen.getByText("A")).toBeInTheDocument();
});

it("Facepile caps the faces and shows the rest as a number", () => {
  const people = ["Ana", "Ben", "Cy", "Dee", "Eve", "Fay"].map((name, i) => ({ id: `u${i}`, name }));
  render(<Facepile people={people} max={3} total={28} />);
  expect(screen.getByText("+25")).toBeInTheDocument();
  expect(screen.queryByText("D")).not.toBeInTheDocument();
});

it("InlineConfirm focuses Cancel first and runs the right callback", async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <InlineConfirm title="Leave BachataFlow?" confirmLabel="Leave community" onConfirm={onConfirm} onCancel={onCancel}>
      You keep access until 21 Oct.
    </InlineConfirm>
  );
  expect(screen.getByRole("alertdialog", { name: /leave bachataflow/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Leave community" }));
  expect(onConfirm).toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- --selectProjects components -t "Pill|Chip|Segmented|EmptyState|Skeleton|DateTile|InitialsAvatar|Facepile|InlineConfirm"`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `components/ds/pill.tsx`:

```tsx
import { cn } from "@/lib/utils";

export type PillVariant = "neutral" | "brand" | "ok" | "warn" | "live" | "muted";

const VARIANTS: Record<PillVariant, string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  live: "bg-live-soft text-live",
  muted: "border border-dashed border-line-strong text-ink-3",
};

export function Pill({
  variant = "neutral",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: PillVariant }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold",
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
```

Create `components/ds/chip.tsx`:

```tsx
import { cn } from "@/lib/utils";

export interface ChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  pressed: boolean;
  count?: number;
  dotColor?: string;
}

export function Chip({ label, pressed, count, dotColor, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        pressed
          ? "border-brand-line bg-brand-soft font-semibold text-brand-ink"
          : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
        className
      )}
      {...rest}
    >
      {dotColor && (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      )}
      {label}
      {count !== undefined && (
        <span className={cn("text-[12.5px] tabular-nums", pressed ? "opacity-80" : "text-ink-3")}>{count}</span>
      )}
    </button>
  );
}
```

Create `components/ds/segmented.tsx`:

```tsx
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex shrink-0 rounded-[10px] bg-surface-2 p-[3px]", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-7 rounded-[7px] px-2.5 text-[13.5px] font-medium transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
              selected ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

Create `components/ds/empty-state.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-9 text-center",
        className
      )}
    >
      {icon && (
        <div aria-hidden="true" className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[19px] font-semibold text-ink [text-wrap:balance]">{title}</h3>
      {children && <div className="max-w-[44ch] text-[15px] text-ink-2">{children}</div>}
      {actions && <div className="mt-1.5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
```

Create `components/ds/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils";

/** Placeholder block for loading states; static for reduced-motion users. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none", className)}
    />
  );
}
```

Create `components/ds/date-tile.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * Calendar-style month/day tile. Pass `timeZone` (the viewer's) when this
 * renders on the server too, so server and browser agree on the day.
 */
export function DateTile({
  date,
  timeZone,
  variant = "brand",
  showWeekday = false,
  className,
}: {
  date: Date | string | number;
  timeZone?: string;
  variant?: "brand" | "live";
  showWeekday?: boolean;
  className?: string;
}) {
  const d = new Date(date);
  const month = d.toLocaleDateString(undefined, { month: "short", timeZone });
  const day = d.toLocaleDateString(undefined, { day: "numeric", timeZone });
  const weekday = d.toLocaleDateString(undefined, { weekday: "short", timeZone });
  return (
    <div
      aria-hidden="true"
      className={cn("w-[52px] shrink-0 overflow-hidden rounded-xl border border-line bg-surface text-center", className)}
    >
      <span
        className={cn(
          "block py-1 text-[11px] font-semibold tracking-wide text-white",
          variant === "live" ? "bg-live" : "bg-brand"
        )}
      >
        {month}
      </span>
      <span className="block py-1.5 font-display text-[22px] font-semibold leading-none tabular-nums text-ink">{day}</span>
      {showWeekday && <span className="block pb-1.5 text-[11px] font-semibold text-ink-3">{weekday}</span>}
    </div>
  );
}
```

Create `components/ds/initials-avatar.tsx`:

```tsx
import { cn } from "@/lib/utils";

const HUES = [268, 330, 18, 160, 200, 40, 290, 120, 222, 350, 8, 185];

/** Same id, same color, everywhere. */
export function hueForId(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export function InitialsAvatar({
  id,
  name,
  imageUrl,
  size = 36,
  className,
}: {
  id: string;
  name: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const hue = hueForId(id);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 select-none place-items-center rounded-full font-display font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: `hsl(${hue} 62% 89%)`,
        color: `hsl(${hue} 55% 28%)`,
      }}
    >
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}
```

Create `components/ds/facepile.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/ds/initials-avatar";

export function Facepile({
  people,
  max = 5,
  size = 28,
  total,
}: {
  people: { id: string; name: string; imageUrl?: string | null }[];
  max?: number;
  size?: number;
  total?: number;
}) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, (total ?? people.length) - shown.length);
  return (
    <span className="inline-flex items-center">
      <span className="inline-flex">
        {shown.map((p, i) => (
          <span key={p.id} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}>
            <InitialsAvatar id={p.id} name={p.name} imageUrl={p.imageUrl} size={size} />
          </span>
        ))}
      </span>
      {extra > 0 && <span className="ml-1.5 text-[13px] font-semibold tabular-nums text-ink-2">+{extra}</span>}
    </span>
  );
}
```

Create `components/ds/inline-confirm.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/** In-page confirmation, used instead of window.confirm. Focuses Cancel. */
export function InlineConfirm({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = true,
  busy = false,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  busy?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border p-3",
        destructive ? "border-live/35 bg-live-soft" : "border-brand-line bg-brand-soft"
      )}
    >
      <p className="text-sm text-ink">
        <strong id={titleId}>{title}</strong>
        {children ? <> {children}</> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cn(
            "h-8 rounded-lg px-3 text-[13px] font-semibold text-white disabled:opacity-50",
            destructive ? "bg-live hover:bg-live/90" : "bg-brand hover:bg-brand-hover"
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects components -t "Pill|Chip|Segmented|EmptyState|Skeleton|DateTile|InitialsAvatar|Facepile|InlineConfirm"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ds __tests__/components/ds.test.tsx
git commit -m "feat(design): add shared redesign components"
```

---

### Task 10: Tab rules shared by the top bar and the phone nav

**Files:**
- Create: `lib/community-nav.ts`
- Create: `__tests__/lib/community-nav.test.ts`

**Interfaces:**
- Consumes: `Offerings`, `ALL_OFFERINGS` from `lib/offerings.ts` (Task 7).
- Produces:
  - `type CommunityTabKey = "community" | "classroom" | "private-lessons" | "calendar" | "about" | "admin"`
  - `interface CommunityTab { key: CommunityTabKey; label: string; shortLabel: string; href: string; id: string }`
  - `getCommunityTabs(input: { slug: string; isMember: boolean; isOwner: boolean; isAdmin: boolean; offerings: Offerings }): CommunityTab[]`
  - `isTabActive(tab: CommunityTab, pathname: string | null, slug: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/community-nav.test.ts`:

```ts
import { getCommunityTabs, isTabActive } from "@/lib/community-nav";
import { ALL_OFFERINGS } from "@/lib/offerings";

const base = { slug: "salsa", isMember: false, isOwner: false, isAdmin: false, offerings: ALL_OFFERINGS };
const keys = (input: Parameters<typeof getCommunityTabs>[0]) => getCommunityTabs(input).map((t) => t.key);

describe("getCommunityTabs", () => {
  it("gives visitors Community, Private lessons and About", () => {
    expect(keys(base)).toEqual(["community", "private-lessons", "about"]);
  });

  it("gives members every member tab, without Admin", () => {
    expect(keys({ ...base, isMember: true })).toEqual(["community", "classroom", "private-lessons", "calendar", "about"]);
  });

  it("adds Admin for owners and site admins", () => {
    expect(keys({ ...base, isOwner: true })).toContain("admin");
    expect(keys({ ...base, isAdmin: true })).toContain("admin");
  });

  it("hides the tabs of switched-off offerings", () => {
    const tabs = keys({
      ...base,
      isMember: true,
      offerings: { liveClasses: false, courses: false, privateLessons: false },
    });
    expect(tabs).toEqual(["community", "about"]);
  });

  it("keeps the onboarding tour IDs", () => {
    const tabs = getCommunityTabs({ ...base, isOwner: true });
    expect(tabs.map((t) => t.id)).toEqual([
      "tab-community", "tab-classroom", "tab-private-lessons", "tab-calendar", "tab-about", "tab-admin",
    ]);
  });

  it("encodes the slug in links", () => {
    expect(getCommunityTabs({ ...base, slug: "café" })[0].href).toBe("/caf%C3%A9");
  });
});

describe("isTabActive", () => {
  const tabs = getCommunityTabs({ ...base, isMember: true });
  const tab = (key: string) => tabs.find((t) => t.key === key)!;

  it("matches the feed only on the exact root", () => {
    expect(isTabActive(tab("community"), "/salsa", "salsa")).toBe(true);
    expect(isTabActive(tab("community"), "/salsa/private-lessons", "salsa")).toBe(false);
  });

  it("matches nested pages", () => {
    expect(isTabActive(tab("classroom"), "/salsa/classroom/footwork", "salsa")).toBe(true);
  });

  it("doesn't confuse similar paths", () => {
    expect(isTabActive(tab("classroom"), "/salsa/classroomx", "salsa")).toBe(false);
    expect(isTabActive(tab("community"), "/salsa-club", "salsa")).toBe(false);
  });

  it("is false without a pathname", () => {
    expect(isTabActive(tab("community"), null, "salsa")).toBe(false);
  });

  it("survives a malformed escape in the path", () => {
    expect(isTabActive(tab("classroom"), "/salsa/classroom/100%", "salsa")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects lib -t "getCommunityTabs|isTabActive"`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/community-nav.ts`:

```ts
import { communityPath } from "@/lib/safe-redirect";
import type { Offerings } from "@/lib/offerings";

export type CommunityTabKey =
  | "community"
  | "classroom"
  | "private-lessons"
  | "calendar"
  | "about"
  | "admin";

export interface CommunityTab {
  key: CommunityTabKey;
  label: string;
  /** Label for the phone tab bar. */
  shortLabel: string;
  href: string;
  /** Element id; the onboarding tour (lib/tourSteps.ts) targets these. */
  id: string;
}

export function getCommunityTabs({
  slug,
  isMember,
  isOwner,
  isAdmin,
  offerings,
}: {
  slug: string;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  offerings: Offerings;
}): CommunityTab[] {
  // Site admins get the same tabs as members and owners so they can moderate.
  const full = isMember || isOwner || isAdmin;
  const manager = isOwner || isAdmin;
  const tab = (key: CommunityTabKey, label: string, shortLabel: string, rest: string): CommunityTab => ({
    key,
    label,
    shortLabel,
    href: communityPath(slug, rest),
    id: `tab-${key}`,
  });

  const tabs: CommunityTab[] = [tab("community", "Community", "Community", "")];
  if (full && offerings.courses) tabs.push(tab("classroom", "Classroom", "Classroom", "/classroom"));
  if (offerings.privateLessons) tabs.push(tab("private-lessons", "Private lessons", "Lessons", "/private-lessons"));
  if (full && offerings.liveClasses) tabs.push(tab("calendar", "Calendar", "Calendar", "/calendar"));
  tabs.push(tab("about", "About", "About", "/about"));
  if (manager) tabs.push(tab("admin", "Admin", "Admin", "/admin"));
  return tabs;
}

// usePathname may hand back encoded or decoded paths; compare decoded forms.
// A malformed escape (a literal "%") falls back to the raw string.
function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

export function isTabActive(tab: CommunityTab, pathname: string | null, slug: string): boolean {
  if (!pathname) return false;
  const path = safeDecode(pathname);
  const href = safeDecode(tab.href);
  if (href === safeDecode(communityPath(slug))) return path === href;
  return path === href || path.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- --selectProjects lib -t "getCommunityTabs|isTabActive"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/community-nav.ts __tests__/lib/community-nav.test.ts
git commit -m "feat(nav): shared community tab rules"
```

---

### Task 11: Merged top bar

**Files:**
- Create: `components/community-shell/top-bar.tsx`
- Create: `__tests__/components/TopBar.test.tsx`

**Interfaces:**
- Consumes: `getCommunityTabs`, `isTabActive` (Task 10); `Offerings` (Task 7); existing `NotificationsButton` (default export, no props), `UserAccountNav` (default export, props `{ user: { id; email; name; image? }, profile: { id; full_name; avatar_url } | null }`), `useAuth()` from `@/contexts/AuthContext` (`{ user, loading }`), `useAuthModal()` from `@/contexts/AuthModalContext` (`{ showAuthModal(tab: "signin" | "signup") }`), `DropdownMenu*` from `@/components/ui/dropdown-menu`.
- Produces: `default function TopBar(props: TopBarProps)` with

```ts
interface TopBarProps {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  offerings: Offerings;
  initialUser: { id: string; email: string; name: string; image?: string | null } | null;
  profile: { id: string; full_name: string | null; avatar_url: string | null } | null;
}
```

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/TopBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TopBar from "@/components/community-shell/top-bar";
import { ALL_OFFERINGS } from "@/lib/offerings";

let mockPath = "/salsa";
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));

let mockUser: { id: string; email: string; name: string } | null = null;
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

const showAuthModal = jest.fn();
jest.mock("@/contexts/AuthModalContext", () => ({
  useAuthModal: () => ({ showAuthModal }),
}));

jest.mock("@/components/NotificationsButton", () => () => <button>Notifications</button>);
jest.mock("@/components/UserAccountNav", () => () => <button>Account</button>);

const props = {
  communitySlug: "salsa",
  communityName: "Salsa Club",
  communityImageUrl: null,
  isMember: false,
  isOwner: false,
  isAdmin: false,
  offerings: ALL_OFFERINGS,
  initialUser: null,
  profile: null,
};

beforeEach(() => {
  mockPath = "/salsa";
  mockUser = null;
  showAuthModal.mockClear();
});

it("gives signed-out visitors Sign in and Sign up, and only public tabs", async () => {
  render(<TopBar {...props} />);
  const nav = screen.getByRole("navigation", { name: "Community sections" });
  expect(nav).toHaveAttribute("id", "navigation-tab-buttons");
  expect(screen.getByRole("link", { name: "Community" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Private lessons" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Classroom" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(showAuthModal).toHaveBeenCalledWith("signin");
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(showAuthModal).toHaveBeenCalledWith("signup");
});

it("shows member tabs, notifications and the account menu to members", () => {
  mockUser = { id: "u1", email: "u1@example.com", name: "Ana" };
  render(<TopBar {...props} isMember initialUser={mockUser} />);
  for (const name of ["Community", "Classroom", "Private lessons", "Calendar", "About"]) {
    expect(screen.getByRole("link", { name })).toBeInTheDocument();
  }
  expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
});

it("adds Admin for the owner and keeps the tour IDs", () => {
  mockUser = { id: "owner", email: "o@example.com", name: "Logan" };
  render(<TopBar {...props} isOwner initialUser={mockUser} />);
  expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("id", "tab-admin");
  expect(screen.getByRole("link", { name: "Classroom" })).toHaveAttribute("id", "tab-classroom");
});

it("marks the tab of a nested page as current", () => {
  mockPath = "/salsa/classroom/footwork";
  render(<TopBar {...props} isMember />);
  expect(screen.getByRole("link", { name: "Classroom" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Community" })).not.toHaveAttribute("aria-current");
});

it("hides the tab of a switched-off offering", () => {
  render(<TopBar {...props} isMember offerings={{ ...ALL_OFFERINGS, liveClasses: false }} />);
  expect(screen.queryByRole("link", { name: "Calendar" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects components -t TopBar`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `components/community-shell/top-bar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Compass, LayoutDashboard } from "lucide-react";
import NotificationsButton from "@/components/NotificationsButton";
import UserAccountNav from "@/components/UserAccountNav";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCommunityTabs, isTabActive } from "@/lib/community-nav";
import type { Offerings } from "@/lib/offerings";
import { cn } from "@/lib/utils";

interface TopBarUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface TopBarProps {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  offerings: Offerings;
  /** Server-resolved user, so the first paint already shows the right side. */
  initialUser: TopBarUser | null;
  profile: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

/** One bar for the community area on desktop: identity, tabs, account. */
export default function TopBar({
  communitySlug,
  communityName,
  communityImageUrl,
  isMember,
  isOwner,
  isAdmin,
  offerings,
  initialUser,
  profile,
}: TopBarProps) {
  const pathname = usePathname();
  const { user: contextUser, loading } = useAuth();
  const { showAuthModal } = useAuthModal();
  // Until the auth context hydrates, trust the server's answer.
  const user = (loading ? initialUser : contextUser) as TopBarUser | null;

  const tabs = getCommunityTabs({ slug: communitySlug, isMember, isOwner, isAdmin, offerings });
  const activeKey = tabs.find((t) => isTabActive(t, pathname, communitySlug))?.key;

  // Underline that follows hover and focus, and rests on the current tab.
  const navRef = useRef<HTMLElement>(null);
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null);
  const moveInk = useCallback((el: HTMLElement | null) => {
    if (!el) return setInk(null);
    setInk({ left: el.offsetLeft + 12, width: Math.max(0, el.offsetWidth - 24) });
  }, []);
  const resetInk = useCallback(() => {
    moveInk(navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [moveInk]);
  useEffect(() => {
    resetInk();
    window.addEventListener("resize", resetInk);
    return () => window.removeEventListener("resize", resetInk);
  }, [resetInk, activeKey, tabs.length]);

  const initial = communityName.trim()[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-40 hidden border-b border-line bg-surface/90 backdrop-blur-md md:block">
      <div className="mx-auto flex h-[60px] max-w-[1160px] items-center gap-3 px-6">
        <Link
          href="/dashboard"
          aria-label="Dance-Hub home"
          title="Dance-Hub home"
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-brand font-display text-[13px] font-bold tracking-tight text-white"
        >
          DH
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-10 min-w-0 items-center gap-2.5 rounded-[10px] pl-1 pr-2 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
            {communityImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={communityImageUrl} alt="" className="h-[30px] w-[30px] shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-ink font-display text-[15px] font-semibold text-white">
                {initial}
              </span>
            )}
            <span className="truncate font-display text-[15px] font-semibold text-ink">{communityName}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem asChild>
              <Link href="/discovery" className="flex items-center gap-2">
                <Compass className="h-4 w-4" aria-hidden="true" />
                Find more communities
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                My dashboard
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <nav
          ref={navRef}
          id="navigation-tab-buttons"
          aria-label="Community sections"
          className="relative ml-3 flex h-full items-stretch"
          onMouseLeave={resetInk}
          onBlur={resetInk}
        >
          {tabs.map((t) => {
            const active = t.key === activeKey;
            return (
              <Link
                key={t.key}
                id={t.id}
                href={t.href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={(e) => moveInk(e.currentTarget)}
                onFocus={(e) => moveInk(e.currentTarget)}
                className={cn(
                  "flex items-center whitespace-nowrap px-3 text-[14.5px] transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                  active ? "font-semibold text-ink" : "font-medium text-ink-2 hover:text-ink"
                )}
              >
                {t.label}
              </Link>
            );
          })}
          {ink && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[-1px] left-0 h-0.5 rounded bg-brand transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
            />
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              <NotificationsButton />
              <UserAccountNav user={user} profile={profile} />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => showAuthModal("signin")}
                className="h-9 rounded-[10px] px-3.5 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => showAuthModal("signup")}
                className="h-9 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-hover"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test -- --selectProjects components -t TopBar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/community-shell/top-bar.tsx __tests__/components/TopBar.test.tsx
git commit -m "feat(nav): merged community top bar"
```

---

### Task 12: Wire the top bar in, align the phone nav, restyle toasts

**Files:**
- Modify: `app/[communitySlug]/layout.tsx` (use `TopBar`, `bg-canvas`, pass offerings)
- Modify: `components/MobileNav.tsx` (tabs from `getCommunityTabs`, new colors, `offerings` prop)
- Modify: `__tests__/components/MobileNav.test.tsx` (`offerings` in `baseProps`, two new tests)
- Modify: `app/layout.tsx:71` (`Toaster` look and position)
- Delete: `components/CommunityNavbar.tsx`, `__tests__/components/CommunityNavbar.test.tsx`

**Interfaces:**
- Consumes: `TopBar` (Task 11), `getCommunityTabs`/`isTabActive` (Task 10), `getOfferings` (Task 7).
- Produces: `MobileNav` gains a required prop `offerings: Offerings`.

- [ ] **Step 1: Write the failing tests**

In `__tests__/components/MobileNav.test.tsx`, add the import and extend `baseProps`:

```tsx
import { ALL_OFFERINGS } from '@/lib/offerings';
```

```tsx
const baseProps = {
  communitySlug: 'bachataflow',
  communityName: 'BachataFlow',
  communityImageUrl: null,
  isMember: true,
  isOwner: false,
  offerings: ALL_OFFERINGS,
  user: { id: 'u1', email: 'u@example.com' },
  profile: { full_name: 'User One', avatar_url: null },
};
```

Add inside the `describe('MobileNav', ...)` block:

```tsx
  it('hides the tabs of switched-off offerings', () => {
    render(<MobileNav {...baseProps} offerings={{ ...ALL_OFFERINGS, courses: false, liveClasses: false }} />);
    expect(screen.queryByRole('link', { name: /classroom/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /calendar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lessons/i })).toBeInTheDocument();
  });

  it('gives the phone tabs their own IDs (the tour targets the desktop ones)', () => {
    render(<MobileNav {...baseProps} />);
    expect(screen.getByRole('link', { name: /classroom/i })).toHaveAttribute('id', 'mobile-tab-classroom');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- --selectProjects components -t MobileNav`
Expected: FAIL. TypeScript rejects the unknown `offerings` prop or the tabs still show.

- [ ] **Step 3: Implement**

In `components/MobileNav.tsx`:

Add imports:

```tsx
import { getCommunityTabs, isTabActive, type CommunityTabKey } from '@/lib/community-nav';
import type { Offerings } from '@/lib/offerings';
```

Add `offerings: Offerings;` to `MobileNavProps` and `offerings,` to the destructured props.

Replace the block from `const hasFullAccess = ...` through `const isActive = ...` (including `rootHref`, `allTabs`, `tabs`) with:

```tsx
  // Same rules as the desktop top bar (lib/community-nav.ts).
  const allTabs = getCommunityTabs({ slug: communitySlug, isMember, isOwner, isAdmin, offerings });
  const rootHref = allTabs[0].href;
  const BAR_KEYS: CommunityTabKey[] = ['community', 'classroom', 'private-lessons', 'calendar'];
  const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    community: Home,
    classroom: BookOpen,
    'private-lessons': GraduationCap,
    calendar: Calendar,
  };
  const tabs = allTabs.filter((t) => BAR_KEYS.includes(t.key));
  const showAdmin = allTabs.some((t) => t.key === 'admin');
  const isActive = (href: string) => {
    const tab = allTabs.find((t) => t.href === href);
    return tab ? isTabActive(tab, pathname, communitySlug) : false;
  };
```

Replace the tab `<li>` rendering inside the bottom bar `<ul>`:

```tsx
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px]',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className={cn('text-[10px]', active && 'font-semibold')}>{tab.label}</span>
                </Link>
              </li>
            );
          })}
```

with:

```tsx
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const Icon = ICONS[tab.key];
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  id={`mobile-${tab.id}`}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2',
                    active ? 'text-brand-ink' : 'text-ink-3'
                  )}
                >
                  {active && <span aria-hidden="true" className="absolute top-0 h-[3px] w-7 rounded-b bg-brand" />}
                  <Icon className="h-5 w-5" />
                  <span className={cn('text-[11px]', active ? 'font-bold' : 'font-medium')}>{tab.shortLabel}</span>
                </Link>
              </li>
            );
          })}
```

Restyle the two bars' containers. Replace the top header class:

```tsx
      <header className="bg-card border-b border-border/50 sticky top-0 z-30 backdrop-blur-sm bg-card/95 md:hidden">
```

with:

```tsx
      <header className="sticky top-[env(safe-area-inset-top)] z-30 border-b border-line bg-surface/90 backdrop-blur-md md:hidden">
```

and the bottom nav class:

```tsx
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/50 pb-safe"
```

with:

```tsx
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
```

Remove the now-unused `const broadcastsEnabled` line if still present, and the old `Tab` type if nothing uses it.

The phone tab IDs are prefixed (`mobile-tab-*`) so they don't clash with the desktop top bar's `tab-*` IDs, which the onboarding tour targets.

In `app/[communitySlug]/layout.tsx`, replace the imports:

```tsx
import Navbar from '@/app/components/Navbar';
import CommunityNavbar from '@/components/CommunityNavbar';
import MobileNav from '@/components/MobileNav';
```

with:

```tsx
import TopBar from '@/components/community-shell/top-bar';
import MobileNav from '@/components/MobileNav';
import { getOfferings } from '@/lib/offerings';
```

and replace the returned JSX with:

```tsx
  const offerings = getOfferings(community);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Script src="https://js.stripe.com/v3/" strategy="afterInteractive" />
      {/* Desktop: one merged bar (hidden below md inside the component) */}
      <TopBar
        communitySlug={params.communitySlug}
        communityName={community.name}
        communityImageUrl={community.image_url}
        isMember={isMember}
        isOwner={isOwner}
        isAdmin={isAdmin}
        offerings={offerings}
        initialUser={session?.user ?? null}
        profile={navProfile}
      />

      {/* Phone: top header + bottom tab bar (hidden at md+) */}
      <MobileNav
        communitySlug={params.communitySlug}
        communityName={community.name}
        communityImageUrl={community.image_url}
        isMember={isMember}
        isOwner={isOwner}
        isAdmin={isAdmin}
        offerings={offerings}
        user={session?.user ?? null}
        profile={navProfile}
      />

      {/* Clear the phone tab bar (~5rem) plus any iOS safe-area inset; md:pb-0 removes it on desktop */}
      <main className="flex-grow pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
    </div>
  );
```

Delete the old component and its Phase 0 test:

```bash
git rm components/CommunityNavbar.tsx __tests__/components/CommunityNavbar.test.tsx
grep -rn "CommunityNavbar" app components lib __tests__ || echo "no references left"
```

Expected: "no references left".

In `app/layout.tsx`, replace:

```tsx
              <Toaster position="bottom-right" />
```

with:

```tsx
              <Toaster
                position="bottom-center"
                containerClassName="!bottom-[calc(80px+env(safe-area-inset-bottom))] md:!bottom-6"
                toastOptions={{
                  className: "!rounded-xl !bg-ink !text-white !text-sm !font-medium !shadow-overlay",
                  success: { iconTheme: { primary: "rgb(216 199 246)", secondary: "rgb(30 23 48)" } },
                }}
              />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects lib components`
Expected: all pass. (`MobileNav`, `TopBar`, `CommunitySidebar`, `FeedClient` included.)

- [ ] **Step 5: Build and look at it**

Run: `bun run build`
Expected: build succeeds.

Then start the worktree build on a free port and open a community page at desktop and phone widths (see the local e2e recipe memory for env and port setup). Check: one bar on desktop, the active underline sits under the current tab, the phone bar shows the right tabs, the page background is the new canvas color, toasts appear bottom center above the phone bar.

- [ ] **Step 6: Commit**

```bash
git add "app/[communitySlug]/layout.tsx" components/MobileNav.tsx __tests__/components/MobileNav.test.tsx app/layout.tsx
git commit -m "feat(nav): use the merged top bar in the community area"
```

---

### Task 13: Gate pages behind their offering

**Files:**
- Create: `components/community-shell/offering-off-banner.tsx`
- Modify: `app/[communitySlug]/classroom/page.tsx`
- Modify: `app/[communitySlug]/classroom/[courseSlug]/page.tsx`
- Modify: `app/[communitySlug]/calendar/page.tsx`
- Modify: `app/[communitySlug]/private-lessons/page.tsx`
- Create: `__tests__/components/OfferingOffBanner.test.tsx`

**Interfaces:**
- Consumes: `getOfferings`, `offeringAccess` (Task 7); `communityPath` from `@/lib/safe-redirect`.
- Produces: `OfferingOffBanner()` (no props).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/OfferingOffBanner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { OfferingOffBanner } from "@/components/community-shell/offering-off-banner";

it("tells the owner the page is off for members", () => {
  render(<OfferingOffBanner />);
  expect(screen.getByRole("status")).toHaveTextContent("Off for members");
  expect(screen.getByRole("status")).toHaveTextContent("Members can't open this page");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test -- --selectProjects components -t "off for members"`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `components/community-shell/offering-off-banner.tsx`:

```tsx
/** Shown to owners and site admins on a page whose offering is switched off. */
export function OfferingOffBanner() {
  return (
    <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm"
      >
        <span className="font-semibold text-ink">Off for members.</span>
        <span className="text-ink-2">Members can&apos;t open this page. You see it because you manage the community.</span>
      </div>
    </div>
  );
}
```

In `app/[communitySlug]/classroom/page.tsx`, add imports:

```tsx
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
```

After the existing `if (!isMember && !isCreator && !isAdmin) { redirect(...) }` block, add:

```tsx
  const access = offeringAccess(getOfferings(community), 'courses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));
```

and wrap the return:

```tsx
  return (
    <>
      {access === 'banner' && <OfferingOffBanner />}
      <ClassroomPageClient
        communitySlug={params.communitySlug}
        communityId={community.id}
        isCreator={isCreator}
        isAdmin={isAdmin}
        initialCourses={initialCourses}
      />
    </>
  );
```

In `app/[communitySlug]/classroom/[courseSlug]/page.tsx`, add the same two imports, the same two `access` lines after the membership redirect (key `'courses'`), and wrap the return:

```tsx
  return (
    <>
      {access === 'banner' && <OfferingOffBanner />}
      <CourseDetailClient
        communitySlug={params.communitySlug}
        courseSlug={params.courseSlug}
        community={community as never}
        initialCourse={initialCourse as never}
        isCreator={isCreator}
        isAdmin={isAdmin}
      />
    </>
  );
```

In `app/[communitySlug]/calendar/page.tsx`, add the imports plus `import { redirect } from 'next/navigation';` (merge with the existing `notFound` import) and `import { communityPath } from '@/lib/safe-redirect';`. After `const isAdmin = ...`, add:

```tsx
  const access = offeringAccess(getOfferings(community), 'liveClasses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));
```

and render `{access === 'banner' && <OfferingOffBanner />}` as the first child inside the returned outer `<div>`.

In `app/[communitySlug]/private-lessons/page.tsx`, add the imports, `redirect` from `next/navigation`, `communityPath`, and `getUserIsAdmin` to the `@/lib/community-data` import. After `const isMember = ...`, add:

```tsx
  const isAdmin = !!session && (await getUserIsAdmin(session.user.id));
  const access = offeringAccess(getOfferings(community), 'privateLessons', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));
```

and render `{access === 'banner' && <OfferingOffBanner />}` as the first child inside the returned outer `<div>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- --selectProjects lib components`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/community-shell/offering-off-banner.tsx __tests__/components/OfferingOffBanner.test.tsx "app/[communitySlug]/classroom/page.tsx" "app/[communitySlug]/classroom/[courseSlug]/page.tsx" "app/[communitySlug]/calendar/page.tsx" "app/[communitySlug]/private-lessons/page.tsx"
git commit -m "feat(offerings): redirect members away from switched-off pages"
```

---

### Task 14: Release Phase 1

**Files:** none (verification, migration, deploy).

- [ ] **Step 1: Run the affected suites, lint and build in the worktree**

Run: `bun run test -- --selectProjects lib components && bun lint && bun run build`
Expected: all green.

- [ ] **Step 2: One code-quality review of the release**

Dispatch one reviewer subagent (session model) with the spec, this plan's Part B and `git diff origin/main...HEAD`. Fix confirmed findings, re-run Step 1, commit as `fix: address phase 1 review`.

- [ ] **Step 3: Apply the migration to preprod (ask Logan first)**

Run from `/home/debian/apps/dance-hub`, using the preprod database URL from `.env.preprod`:

```bash
PREPROD_DB=$(grep -E '^DATABASE_URL=' .env.preprod | cut -d= -f2-)
psql "$PREPROD_DB" -f supabase/migrations/2026-10-05_community_offerings.sql
psql "$PREPROD_DB" -At -c "select count(*) from communities where offers_live_classes and offers_courses and offers_private_lessons;"
```

Expected: the `ALTER TABLE` and `COMMENT` lines succeed; the count equals the number of communities.

- [ ] **Step 4: Push and deploy to preprod**

```bash
cd /home/debian/apps/dance-hub-redesign && git push -u origin redesign/phase-1-foundation
cd /home/debian/apps/dance-hub && ./deploy-preprod.sh restart redesign/phase-1-foundation
```

Expected: "Done! Preprod restarted."

- [ ] **Step 5: Logan checks preprod**

Checklist to send, at desktop and phone widths, as owner, member and signed-out visitor:
- One top bar on desktop on every community page (Community, Classroom, a course, Private lessons, Calendar, About, Admin). Correct tabs per role. Underline under the current tab.
- Phone bar tabs correct; Admin in More for the owner.
- Page contents look as before, on the slightly calmer background.
- Toasts bottom center, above the phone bar.
- Run the owner onboarding tour once from start to finish.
- On preprod only, switch an offering off by SQL (`update communities set offers_courses=false where slug='bachataflow'`): the Classroom tab disappears, a member opening `/bachataflow/classroom` lands on the feed, the owner sees the "Off for members" banner. Switch it back on afterwards.

- [ ] **Step 6: Apply the migration to prod, merge and deploy (after Logan approves)**

```bash
cd /home/debian/apps/dance-hub
PROD_DB=$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)
psql "$PROD_DB" -f supabase/migrations/2026-10-05_community_offerings.sql
git checkout main && git pull
git merge --no-ff redesign/phase-1-foundation -m "Merge redesign phase 1: foundation"
git push origin main
./deploy.sh code
```

Expected: migration succeeds (the code treats missing columns as on, so the order is safe either way), deploy finishes, prod shows the new top bar.
