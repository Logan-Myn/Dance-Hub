# Mobile Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for mobile-responsive Dance-Hub. Add viewport meta, safe-area utilities, a `useIsMobile` hook, a `<ResponsiveDialog>` wrapper, a new `<MobileNav>` (bottom tab bar + More sheet) that replaces the desktop navs below `md`, and make the admin sidebar horizontally scrollable on mobile. Also sweep obvious `grid-cols-N` offenders to stack on phones. Desktop experience must remain pixel-identical at `md+`.

**Architecture:** CSS-driven responsive shell (approach C from the design spec). Default is one component with Tailwind responsive classes. Split into a separate mobile component only where the DOM differs fundamentally — here: the global nav. Below `md`, CSS hides the desktop `Navbar` + `CommunityNavbar` and renders `<MobileNav>`. Both trees SSR; browser shows one. `useIsMobile` exists but is strictly a behavior hook inside already-client components (not a render gate for layout). `<ResponsiveDialog>` is the one principled exception — it's used only for modals opened after user interaction, where SSR/hydration flash is not a concern.

**Tech Stack:** Next.js 14 (App Router) · React Server Components · TypeScript · Tailwind CSS · shadcn/ui (Dialog, Sheet, DropdownMenu, Avatar) · lucide-react icons · Jest + React Testing Library · Playwright (optional smoke) · Bun.

**Reference spec:** `docs/superpowers/specs/2026-04-20-mobile-responsiveness-design.md`

**Branch:** `feat/mobile-foundation` — worktree at `/home/debian/apps/dance-hub-mobile-p1/`

**Scope deviations from spec to flag upfront:**

1. The spec described a dedicated `<MobileAdminNav>` that replaces the bottom tab bar on admin routes. During planning we refined this: keeping the main bottom tab bar consistent across *all* community pages (including admin) is better UX — admins want to bounce between admin and community views without detouring through "More." The admin section nav (`AdminNav`) instead becomes a horizontally scrollable strip on mobile. Net: one fewer new component, same end result.

2. The spec listed a "typography utility sweep" (headings drop a step on mobile) in Phase 1. This plan **defers** the typography sweep to the per-page work in Phases 2–4. Rationale: typography adjustments are easier to get right in the context of a specific page (where you can see the hierarchy) than as a blanket utility sweep. The `.prose-sm` utility already exists; we add mobile-specific typography only where it's clearly needed in later phases.

---

## File Structure

**New files:**
- `hooks/use-is-mobile.ts` — SSR-safe `useIsMobile()` hook (client-side matchMedia)
- `components/ui/responsive-dialog.tsx` — wrapper choosing `Dialog` (desktop) or `Sheet` (mobile)
- `components/MobileNav.tsx` — top header + bottom tab bar + "More" sheet for community layout
- `__tests__/components/use-is-mobile.test.tsx` — hook unit tests
- `__tests__/components/responsive-dialog.test.tsx` — wrapper rendering tests
- `__tests__/components/MobileNav.test.tsx` — tab filtering + More sheet tests

**Modified files:**
- `app/layout.tsx` — add `viewport` export, `overscroll-none` on `<html>`
- `app/globals.css` — add `.pb-safe` utility under `@layer utilities`
- `app/[communitySlug]/layout.tsx` — hide `Navbar` + `CommunityNavbar` at `<md`; render `<MobileNav>` at `<md`
- `components/admin/AdminNav.tsx` — horizontally scrollable strip at `<md`
- `app/[communitySlug]/admin/layout.tsx` — add bottom padding so content clears the mobile tab bar
- Grid-stack sweep: 13 identified files (Task 5)

---

## Task 1: Viewport meta + overscroll

**Goal:** Add proper viewport behavior for mobile rendering.

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add `viewport` export and `overscroll-none` class**

Edit `app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
// ... existing imports unchanged ...

export const metadata: Metadata = {
  title: "DanceHub - Dance Community Platform",
  description: "Join dance communities, learn from teachers, and connect with other dancers.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overscroll-none">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${figtree.variable} antialiased`}
      >
        {/* rest unchanged */}
```

- [ ] **Step 2: Verify the app still builds**

Run: `bun run build`
Expected: Build completes without errors. The `viewport` export is a Next.js 14 supported convention.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(mobile): add viewport meta and overscroll-none"
```

---

## Task 2: Safe-area utility

**Goal:** Provide a `.pb-safe` utility used by the bottom tab bar and any future sticky-bottom elements to avoid overlapping the iOS home indicator.

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add the utility at end of `globals.css`, before `@theme inline`**

Insert immediately after the existing `.prose-sm img { ... }` block (currently ends at line 166):

```css
/* Safe-area padding for sticky-bottom elements (iOS home indicator). */
@layer utilities {
  .pb-safe {
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }
  .pt-safe {
    padding-top: max(0.25rem, env(safe-area-inset-top));
  }
  .h-safe-bottom {
    height: env(safe-area-inset-bottom);
  }
}
```

- [ ] **Step 2: Verify Tailwind picks it up**

Run: `bun run build`
Expected: Build succeeds. Tailwind's JIT compiles utility classes at build time; since this is a raw CSS utility under `@layer utilities`, no config change is needed.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(mobile): add pb-safe utility for iOS home indicator"
```

---

## Task 3: `useIsMobile` hook (TDD)

**Goal:** A client-side hook that reports whether the viewport is below `md` (768px). SSR-safe: returns `false` during server render / first client render, re-evaluates after mount. Used only for behavior, never for render-path layout gating.

**Files:**
- Create: `hooks/use-is-mobile.ts`
- Create: `__tests__/components/use-is-mobile.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/use-is-mobile.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-is-mobile';

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '(max-width: 767px)',
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    dispatch: (value: boolean) => {
      mql.matches = value;
      listeners.forEach((cb) => cb({ matches: value } as MediaQueryListEvent));
    },
  };
  window.matchMedia = jest.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

describe('useIsMobile', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false on first render (SSR-safe)', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    // After first useEffect flush, value is true. Pre-effect value is false.
    // Testing Library's renderHook runs effects, so we just verify current value.
    expect(typeof result.current).toBe('boolean');
  });

  it('returns true when viewport matches mobile breakpoint', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when viewport is desktop', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when the media query changes', () => {
    const mql = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      mql.dispatch(true);
    });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/components/use-is-mobile.test.tsx`
Expected: FAIL with "Cannot find module '@/hooks/use-is-mobile'".

- [ ] **Step 3: Write the hook**

Create `hooks/use-is-mobile.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Reports whether the viewport is below Tailwind's `md` breakpoint (768px).
 *
 * SSR-safe: returns `false` during server render and the first client render,
 * then re-evaluates after mount. Do NOT use this hook to gate what gets rendered
 * in the layout tree — use CSS (`md:hidden` / `hidden md:block`) for that to
 * preserve SSR output and avoid hydration flash. This hook is for BEHAVIOR only:
 * deciding how an already-mounted interactive component responds to the user.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/components/use-is-mobile.test.tsx`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-is-mobile.ts __tests__/components/use-is-mobile.test.tsx
git commit -m "feat(mobile): add useIsMobile behavior hook"
```

---

## Task 4: `<ResponsiveDialog>` wrapper (TDD)

**Goal:** A single API that renders a shadcn `Dialog` on desktop and a bottom `Sheet` on mobile. Because these modals open after user interaction (not on initial render), using `useIsMobile` for conditional rendering here is safe — no hydration flash on paths where the modal is closed.

**Files:**
- Create: `components/ui/responsive-dialog.tsx`
- Create: `__tests__/components/responsive-dialog.test.tsx`

- [ ] **Step 1: Confirm shadcn primitives exist**

Run:
```bash
ls components/ui/dialog.tsx components/ui/sheet.tsx
```
Expected: both files listed.

- [ ] **Step 2: Write the failing test**

Create `__tests__/components/responsive-dialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';

jest.mock('@/hooks/use-is-mobile', () => ({
  useIsMobile: jest.fn(),
}));
import { useIsMobile } from '@/hooks/use-is-mobile';

describe('ResponsiveDialog', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders a centered Dialog when desktop', () => {
    (useIsMobile as jest.Mock).mockReturnValue(false);
    render(
      <ResponsiveDialog open>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Desktop modal</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('Desktop modal')).toBeInTheDocument();
    // Shadcn Dialog content is centered via top-[50%] / left-[50%] translates.
    expect(dialog.className).toMatch(/top-\[50%\]/);
    // And does NOT carry the Sheet bottom-0 anchor class.
    expect(dialog.className).not.toMatch(/bottom-0/);
  });

  it('renders a bottom Sheet when mobile', () => {
    (useIsMobile as jest.Mock).mockReturnValue(true);
    render(
      <ResponsiveDialog open>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Mobile sheet</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('Mobile sheet')).toBeInTheDocument();
    // Shadcn Sheet side=bottom anchors with inset-x-0 + bottom-0.
    expect(dialog.className).toMatch(/bottom-0/);
    expect(dialog.className).not.toMatch(/top-\[50%\]/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test __tests__/components/responsive-dialog.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ui/responsive-dialog'".

- [ ] **Step 4: Implement the wrapper**

Create `components/ui/responsive-dialog.tsx`:

```tsx
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-is-mobile';

type CommonProps = {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

export function ResponsiveDialog(props: CommonProps) {
  const isMobile = useIsMobile();
  return isMobile ? <Sheet {...props} /> : <Dialog {...props} />;
}

export function ResponsiveDialogTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <SheetTrigger asChild={asChild}>{children}</SheetTrigger>
  ) : (
    <DialogTrigger asChild={asChild}>{children}</DialogTrigger>
  );
}

export function ResponsiveDialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <SheetContent
        side="bottom"
        className={`max-h-[90vh] overflow-y-auto rounded-t-2xl pb-safe ${className ?? ''}`.trim()}
      >
        {children}
      </SheetContent>
    );
  }
  return <DialogContent className={className}>{children}</DialogContent>;
}

export function ResponsiveDialogHeader({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetHeader>{children}</SheetHeader> : <DialogHeader>{children}</DialogHeader>;
}

export function ResponsiveDialogFooter({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetFooter>{children}</SheetFooter> : <DialogFooter>{children}</DialogFooter>;
}

export function ResponsiveDialogTitle({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetTitle>{children}</SheetTitle> : <DialogTitle>{children}</DialogTitle>;
}

export function ResponsiveDialogDescription({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <SheetDescription>{children}</SheetDescription>
  ) : (
    <DialogDescription>{children}</DialogDescription>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test __tests__/components/responsive-dialog.test.tsx`
Expected: Both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/ui/responsive-dialog.tsx __tests__/components/responsive-dialog.test.tsx
git commit -m "feat(mobile): add ResponsiveDialog wrapper (Dialog desktop / Sheet mobile)"
```

---

## Task 5: Grid-stack mechanical sweep

**Goal:** Every `grid grid-cols-N` without any responsive modifier becomes `grid grid-cols-1 sm:grid-cols-N` (or `md:` if the content needs more width). This is a mechanical edit across 13 files — apply the same pattern and commit as one change.

**Files:** See table below. Each entry lists file, line, current classname, target classname.

| File | Line | Current | Target |
|---|---|---|---|
| `components/auth/AuthModal.tsx` | 255 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/admin/SubscriptionsEditor.tsx` | 672 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/TeacherCalendarAvailability.tsx` | 319 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/LiveClassModal.tsx` | 180 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/PrivateLessonManagementModal.tsx` | 347 | `grid grid-cols-2 md:grid-cols-4 gap-4 text-sm` | `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm` |
| `components/PrivateLessonManagementModal.tsx` | 452 | `grid grid-cols-2 gap-4 text-sm mb-3` | `grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-3` |
| `components/stripe-onboarding/steps/PersonalInfoStep.tsx` | 391 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/stripe-onboarding/steps/PersonalInfoStep.tsx` | 421 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/stripe-onboarding/steps/PersonalInfoStep.tsx` | 463 | `grid grid-cols-3 gap-4` | `grid grid-cols-1 sm:grid-cols-3 gap-4` |
| `components/stripe-onboarding/steps/PersonalInfoStep.tsx` | 575 | `grid grid-cols-3 gap-4` | `grid grid-cols-1 sm:grid-cols-3 gap-4` |
| `components/stripe-onboarding/steps/BusinessInfoStep.tsx` | 343 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/stripe-onboarding/steps/BusinessInfoStep.tsx` | 409 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/stripe-onboarding/steps/BusinessInfoStep.tsx` | 474 | `grid grid-cols-3 gap-4` | `grid grid-cols-1 sm:grid-cols-3 gap-4` |
| `components/LessonBookingModal.tsx` | 336 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/CreatePrivateLessonModal.tsx` | 196 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| `components/CreatePrivateLessonModal.tsx` | 241 | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |

**NOT touched** (intentionally excluded — these are either toggles/segmented controls or dynamic video grids that must stay N-col even on mobile):
- `components/auth/AuthModal.tsx:143` — `TabsList className="grid w-full grid-cols-2"` (segmented Sign in / Sign up toggle)
- `components/LiveKitClassRoom.tsx:238-239` — dynamic video tile grid

- [ ] **Step 1: Apply the edits**

For each row in the table above, use Edit to change the exact classname. Line numbers are current — they shift as you edit, so match by unique surrounding context, not by line number.

- [ ] **Step 2: Verify the build**

Run: `bun run build`
Expected: Build completes without errors.

- [ ] **Step 3: Verify no test regressions**

Run: `bun test`
Expected: Existing tests continue to pass.

- [ ] **Step 4: Spot-check in DevTools mobile emulation**

Run the dev server (`bun dev`), open Chrome DevTools → Device Mode → iPhone 12 Pro, navigate to:
- `/auth` (or wherever AuthModal renders a signup form with the 2-col name grid)
- `/[slug]/private-lessons` and open create/book modals
- The Stripe onboarding flow

Expected: Previously 2-col form pairs now stack vertically on the phone viewport.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(mobile): stack multi-column grids on phones"
```

---

## Task 6: `<MobileNav>` component (TDD)

**Goal:** A client component that renders a top header (community avatar + name + notifications bell) and a bottom tab bar (Community · Classroom · Lessons · Calendar · More). "More" opens a bottom sheet containing About, Admin (owner-only, gated by `NEXT_PUBLIC_BROADCASTS_ENABLED`), Switch community, My Dashboard, Profile, Sign out.

**Files:**
- Create: `components/MobileNav.tsx`
- Create: `__tests__/components/MobileNav.test.tsx`

**Component API:**

```tsx
type MobileNavProps = {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  user: { id: string; email?: string | null } | null;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
};
```

Prop shape mirrors `NavbarProfile` from `lib/community-data.ts` (which the parent layout already fetches via `getProfileForUser`) — `full_name` + `avatar_url`. No renames; no adapters.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/MobileNav.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import MobileNav from '@/components/MobileNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/bachataflow',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const baseProps = {
  communitySlug: 'bachataflow',
  communityName: 'BachataFlow',
  communityImageUrl: null,
  isMember: true,
  isOwner: false,
  user: { id: 'u1', email: 'u@example.com' },
  profile: { full_name: 'User One', avatar_url: null },
};

describe('MobileNav', () => {
  it('renders top header with community name', () => {
    render(<MobileNav {...baseProps} />);
    expect(screen.getByText('BachataFlow')).toBeInTheDocument();
  });

  it('renders 5 primary tabs', () => {
    render(<MobileNav {...baseProps} />);
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /classroom/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lessons/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument();
  });

  it('hides Classroom and Calendar tabs for non-members', () => {
    render(<MobileNav {...baseProps} isMember={false} />);
    expect(screen.queryByRole('link', { name: /classroom/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /calendar/i })).not.toBeInTheDocument();
  });

  it('opens the More sheet on tap', () => {
    render(<MobileNav {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/about/i)).toBeInTheDocument();
    expect(screen.getByText(/sign out/i)).toBeInTheDocument();
  });

  it('hides Admin in More sheet for non-owners', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'true';

    render(<MobileNav {...baseProps} isOwner={false} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByText(/^admin$/i)).not.toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('shows Admin in More sheet for owners when broadcasts are enabled', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'true';

    render(<MobileNav {...baseProps} isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('hides Admin even for owners when broadcasts are disabled', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED;
    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = 'false';

    render(<MobileNav {...baseProps} isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByText(/^admin$/i)).not.toBeInTheDocument();

    process.env.NEXT_PUBLIC_BROADCASTS_ENABLED = originalEnv;
  });

  it('marks the active tab by pathname', () => {
    render(<MobileNav {...baseProps} />);
    const community = screen.getByRole('link', { name: /community/i });
    expect(community.getAttribute('aria-current')).toBe('page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/components/MobileNav.test.tsx`
Expected: FAIL with "Cannot find module '@/components/MobileNav'".

- [ ] **Step 3: Implement the component**

Create `components/MobileNav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, Home, BookOpen, GraduationCap, Calendar, MoreHorizontal, Info, Settings, Users, User, LogOut, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type MobileNavProps = {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  user: { id: string; email?: string | null } | null;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
};

type Tab = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  memberOnly?: boolean;
};

export default function MobileNav({
  communitySlug,
  communityName,
  communityImageUrl,
  isMember,
  isOwner,
  user,
  profile,
}: MobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true';
  const showAdmin = isOwner && broadcastsEnabled;

  const rootHref = `/${communitySlug}`;
  const allTabs: Tab[] = [
    { key: 'community', label: 'Community', href: rootHref, icon: Home },
    { key: 'classroom', label: 'Classroom', href: `/${communitySlug}/classroom`, icon: BookOpen, memberOnly: true },
    { key: 'lessons', label: 'Lessons', href: `/${communitySlug}/private-lessons`, icon: GraduationCap },
    { key: 'calendar', label: 'Calendar', href: `/${communitySlug}/calendar`, icon: Calendar, memberOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.memberOnly || isMember);

  const isActive = (href: string) =>
    href === rootHref ? pathname === rootHref : pathname?.startsWith(href) ?? false;

  const communityInitial = communityName.trim()[0]?.toUpperCase() ?? '?';
  const userInitial = (profile?.full_name ?? user?.email ?? '?').trim()[0]?.toUpperCase() ?? '?';

  return (
    <>
      {/* Top header */}
      <header className="bg-card border-b border-border/50 sticky top-0 z-30 backdrop-blur-sm bg-card/95 md:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href={rootHref} className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              {communityImageUrl ? <AvatarImage src={communityImageUrl} alt={communityName} /> : null}
              <AvatarFallback className="text-xs font-semibold">{communityInitial}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-sm truncate max-w-[180px]">{communityName}</span>
          </Link>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="p-2 rounded-full hover:bg-muted"
          >
            <Bell className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/50 pb-safe"
        aria-label="Primary"
      >
        <ul className="flex justify-around items-stretch">
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

          <li className="flex-1">
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="More"
                  className="w-full flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] text-muted-foreground"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="text-[10px]">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="pb-safe rounded-t-2xl">
                {/* Community section */}
                <div className="flex items-center gap-3 pb-4 border-b border-border/50 mb-2">
                  <Avatar className="h-10 w-10">
                    {communityImageUrl ? <AvatarImage src={communityImageUrl} alt={communityName} /> : null}
                    <AvatarFallback>{communityInitial}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{communityName}</div>
                    <div className="text-xs text-muted-foreground">Community</div>
                  </div>
                </div>

                <ul className="flex flex-col py-2">
                  <MoreItem href={`/${communitySlug}/about`} icon={Info} label="About" onNavigate={() => setMoreOpen(false)} />
                  {showAdmin ? (
                    <MoreItem
                      href={`/${communitySlug}/admin`}
                      icon={Settings}
                      label="Admin"
                      onNavigate={() => setMoreOpen(false)}
                      highlight
                    />
                  ) : null}
                </ul>

                <div className="border-t border-border/50" />

                <ul className="flex flex-col py-2">
                  <MoreItem href="/discovery" icon={Repeat} label="Switch community" onNavigate={() => setMoreOpen(false)} />
                  <MoreItem href="/dashboard" icon={Users} label="My Dashboard" onNavigate={() => setMoreOpen(false)} />
                  {user ? (
                    <MoreItem href="/profile" icon={User} label="Profile" onNavigate={() => setMoreOpen(false)} />
                  ) : null}
                  {user ? (
                    <MoreItem href="/auth/sign-out" icon={LogOut} label="Sign out" onNavigate={() => setMoreOpen(false)} destructive />
                  ) : (
                    <MoreItem href="/auth/sign-in" icon={User} label="Sign in" onNavigate={() => setMoreOpen(false)} />
                  )}
                </ul>

                {/* Minimal user identity chip */}
                {user ? (
                  <div className="flex items-center gap-3 pt-3 border-t border-border/50 mt-2">
                    <Avatar className="h-8 w-8">
                      {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? 'You'} /> : null}
                      <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
                    </Avatar>
                    <div className="text-xs text-muted-foreground truncate">{profile?.full_name ?? user.email}</div>
                  </div>
                ) : null}
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </>
  );
}

function MoreItem({
  href,
  icon: Icon,
  label,
  onNavigate,
  highlight,
  destructive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onNavigate: () => void;
  highlight?: boolean;
  destructive?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 py-3 text-sm min-h-[44px]',
          highlight && 'text-primary font-medium',
          destructive && 'text-destructive'
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </Link>
    </li>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/components/MobileNav.test.tsx`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/MobileNav.tsx __tests__/components/MobileNav.test.tsx
git commit -m "feat(mobile): add MobileNav (top header + bottom tabs + More sheet)"
```

---

## Task 7: Wire `<MobileNav>` into community layout

**Goal:** Render `<MobileNav>` below `md` and hide the desktop `Navbar` + `CommunityNavbar` below `md`. Both trees SSR; CSS picks which is visible. Add bottom padding to `<main>` on mobile so content isn't hidden under the fixed bottom tab bar.

**Files:**
- Modify: `app/[communitySlug]/layout.tsx`

- [ ] **Step 1: Update the layout to render both navs**

Replace `app/[communitySlug]/layout.tsx` with:

```tsx
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getProfileForUser,
} from '@/lib/community-data';
import Navbar from '@/app/components/Navbar';
import CommunityNavbar from '@/components/CommunityNavbar';
import MobileNav from '@/components/MobileNav';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { communitySlug: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isOwner = !!session && community.created_by === session.user.id;
  const [isMember, navProfile] = await Promise.all([
    session ? getCommunityMembership(community.id, session.user.id) : Promise.resolve(false),
    session ? getProfileForUser(session.user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Desktop nav — hidden below md */}
      <div className="hidden md:block">
        <Navbar
          initialUser={session?.user ?? null}
          initialProfile={navProfile}
        />
        <CommunityNavbar
          communitySlug={params.communitySlug}
          isMember={isMember}
          isOwner={isOwner}
        />
      </div>

      {/* Mobile nav — hidden at md+ */}
      <MobileNav
        communitySlug={params.communitySlug}
        communityName={community.name}
        communityImageUrl={community.image_url}
        isMember={isMember}
        isOwner={isOwner}
        user={session?.user ?? null}
        profile={navProfile}
      />

      {/* pb-20 gives the mobile bottom tab bar breathing room; md:pb-0 removes it on desktop */}
      <main className="flex-grow pb-20 md:pb-0">{children}</main>
    </div>
  );
}
```

Note: `<MobileNav>` itself applies `md:hidden` internally on its header and bottom-tab-bar elements, so no extra wrapper class is needed. The `pb-20` on `<main>` ensures content doesn't vanish under the fixed bottom tab bar at mobile sizes.

- [ ] **Step 2: Verify the build**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual desktop smoke**

Run: `bun dev`. Navigate to `http://localhost:3000/<any-community-slug>`.

Expected:
- Desktop (>768px): `Navbar` (top) and `CommunityNavbar` (6-tab row) render exactly as before. `MobileNav` header and bottom bar are not visible.
- Mobile (DevTools, iPhone 12 Pro): No top `Navbar` / `CommunityNavbar` visible. Mobile header shows community avatar + name + 🔔. Bottom tab bar with 5 tabs. Content scrolls above the tab bar without being clipped.

- [ ] **Step 4: Commit**

```bash
git add app/[communitySlug]/layout.tsx
git commit -m "feat(mobile): wire MobileNav into community layout, hide desktop navs below md"
```

---

## Task 8: Admin nav responsiveness

**Goal:** The admin sidebar (`AdminNav`) currently flexes to a horizontal row below `sm` but has no overflow handling. On narrow phones it either wraps awkwardly or overflows. Make it a horizontal scroll strip at `<md`, keep sidebar at `md+`. Also add mobile bottom padding on the admin layout so its content doesn't sit under the mobile tab bar.

**Files:**
- Modify: `components/admin/AdminNav.tsx`
- Modify: `app/[communitySlug]/admin/layout.tsx`

- [ ] **Step 1: Update `AdminNav.tsx`**

Replace the return block in `components/admin/AdminNav.tsx`:

```tsx
  return (
    <nav className="w-full md:w-48 md:shrink-0">
      <p className="hidden md:block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3 pl-1">
        {communityName}
      </p>
      <ul className="flex md:flex-col gap-0.5 overflow-x-auto scrollbar-hide md:overflow-visible -mx-1 px-1 pb-1 md:pb-0 md:mx-0 md:px-0">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
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
```

Changes from current:
- Breakpoint flips from `sm` to `md` (desktop-and-up is 768px+, matching the rest of the project).
- Adds `overflow-x-auto scrollbar-hide` at mobile so the row scrolls horizontally instead of overflowing the viewport.
- Each item gets `shrink-0` at mobile (so the row scrolls), `min-h-[44px]` for touch targets, and `whitespace-nowrap` so labels stay on one line.
- Active state: shows a muted pill background at mobile (since the thin left indicator only makes sense on the vertical sidebar).
- Community name label hidden at mobile (tight space; the parent header already shows it).

- [ ] **Step 2: Update `app/[communitySlug]/admin/layout.tsx`**

Replace the entire file contents with:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { communitySlug: string };
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const community = await queryOne<{ id: string; created_by: string; name: string }>`
    SELECT id, created_by, name FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) redirect(`/${params.communitySlug}`);
  if (community.created_by !== session.user.id) redirect(`/${params.communitySlug}`);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 lg:py-14 font-sans pb-24 md:pb-14">
      <div className="flex flex-col md:flex-row gap-3 lg:gap-4">
        <AdminNav
          communitySlug={params.communitySlug}
          communityName={community.name}
        />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
```

Changes from current file:
- `flex-col sm:flex-row` → `flex-col md:flex-row` (align with the project's `md` cutoff at 768px instead of `sm` at 640px).
- Outer padding gains `pb-24 md:pb-14` — `pb-24` at mobile ensures admin content clears the fixed mobile bottom tab bar; `md:pb-14` preserves existing desktop bottom padding.
- Reduce `py-10 lg:py-14` to `py-6 md:py-10 lg:py-14` — tighter vertical padding at mobile sizes so content starts closer to the top.

Auth guard, data loading, and children passthrough are unchanged.

- [ ] **Step 3: Verify the build**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual smoke**

Run: `bun dev`. Navigate to `http://localhost:3000/<community-slug>/admin/general` as the community owner.

Expected:
- Desktop: AdminNav sidebar on the left, content on the right (unchanged from today).
- Mobile (DevTools iPhone 12 Pro): AdminNav renders as a horizontally scrollable row above the content. All 5 admin sections tappable. Active item visibly highlighted. Content ends above the mobile tab bar, not behind it.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminNav.tsx app/[communitySlug]/admin/layout.tsx
git commit -m "feat(mobile): make admin nav horizontally scrollable on phones"
```

---

## Task 9: Preprod deploy + QA checklist

**Goal:** Open the PR, deploy the branch to preprod, run the QA checklist on a real phone, merge.

- [ ] **Step 1: Verify all tests still pass**

Run: `bun test`
Expected: All tests pass, including the new `use-is-mobile`, `responsive-dialog`, and `MobileNav` suites.

- [ ] **Step 2: Verify build cleanly**

Run: `bun run build`
Expected: Build completes with no type errors and no new warnings.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feat/mobile-foundation
gh pr create --title "feat(mobile): phase 1 foundation" --body "$(cat <<'EOF'
## Summary
- Adds viewport meta + overscroll-none + `.pb-safe` utility
- Adds `useIsMobile` behavior hook (SSR-safe, for behavior only — not layout)
- Adds `<ResponsiveDialog>` wrapper (Dialog on desktop, Sheet on mobile)
- Adds `<MobileNav>` — top header + bottom tab bar + More sheet — rendered below `md`
- Hides desktop `Navbar` + `CommunityNavbar` below `md` via CSS; both navs SSR, browser picks
- Makes `AdminNav` a horizontally scrollable strip at `<md`, sidebar at `md+`
- Stacks 13 `grid-cols-N` offenders to `grid-cols-1` on phones
- Tests for `useIsMobile`, `<ResponsiveDialog>`, `<MobileNav>`

Desktop is pixel-identical at `md+`. First phase of the mobile-responsiveness design spec at `docs/superpowers/specs/2026-04-20-mobile-responsiveness-design.md`.

## Test plan
- [ ] Desktop: all pages pixel-identical at ≥ md (1024px DevTools check + real monitor)
- [ ] Mobile (Chrome DevTools, iPhone 12 Pro): bottom tab bar visible and functional on every community sub-page
- [ ] Mobile: tap each of the 5 tabs, confirm navigation + active state
- [ ] Mobile: open More sheet, confirm all items present, sheet dismisses on tap-outside/swipe-down
- [ ] Mobile: content does not hide behind the bottom tab bar on any community page
- [ ] Mobile: admin area shows horizontally scrollable nav; no viewport overflow
- [ ] Mobile: safe-area padding visible on iPhone Safari (no home-indicator overlap)
- [ ] Real phone (iPhone Safari) on preprod.dance-hub.io: end-to-end smoke

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Deploy branch to preprod**

```bash
./deploy-preprod.sh deploy feat/mobile-foundation
```
Expected: deploy succeeds, `preprod.dance-hub.io` serves the branch.

- [ ] **Step 5: Phone QA on preprod**

On a real iPhone Safari browser, open `https://preprod.dance-hub.io/<community-slug>` as a logged-in member (and separately as an owner). Walk the test-plan checklist in the PR body. Record any issues as additional tasks.

- [ ] **Step 6: Desktop regression check on preprod**

On a desktop browser, open `https://preprod.dance-hub.io/<community-slug>` and verify every page visually matches today's prod. Scrutinize the `/admin` area specifically — the `sm:` → `md:` breakpoint flip means at widths between 640-768px the layout will change (sidebar → horizontal strip). Confirm this is acceptable behavior (there's no reason someone would intentionally use a 700px-wide desktop browser, and tablets are treated as "small desktop" per the spec — ≥768px is desktop).

- [ ] **Step 7: Merge and deploy prod**

Once preprod QA is green and PR is approved:

```bash
gh pr merge --squash
```

After merge, from the main repo worktree `/home/debian/apps/dance-hub`:

```bash
git checkout main
git pull
./deploy.sh code
```

- [ ] **Step 8: Close out the phase**

Update `docs/superpowers/specs/2026-04-20-mobile-responsiveness-design.md` with a "Phase 1 — shipped YYYY-MM-DD" note at the top of the Phases section. Commit:

```bash
git add docs/superpowers/specs/2026-04-20-mobile-responsiveness-design.md
git commit -m "docs(mobile): mark Phase 1 as shipped"
git push
```

Phase 2 — Core Member Flows — gets its own separate implementation plan written when it's time.
