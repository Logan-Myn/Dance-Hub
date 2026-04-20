# Mobile Phase 2a — Feed + Thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the community feed and thread view first-class on mobile. The thread — today a desktop-only modal — becomes a dedicated URL route on mobile (`/[communitySlug]/threads/[threadId]`), so the phone back button returns to the feed naturally. Desktop keeps its modal. Ensure the feed's composer, post cards, and community header all read well on a phone.

**Architecture:** Extract `ThreadModal`'s inner JSX + state into a reusable `<ThreadView>` component. `ThreadModal` becomes a thin Dialog wrapper around `<ThreadView>`. A new server-rendered route page also renders `<ThreadView>` — without the Dialog chrome — for mobile. Feed click behavior splits by viewport (behavior-only use of `useIsMobile`): mobile pushes to the URL, desktop keeps opening the modal. No new API endpoints — a new `getThreadById` helper in `lib/community-data.ts` powers the server component and mirrors the shape of `getCommunityThreads`.

**Tech Stack:** Next.js 14 App Router · React Server Components · TypeScript · Tailwind CSS · shadcn/ui (Dialog) · SWR · PostgreSQL via `@/lib/db` · Jest + React Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-04-20-mobile-responsiveness-design.md` (Phase 2 section).

**Branch:** `feat/mobile-feed-thread` — worktree at `/home/debian/apps/dance-hub-mobile-p2a/`.

**Scope boundary:** Phase 2b will handle classroom, private lessons, LiveKit/Stream-Hub UI, and WeekCalendar day-view. This plan is feed + thread only.

**Scope decisions confirmed during planning:**
1. Thread on mobile is a **real URL route** (`/[communitySlug]/threads/[threadId]`) — not a full-screen modal with no URL. Supports phone back button and shareable links.
2. Composer stays **inline and mobile-friendly** — not a sticky-top or bottom-sheet composer. (Spec originally said "sticky-top on mobile"; this plan deviates per the refinement decision. `ComposerBox` is already fully responsive.)
3. Desktop thread modal behavior is **unchanged** for cards clicked on desktop. The URL route works on desktop too (for shared links) but renders as a page — an acceptable trade-off for continuity.

---

## File Structure

**New files:**
- `components/ThreadView.tsx` — extracted inner thread UI (was the guts of `ThreadModal`). Used by both the desktop modal and the mobile route page.
- `app/[communitySlug]/threads/[threadId]/page.tsx` — server component for the mobile thread route. Fetches the thread via `getThreadById`, delegates rendering to a small client wrapper.
- `app/[communitySlug]/threads/[threadId]/ThreadPageClient.tsx` — thin client wrapper that renders `<ThreadView>` with a back-button header and handles navigation/mutation callbacks.
- `__tests__/components/ThreadView.test.tsx` — render smoke test for the extracted view.
- `__tests__/lib/get-thread-by-id.test.ts` — smoke test for the new data helper.

**Modified files:**
- `lib/community-data.ts` — add `getThreadById(communityId, threadId)` returning the same `CommunityThread` shape as `getCommunityThreads`.
- `components/ThreadModal.tsx` — refactor: keep as Dialog wrapper; inner JSX + state move into `<ThreadView>`. Reduce from ~839 lines to ~60.
- `app/[communitySlug]/FeedClient.tsx` — split thread-click behavior: on mobile (`useIsMobile()`), `router.push('/[slug]/threads/[threadId]')`; on desktop, existing `setSelectedThread(thread)` unchanged.
- `components/community/CommunityHeader.tsx` — minor polish: add `sm:` breakpoints for extra-narrow phone widths.
- `components/community/ThreadCardFluid.tsx` — minor polish: verify tap-target size, spacing on narrow phones.

**Not touched:**
- `ComposerBox.tsx` — already responsive, no change.
- `app/api/threads/[threadId]/route.ts` — no new GET endpoint; Server Component fetches directly via `getThreadById`.
- `app/api/threads/[threadId]/comments/route.ts` — existing POST for new-comment, existing GET for lazy comment load — both unchanged.

---

## Task 0: Worktree setup

**Goal:** Create a new git worktree for Phase 2a work so we never touch the main repo.

**Files:** none (infrastructure only).

- [ ] **Step 1: Create worktree + branch**

```bash
cd /home/debian/apps/dance-hub
git fetch origin
git worktree add -b feat/mobile-feed-thread /home/debian/apps/dance-hub-mobile-p2a main
```

- [ ] **Step 2: Copy env + install deps**

```bash
cp /home/debian/apps/dance-hub/.env.local /home/debian/apps/dance-hub-mobile-p2a/.env.local
cd /home/debian/apps/dance-hub-mobile-p2a
bun install
```

- [ ] **Step 3: Verify fresh build passes**

```bash
cd /home/debian/apps/dance-hub-mobile-p2a && bun run build
```
Expected: successful build off `main` tip.

All subsequent tasks run in `/home/debian/apps/dance-hub-mobile-p2a/`.

---

## Task 1: Add `getThreadById` to `lib/community-data.ts`

**Goal:** A server-side helper that fetches one thread (with its author profile, comments, likes) by ID, scoped to a community. Mirrors `getCommunityThreads` shape so `<ThreadView>` can consume either.

**Files:**
- Modify: `lib/community-data.ts`
- Create: `__tests__/lib/get-thread-by-id.test.ts`

### Step 1: Write the failing test

Create `__tests__/lib/get-thread-by-id.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { getThreadById } from '@/lib/community-data';

jest.mock('@/lib/db', () => {
  const query = jest.fn();
  const queryOne = jest.fn();
  return { query, queryOne };
});
import { query, queryOne } from '@/lib/db';

describe('getThreadById', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns null when the thread does not exist', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce(null);
    const result = await getThreadById('comm-1', 'thread-404');
    expect(result).toBeNull();
  });

  it('returns null when the thread belongs to a different community', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce(null);
    const result = await getThreadById('comm-1', 'thread-in-other-community');
    expect(result).toBeNull();
    // Query must scope by community_id — confirmed by the resolver returning null
    // when the tagged-template WHERE clause doesn't match.
    expect(queryOne).toHaveBeenCalledTimes(1);
  });

  it('returns a shaped CommunityThread with comments when found', async () => {
    (queryOne as jest.Mock).mockResolvedValueOnce({
      id: 't1',
      title: 'Hello',
      content: 'World',
      created_at: '2026-04-20T10:00:00Z',
      user_id: 'u1',
      category_name: 'Announcements',
      category_id: 'cat-1',
      pinned: true,
      profile_id: 'p1',
      profile_full_name: 'Jane',
      profile_avatar_url: 'https://example.com/a.png',
      profile_display_name: null,
      likes: ['u2', 'u3'],
      likes_count: 2,
      comments_count: 1,
    });
    (query as jest.Mock).mockResolvedValueOnce([
      {
        id: 'c1',
        thread_id: 't1',
        user_id: 'u2',
        content: 'Nice',
        created_at: '2026-04-20T10:05:00Z',
        parent_id: null,
        author: { name: 'Bob', image: '' },
        likes: [],
        likes_count: 0,
      },
    ]);

    const result = await getThreadById('comm-1', 't1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('t1');
    expect(result!.title).toBe('Hello');
    expect(result!.pinned).toBe(true);
    expect(result!.author.name).toBe('Jane');
    expect(result!.likes).toEqual(['u2', 'u3']);
    expect(result!.likesCount).toBe(2);
    expect(result!.commentsCount).toBe(1);
    expect(result!.comments).toHaveLength(1);
    expect(result!.comments[0].id).toBe('c1');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /home/debian/apps/dance-hub-mobile-p2a && bun run test __tests__/lib/get-thread-by-id.test.ts
```
Expected: FAIL — `getThreadById` not exported from `@/lib/community-data`.

### Step 3: Implement `getThreadById`

In `lib/community-data.ts`, immediately after `getCommunityThreads` (which ends at the `});` closing its body — search for `getCommunityThreads` to anchor the insertion), add:

```ts
export const getThreadById = cache(
  async (communityId: string, threadId: string): Promise<CommunityThread | null> => {
    const row = await queryOne<ThreadQueryRow>`
      SELECT
        t.id,
        t.title,
        t.content,
        t.created_at,
        t.user_id,
        t.category_name,
        t.category_id,
        t.pinned,
        p.id as profile_id,
        p.full_name as profile_full_name,
        p.avatar_url as profile_avatar_url,
        p.display_name as profile_display_name,
        COALESCE(t.likes, ARRAY[]::TEXT[]) as likes,
        COALESCE(array_length(t.likes, 1), 0)::int as likes_count,
        (SELECT COUNT(*) FROM comments c WHERE c.thread_id = t.id)::int as comments_count
      FROM threads t
      LEFT JOIN profiles p ON p.auth_user_id = t.user_id
      WHERE t.id = ${threadId}
        AND t.community_id = ${communityId}
    `;

    if (!row) return null;

    const comments = await query<CommentQueryRow>`
      SELECT
        c.id, c.thread_id, c.user_id, c.content, c.created_at,
        c.parent_id, c.author,
        COALESCE(c.likes, ARRAY[]::TEXT[]) as likes,
        COALESCE(c.likes_count, 0) as likes_count
      FROM comments c
      WHERE c.thread_id = ${threadId}
      ORDER BY c.created_at ASC
    `;

    const toIso = (v: Date | string): string =>
      v instanceof Date ? v.toISOString() : v;

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: toIso(row.created_at),
      userId: row.user_id,
      author: {
        name: row.profile_display_name || row.profile_full_name || 'Anonymous',
        image: row.profile_avatar_url || '',
      },
      category: row.category_name || 'Uncategorized',
      categoryId: row.category_id,
      likesCount: row.likes_count,
      commentsCount: row.comments_count,
      likes: row.likes ?? [],
      comments: comments.map((c) => ({
        id: c.id,
        thread_id: c.thread_id,
        user_id: c.user_id,
        content: c.content,
        created_at: toIso(c.created_at),
        parent_id: c.parent_id,
        author: c.author ?? { name: 'Anonymous', image: '' },
        likes: c.likes ?? [],
        likes_count: c.likes_count,
      })),
      pinned: !!row.pinned,
    };
  },
);
```

Imports (`query`, `queryOne`, `cache`) are already present at the top of the file. `ThreadQueryRow`, `CommentQueryRow`, and the `CommunityThread` interface are already declared above `getCommunityThreads`.

### Step 4: Run tests to verify they pass

```bash
cd /home/debian/apps/dance-hub-mobile-p2a && bun run test __tests__/lib/get-thread-by-id.test.ts
```
Expected: All 3 tests PASS.

### Step 5: Verify the build

```bash
bun run build
```
Expected: successful.

### Step 6: Commit

```bash
git add lib/community-data.ts __tests__/lib/get-thread-by-id.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile): add getThreadById for single-thread server fetching

Mirrors getCommunityThreads shape so ThreadView can consume either.
Scoped to community to prevent cross-community id lookups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `<ThreadView>` from `ThreadModal`

**Goal:** Move the 800-line `ThreadModal`'s inner JSX and state into a new `<ThreadView>` component that doesn't know whether it's inside a Dialog or a page. `ThreadModal` becomes a thin Dialog wrapper around `<ThreadView>`. This is a refactor: desktop behavior must be pixel-identical after.

**Files:**
- Create: `components/ThreadView.tsx`
- Modify: `components/ThreadModal.tsx` (reduces from ~839 lines to ~60)
- Create: `__tests__/components/ThreadView.test.tsx`

**Approach:**
1. Read the current `ThreadModal.tsx` end-to-end.
2. Move *everything* inside `<DialogContent>` (lines roughly 580–820) into a new `<ThreadView>` component that accepts the same props as `ThreadModal` plus:
   - an optional `layout: 'modal' | 'page'` prop (default `'modal'`)
   - A `headerSlot?: React.ReactNode` prop to inject a page-mode header (e.g., a back button)
3. `ThreadModal` renders:
   ```tsx
   <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
     <DialogContent className="sm:max-w-[750px] p-0 max-h-[90vh] flex flex-col bg-card border-border/50 rounded-2xl overflow-hidden">
       <ThreadView layout="modal" {...props} />
     </DialogContent>
   </Dialog>
   ```
4. When `layout === 'page'`, `<ThreadView>` renders its root as a `<div>` that fills its container (not `max-h-[90vh]`). Page mode renders `headerSlot` above the thread title.
5. All callbacks (`onClose`, `onLikeUpdate`, `onCommentUpdate`, etc.) pass through untouched from ThreadModal → ThreadView.
6. All internal state (edit mode, comment input, likes optimistic updates, etc.) moves into `ThreadView` — it's where the UI lives.

### Step 1: Read `ThreadModal.tsx` in full

```bash
cd /home/debian/apps/dance-hub-mobile-p2a
cat components/ThreadModal.tsx | head -200
```

Note the current prop shape, state declarations, and the JSX tree inside `<DialogContent>`.

### Step 2: Write the failing test for the new component

Create `__tests__/components/ThreadView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import ThreadView from '@/components/ThreadView';

jest.mock('next/navigation', () => ({
  usePathname: () => '/bachataflow',
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1', email: 'u@example.com', name: 'U' } },
    user: { id: 'u1' },
    loading: false,
  }),
}));

const baseThread = {
  id: 't1',
  user_id: 'u1',
  title: 'Hello world',
  content: 'Body content here',
  author: { name: 'Jane', image: '' },
  created_at: '2026-04-20T10:00:00.000Z',
  likes_count: 2,
  comments_count: 1,
  category: 'Announcements',
  likes: ['u2'],
  comments: [
    {
      id: 'c1',
      thread_id: 't1',
      user_id: 'u2',
      content: 'Reply',
      created_at: '2026-04-20T10:05:00.000Z',
      parent_id: null,
      author: { name: 'Bob', image: '' },
      likes: [],
      likes_count: 0,
    },
  ],
  pinned: false,
};

describe('ThreadView', () => {
  it('renders the thread title and content in modal layout (default)', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Body content here')).toBeInTheDocument();
  });

  it('renders comments', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
      />,
    );
    expect(screen.getByText('Reply')).toBeInTheDocument();
  });

  it('renders headerSlot when provided in page layout', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
        layout="page"
        headerSlot={<div>Back to feed</div>}
      />,
    );
    expect(screen.getByText('Back to feed')).toBeInTheDocument();
  });

  it('does not render headerSlot in modal layout', () => {
    render(
      <ThreadView
        thread={baseThread as never}
        onClose={() => {}}
        onLikeUpdate={() => {}}
        layout="modal"
        headerSlot={<div>Should not appear</div>}
      />,
    );
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });
});
```

### Step 3: Run the test to verify it fails

```bash
bun run test __tests__/components/ThreadView.test.tsx
```
Expected: FAIL — `Cannot find module '@/components/ThreadView'`.

### Step 4: Extract `ThreadView` from `ThreadModal`

This is the largest step in the plan. Work methodically:

1. Copy `components/ThreadModal.tsx` to `components/ThreadView.tsx`.
2. In `ThreadView.tsx`:
   - Rename the default export from `ThreadModal` to `ThreadView`.
   - Change the props interface: add `layout?: 'modal' | 'page'` (default `'modal'`) and `headerSlot?: React.ReactNode`. Remove `isOpen` (the outer Dialog controls mount; ThreadView always renders when mounted).
   - Remove the `<Dialog open={isOpen} onOpenChange={...}>` and `<DialogContent className="...">` wrappers.
   - Root the component in a new wrapper:
     ```tsx
     const rootClassName =
       layout === 'page'
         ? 'flex flex-col bg-card border-border/50 overflow-hidden'
         : 'flex flex-col max-h-[90vh] bg-card border-border/50 rounded-2xl overflow-hidden';

     return (
       <div className={rootClassName}>
         {layout === 'page' && headerSlot ? (
           <div className="shrink-0 border-b border-border/50">{headerSlot}</div>
         ) : null}
         {/* existing thread JSX (author row, title, content, actions, comments, input) */}
       </div>
     );
     ```
   - Keep every state hook, mutation, and inner helper function intact. This is a JSX-tree refactor, not a logic change.
   - Remove the Dialog-specific DialogContent prop `className="sm:max-w-[750px] p-0 ..."` — the wrapper is now in ThreadModal.
3. In `ThreadModal.tsx`:
   - Replace the entire file body with:
     ```tsx
     'use client';

     import { Dialog, DialogContent } from '@/components/ui/dialog';
     import ThreadView, { type ThreadViewProps } from '@/components/ThreadView';

     type ThreadModalProps = Omit<ThreadViewProps, 'layout' | 'headerSlot'> & {
       isOpen: boolean;
     };

     export default function ThreadModal({ isOpen, onClose, ...rest }: ThreadModalProps) {
       return (
         <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
           <DialogContent className="sm:max-w-[750px] p-0 max-h-[90vh] flex flex-col bg-card border-border/50 rounded-2xl overflow-hidden">
             <ThreadView {...rest} onClose={onClose} layout="modal" />
           </DialogContent>
         </Dialog>
       );
     }
     ```
4. Export `ThreadViewProps` from `ThreadView.tsx`:
   ```tsx
   export type ThreadViewProps = {
     thread: { /* ...same shape as before... */ };
     onClose: () => void;
     onLikeUpdate: (threadId: string, newLikesCount: number, liked: boolean) => void;
     onCommentUpdate?: (threadId: string, newComment: unknown) => void;
     onThreadUpdate?: (threadId: string, updates: unknown) => void;
     onDelete?: (threadId: string) => void;
     isCreator?: boolean;
     layout?: 'modal' | 'page';
     headerSlot?: React.ReactNode;
   };
   ```

### Step 5: Run the ThreadView tests to verify they pass

```bash
bun run test __tests__/components/ThreadView.test.tsx
```
Expected: All 4 tests PASS.

### Step 6: Verify desktop regression

Run `bun run build` and then start the dev server (`bun dev`). Open a community page in Chrome at ≥ 1024px width, click a post card, confirm the modal opens and all interactions (like, comment, edit if owner, delete, close-X) still work identically to today. Also verify typing a comment and pressing submit posts it.

This is a manual regression check — if anything behaves differently from today, STOP and report BLOCKED. Do not proceed to Task 3 with a broken modal.

### Step 7: Commit

```bash
git add components/ThreadView.tsx components/ThreadModal.tsx __tests__/components/ThreadView.test.tsx
git commit -m "$(cat <<'EOF'
refactor(thread): extract ThreadView; ThreadModal becomes Dialog wrapper

ThreadView now contains all inner state and JSX; ThreadModal is a 30-line
Dialog wrapper. Enables reusing ThreadView for the upcoming mobile thread
route page. Desktop modal behavior is pixel-identical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create the mobile thread route page

**Goal:** A server-rendered route `/[communitySlug]/threads/[threadId]` that fetches the thread via `getThreadById`, renders a mobile-friendly page layout, and hands the thread to `<ThreadView>` in `layout="page"` mode. Includes a back button that returns to the feed.

**Files:**
- Create: `app/[communitySlug]/threads/[threadId]/page.tsx` (Server Component)
- Create: `app/[communitySlug]/threads/[threadId]/ThreadPageClient.tsx` (Client wrapper)

### Step 1: Create the server component

Create `app/[communitySlug]/threads/[threadId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getCommunityBySlug, getThreadById } from '@/lib/community-data';
import { getSession } from '@/lib/auth-session';
import ThreadPageClient from './ThreadPageClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ThreadRoutePage({
  params,
}: {
  params: { communitySlug: string; threadId: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const thread = await getThreadById(community.id, params.threadId);
  if (!thread) notFound();

  const session = await getSession();
  const isCreator = !!session && thread.userId === session.user.id;

  return (
    <ThreadPageClient
      communitySlug={params.communitySlug}
      thread={thread}
      isCreator={isCreator}
    />
  );
}
```

### Step 2: Create the client wrapper

Create `app/[communitySlug]/threads/[threadId]/ThreadPageClient.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ThreadView, { type ThreadViewProps } from '@/components/ThreadView';

// Shape matches the ThreadView prop (feed/thread model used by ThreadModal).
// getThreadById returns a CommunityThread; we adapt field names below.
type ThreadData = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  userId: string;
  author: { name: string; image: string };
  category: string;
  categoryId: string | null;
  likesCount: number;
  commentsCount: number;
  likes: string[];
  comments: Array<{
    id: string;
    thread_id: string;
    user_id: string;
    content: string;
    created_at: string;
    parent_id: string | null;
    author: { name: string; image: string };
    likes: string[];
    likes_count: number;
  }>;
  pinned: boolean;
};

export default function ThreadPageClient({
  communitySlug,
  thread,
  isCreator,
}: {
  communitySlug: string;
  thread: ThreadData;
  isCreator: boolean;
}) {
  const router = useRouter();

  // ThreadView expects fields under the names the modal already uses.
  const viewThread: ThreadViewProps['thread'] = {
    id: thread.id,
    user_id: thread.userId,
    title: thread.title,
    content: thread.content,
    author: thread.author,
    created_at: thread.createdAt,
    likes_count: thread.likesCount,
    comments_count: thread.commentsCount,
    category: thread.category,
    likes: thread.likes,
    comments: thread.comments,
    pinned: thread.pinned,
  };

  const handleClose = () => {
    router.push(`/${communitySlug}`);
  };

  // The "like" / "comment" / "edit" mutations in ThreadView call these back.
  // For the route page, we don't have the parent feed list to update — we just
  // refresh the current route so SSR re-reads the latest state from DB.
  const noopLikeUpdate = () => router.refresh();
  const noopCommentUpdate = () => router.refresh();
  const noopThreadUpdate = () => router.refresh();
  const handleDelete = () => router.push(`/${communitySlug}`);

  const backHeader = (
    <div className="flex items-center gap-2 px-4 py-3">
      <Link
        href={`/${communitySlug}`}
        aria-label="Back to feed"
        className="p-2 -ml-2 rounded-full hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="text-sm font-medium text-muted-foreground">Thread</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <ThreadView
        thread={viewThread}
        onClose={handleClose}
        onLikeUpdate={noopLikeUpdate}
        onCommentUpdate={noopCommentUpdate}
        onThreadUpdate={noopThreadUpdate}
        onDelete={handleDelete}
        isCreator={isCreator}
        layout="page"
        headerSlot={backHeader}
      />
    </div>
  );
}
```

### Step 3: Verify build and manual smoke

```bash
bun run build
```
Expected: successful. Next prints the new route `/[communitySlug]/threads/[threadId]` in the route table.

Start `bun dev`. In Chrome DevTools mobile emulation (iPhone 12 Pro):
1. Visit `/<community-slug>` as a member.
2. Manually navigate to `/<community-slug>/threads/<existing-thread-id>` (get a real id from the feed by copying one thread's data from the DOM or the Network tab).
3. Verify: thread renders as a page (not a modal), back button works (returns to feed), like/comment interactions work, layout is readable.
4. Try an invalid id: `/<community-slug>/threads/deadbeef` — should render the 404 page.
5. On desktop width, visit the same URL — should render identically (as a page, no modal). Back button still works.

### Step 4: Commit

```bash
git add app/[communitySlug]/threads/
git commit -m "$(cat <<'EOF'
feat(mobile): add thread route page at /[communitySlug]/threads/[threadId]

Server-renders the thread via getThreadById and hands it to ThreadView in
page layout mode. Back button returns to the feed. Works as a fallback on
desktop for shared links; mobile users reach it from feed clicks in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Split FeedClient click behavior by viewport

**Goal:** Clicking a post card on mobile navigates to `/[communitySlug]/threads/[threadId]` via `router.push`; on desktop, it opens the modal (current behavior). Use `useIsMobile()` inside `FeedClient` (which is already a client component) for the viewport check.

**Files:**
- Modify: `app/[communitySlug]/FeedClient.tsx`

### Step 1: Wire `useIsMobile` and `useRouter`

`FeedClient.tsx` already imports `useRouter` from `next/navigation` (see the existing admin-navigation usage). Add `useIsMobile` if not already imported:

```tsx
import { useIsMobile } from '@/hooks/use-is-mobile';
```

### Step 2: Change the thread-click handler

Find the existing `onClick={() => setSelectedThread(thread)}` on `ThreadCardFluid` (currently around line 1016 per the audit — match by unique context, not line number). Replace with a named handler:

`FeedClient` already declares `communitySlug: string` as a prop (see line 151 and 185 of the current file). Add the mobile branch inside the component body, above the `return ( ... )`:

```tsx
const isMobile = useIsMobile();

const handleThreadClick = (thread: Thread) => {
  if (isMobile) {
    router.push(`/${communitySlug}/threads/${thread.id}`);
  } else {
    setSelectedThread(thread);
  }
};
```

Use the existing `Thread` type already declared/imported in `FeedClient.tsx` (the same type `selectedThread` uses in its `useState<Thread | null>(null)` declaration at line 247 per the audit). If the type is named differently in the file, use whatever the existing `selectedThread` state uses.

Then change the click attribute on the thread card:

```tsx
// was: onClick={() => setSelectedThread(thread)}
onClick={() => handleThreadClick(thread)}
```

**Notes:**
- `router` is already available (the file imports `useRouter` and invokes it — line 196 per the audit).
- The existing `selectedThread` state and modal rendering at the bottom of FeedClient stay untouched — they simply never fire on mobile because the `if (isMobile)` branch takes `router.push` first.

### Step 3: Verify the build

```bash
bun run build
```
Expected: successful.

### Step 4: Manual smoke

`bun dev`. Test both viewports:
- **Desktop (≥ 1024px):** click a post card, verify the modal opens (unchanged behavior).
- **Mobile (DevTools, iPhone 12 Pro):** click a post card, verify the URL changes to `/<slug>/threads/<id>` and the thread renders as a page. Back button returns to the feed (which shows the same posts where you left off).

### Step 5: Commit

```bash
git add app/[communitySlug]/FeedClient.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): route thread clicks to URL on mobile, keep modal on desktop

FeedClient uses useIsMobile to branch: mobile pushes to the new route,
desktop opens the existing ThreadModal. Desktop behavior is unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Small-phone polish for `CommunityHeader` and `ThreadCardFluid`

**Goal:** The community header's typography and the post card's spacing both work at `md+` already. At very narrow widths (< 375px, e.g., iPhone SE), they can look cramped. Add targeted `sm:` tweaks.

**Files:**
- Modify: `components/community/CommunityHeader.tsx`
- Modify: `components/community/ThreadCardFluid.tsx`

### Step 1: Update `CommunityHeader.tsx`

Locate the hero block classes. Current pattern: `h-64 md:h-72`, `p-6 md:p-8`, `text-3xl md:text-4xl`. Update to add a smaller baseline at narrow widths:

```tsx
<div className="relative h-56 sm:h-64 md:h-72 overflow-hidden rounded-3xl">
  {/* ... */}
  <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:p-8">
    <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold text-white">
      {/* community name */}
    </h1>
    <p className="text-white/90 text-sm md:text-base max-w-2xl mb-4 line-clamp-2">
      {/* description */}
    </p>
    {/* member row — unchanged */}
  </div>
</div>
```

Changes (only three):
- `h-64 md:h-72` → `h-56 sm:h-64 md:h-72`
- `p-6 md:p-8` → `p-4 sm:p-6 md:p-8`
- `text-3xl md:text-4xl` → `text-2xl sm:text-3xl md:text-4xl`

Everything else stays. The `line-clamp-2` on the description, the member avatar row, the Manage Community button, the SVG curve at the bottom — all unchanged.

### Step 2: Update `ThreadCardFluid.tsx`

Locate the outer card wrapper. Current padding: `p-5`. At narrow widths this is generous but touch targets inside can feel cramped. Change to:

```tsx
<div className="group relative bg-card rounded-2xl p-4 sm:p-5 cursor-pointer …{existing classes unchanged}">
```

Only that one change: `p-5` → `p-4 sm:p-5`.

Also verify the like / comment button row has enough tap area. Current buttons likely have `p-1` or `p-2`; ensure they're at least `min-h-[36px]` at narrow widths. If they're not, bump them via an added class `min-h-[44px]` to meet touch-target guidelines. (Inspect the existing markup during implementation — if they're already `44px+` in effective height, skip this sub-change.)

### Step 3: Verify the build

```bash
bun run build
```
Expected: successful.

### Step 4: Manual smoke

DevTools mobile emulation at iPhone SE (375 × 667). Verify:
- Community header is not cramped; title and description fit without overflow.
- Post cards have consistent padding; tap targets on like/comment icons are comfortable.

### Step 5: Commit

```bash
git add components/community/CommunityHeader.tsx components/community/ThreadCardFluid.tsx
git commit -m "$(cat <<'EOF'
fix(mobile): tighten CommunityHeader + ThreadCardFluid on narrow phones

Adds sm: breakpoints so small phones (< 640px) get reduced hero height,
padding, and heading sizes. Card padding drops to p-4 below sm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Phase 2a preprod deploy + Opus code review + merge

**Goal:** Open PR, deploy to preprod, run Opus code review over the phase, fix anything blocking, QA on a real phone, merge, deploy prod.

**Files:** none.

### Step 1: Run full test suite

```bash
cd /home/debian/apps/dance-hub-mobile-p2a && bun run test
```
Expected: no regressions from Phase 1 baseline; new tests (`get-thread-by-id`, `ThreadView`) all passing. Pre-existing failures from broadcasts/DB tests stay as-is (already documented as out-of-scope).

### Step 2: Verify build

```bash
bun run build
```
Expected: successful. The route table should include `/[communitySlug]/threads/[threadId]`.

### Step 3: Push branch

```bash
git push -u origin feat/mobile-feed-thread
```

### Step 4: Open PR

```bash
gh pr create --base main --head feat/mobile-feed-thread --title "feat(mobile): phase 2a — feed + thread" --body "$(cat <<'EOF'
## Summary
Second slice of the mobile-responsiveness project (spec: `docs/superpowers/specs/2026-04-20-mobile-responsiveness-design.md`). Makes the community feed and thread view first-class on mobile.

- Adds `getThreadById` in `lib/community-data.ts` — single-thread server fetcher mirroring `getCommunityThreads` shape
- Extracts `<ThreadView>` from `ThreadModal`; `ThreadModal` is now a thin Dialog wrapper. Desktop behavior pixel-identical.
- New route `/[communitySlug]/threads/[threadId]` — server-renders the thread as a page on mobile with a back button
- `FeedClient` splits thread-click behavior by viewport — mobile navigates to URL, desktop opens modal
- `CommunityHeader` + `ThreadCardFluid` — small-phone polish (`sm:` breakpoints for hero height, padding, headings)

## Test plan
- [ ] Desktop (≥ md): click a feed card → modal opens identical to today
- [ ] Desktop: paste a `/threads/[id]` URL → renders as a page (back button returns to feed)
- [ ] Mobile (DevTools iPhone 12 Pro): click a feed card → URL changes to `/threads/[id]`, page renders full-screen, back button returns to feed
- [ ] Mobile: tap 🔔 → NotificationsButton popover works (Phase 1 smoke)
- [ ] Mobile: bottom tab bar still visible and functional on the thread page
- [ ] Mobile: post a new comment from the thread page → appears after `router.refresh()`
- [ ] Mobile: iPhone SE width (375px) — header and cards read well
- [ ] Real iPhone Safari on preprod: end-to-end smoke

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 5: Detach Phase 2a worktree (to free branch for preprod deploy)

```bash
cd /home/debian/apps/dance-hub-mobile-p2a && git checkout --detach
```

### Step 6: Deploy to preprod

```bash
cd /home/debian/apps/dance-hub-preprod && ./deploy-preprod.sh deploy feat/mobile-feed-thread
```
Expected: successful build, pm2 process `dance-hub-preprod` restarts. Verify `https://preprod.dance-hub.io` returns HTTP 200.

### Step 7: Dispatch Opus code review

Use the `superpowers:code-reviewer` subagent with model `opus` to review the whole Phase 2a branch against the spec (Phase 2 scope) and against this plan. Required focus areas:
- `ThreadView` extraction — any behavior drift vs. the original `ThreadModal`?
- Hydration safety of the `useIsMobile` split in `FeedClient` — is the first render still stable?
- SQL in `getThreadById` — community-scoped WHERE clause present, no cross-community leaks
- Back-button UX on the new route page — does `router.push('/<slug>')` feel right, or should it be `router.back()`?
- Missing `aria-label` on interactive elements inside the new route page header

Address any 🔴 blockers before QA. Fold in 🟡 important items if quick.

### Step 8: Phone QA on preprod

On a real iPhone, walk the test plan above. Record any issues and address them as additional commits on the branch; then re-deploy preprod and re-QA.

### Step 9: Merge + prod deploy

```bash
gh pr merge <pr-number> --squash
```

Then from the main repo worktree:
```bash
cd /home/debian/apps/dance-hub
git fetch origin
# If local main is divergent (as happened after Phase 1), reconcile:
git reset --hard origin/main
./deploy.sh code
```
Verify `https://dance-hub.io` returns 200.

### Step 10: Cleanup

```bash
# Detach preprod worktree so the branch is deletable
cd /home/debian/apps/dance-hub-preprod && git checkout --detach
# Delete the merged branch (from the main repo)
cd /home/debian/apps/dance-hub && git branch -D feat/mobile-feed-thread 2>/dev/null || true
# Remove the Phase 2a worktree (detached)
git worktree remove /home/debian/apps/dance-hub-mobile-p2a
git worktree list  # sanity check
```

Update the Phase 1 shipped-note entry in the spec (optional): add "Phase 2a — shipped YYYY-MM-DD" similarly.
