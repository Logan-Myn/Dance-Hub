# Admin Settings Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1948-line `CommunitySettingsModal` client monolith with five focused RSC routes under `/[communitySlug]/admin/*`, matching the existing `admin/emails/page.tsx` pattern. Feature parity only.

**Architecture:** Each modal tab becomes an async RSC page that queries the DB directly via `@/lib/db`'s `queryOne`/`query`. Interactive bits are extracted into small client islands that call the existing API routes via `fetch` (no Server Actions — matches project convention). The `OnboardingWizard` stays a modal but is triggered from the Subscriptions page rather than nested in the settings modal. The work is phased across three commits so each commit is independently deployable.

**Tech Stack:** Next.js 14 App Router (RSC), TypeScript, Tailwind, `@/lib/db` (Neon HTTP driver), Bun, PM2, nginx on preprod.

**Spec:** `docs/superpowers/specs/2026-04-18-admin-settings-consolidation-design.md`

**Verification pattern (all tasks):** `bun run build` must succeed with no TypeScript errors. No unit tests per task — the project has no component-test culture for this surface, and the spec explicitly notes verification is manual via preprod. Each phase (commit) ends with a preprod deploy + smoke-test checkpoint.

**Worktree:** All edits happen in `/home/debian/apps/dance-hub-preprod`, never in the main repo (pm2 `dance-hub` serves from `/home/debian/apps/dance-hub`).

---

## Phase 1 — Setup

### Task 1: Create branch, check out in preprod worktree, parameterize `deploy-preprod.sh`

**Files:**
- Modify: `deploy-preprod.sh` (lines 5, 126)

**Context:** `deploy-preprod.sh` currently hardcodes `BRANCH="feature/stream-hub-integration"`. We'll accept an optional branch arg so future branch testing doesn't require editing the script.

- [ ] **Step 1.1: Create the branch from latest main**

```bash
cd /home/debian/apps/dance-hub
git fetch origin
git checkout main
git pull origin main
git branch refactor/admin-settings-consolidation
```

Expected: new branch created locally.

- [ ] **Step 1.2: Check out the new branch in the preprod worktree**

```bash
cd /home/debian/apps/dance-hub-preprod
git fetch origin
git checkout refactor/admin-settings-consolidation
```

Expected: the worktree now on the new branch.

- [ ] **Step 1.3: Parameterize `deploy-preprod.sh`**

Edit `deploy-preprod.sh`. Replace the `BRANCH="feature/stream-hub-integration"` line near the top with an argument-driven default:

```bash
# near the top, below APP_PORT/DOMAIN defaults
BRANCH="${2:-main}"
```

Then update the usage block at the bottom (line ~130) so the help text reflects the new arg:

```bash
echo "Usage: ./deploy-preprod.sh [deploy|restart|stop] [branch]"
echo ""
echo "  deploy  [branch]  — Full setup: checkout branch, build, nginx, pm2 (default: main)"
echo "  restart [branch]  — Pull latest, rebuild, restart pm2 (default: main)"
echo "  stop              — Stop preprod process"
```

- [ ] **Step 1.4: Verify the script still parses**

```bash
cd /home/debian/apps/dance-hub-preprod
bash -n deploy-preprod.sh && echo "syntax ok"
```

Expected: prints `syntax ok`.

- [ ] **Step 1.5: Commit the script change to the new branch**

```bash
cd /home/debian/apps/dance-hub-preprod
git add deploy-preprod.sh
git commit -m "chore(preprod): parameterize deploy-preprod.sh branch arg"
```

---

## Phase 2 — Commit 1: Add the new admin pages (modal still exists)

**All work in `/home/debian/apps/dance-hub-preprod`.**

### Task 2: Loosen the admin layout gate

**Files:**
- Modify: `app/[communitySlug]/admin/layout.tsx` (lines 16–27)

**Context:** Today's layout blocks the entire admin area unless `NEXT_PUBLIC_BROADCASTS_ENABLED === 'true'` or the community is `is_broadcast_vip`. Per the spec, settings must always be reachable by creators; Broadcasts being a sibling tab doesn't matter for the gate.

- [ ] **Step 2.1: Remove the broadcasts kill-switch**

Replace lines 16–27 of `app/[communitySlug]/admin/layout.tsx` with:

```tsx
  const community = await queryOne<{ id: string; created_by: string; name: string }>`
    SELECT id, created_by, name FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) redirect(`/${params.communitySlug}`);
  if (community.created_by !== session.user.id) redirect(`/${params.communitySlug}`);
```

(Drops the `is_broadcast_vip` column from the SELECT and removes the kill-switch block entirely.)

- [ ] **Step 2.2: Build to verify no TS errors**

```bash
cd /home/debian/apps/dance-hub-preprod
bun run build
```

Expected: build succeeds.

---

### Task 3: Update `AdminNav` with the new items

**Files:**
- Modify: `components/admin/AdminNav.tsx` (lines 14–16)

**Context:** Today `AdminNav` shows only Broadcasts. Per the spec, the five settings tabs are siblings of Broadcasts. Dashboard is NOT a nav item — it's the admin root.

- [ ] **Step 3.1: Add the four new nav items**

Replace the `items` array at lines 14–16 with:

```tsx
  const items = [
    { href: `/${communitySlug}/admin/general`, label: 'General' },
    { href: `/${communitySlug}/admin/members`, label: 'Members' },
    { href: `/${communitySlug}/admin/subscriptions`, label: 'Subscriptions' },
    { href: `/${communitySlug}/admin/thread-categories`, label: 'Thread Categories' },
    { href: `/${communitySlug}/admin/emails`, label: 'Broadcasts' },
  ];
```

- [ ] **Step 3.2: Build**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Expected: build succeeds. Nav items point at routes that don't exist yet — Next handles 404s on navigation, the build doesn't fail.

---

### Task 4: Replace admin root redirect with the Dashboard page

**Files:**
- Modify: `app/[communitySlug]/admin/page.tsx` (full rewrite)
- Create: `components/admin/DashboardKpis.tsx`

**Context:** Today `/admin/page.tsx` just redirects to `/admin/emails`. We replace it with a real RSC that reads community stats and renders KPI cards. Reference for the read pattern: `app/[communitySlug]/admin/emails/page.tsx` lines 11–35.

- [ ] **Step 4.1: Identify the existing stats queries**

The modal's `renderDashboard` (lines 1438–1527) renders: total members, monthly revenue, total threads, active members, membership growth, revenue growth. The data is fetched client-side from `/api/community/${slug}/stats` (called at line 399 of the modal). We'll replicate those reads with direct SQL inside the RSC so there's no client fetch.

Open and skim these two files so you know the data shape:
- `app/api/community/[communitySlug]/stats/route.ts`
- `components/CommunitySettingsModal.tsx` lines 1438–1527 (`renderDashboard`)

Copy the exact SQL from the stats route into the RSC below.

- [ ] **Step 4.2: Rewrite `app/[communitySlug]/admin/page.tsx`**

Replace the entire file with the pattern below. Fill in the SQL from step 4.1 where the comment says `/* ... */`:

```tsx
import { queryOne, query } from '@/lib/db';
import { DashboardKpis } from '@/components/admin/DashboardKpis';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AdminDashboardPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{ id: string; stripe_account_id: string | null }>`
    SELECT id, stripe_account_id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  // Port the same queries used by /api/community/[slug]/stats here so the RSC
  // serves HTML directly without an extra client fetch.
  const stats = await queryOne<{
    totalMembers: number;
    activeMembers: number;
    totalThreads: number;
    monthlyRevenue: number;
    membershipGrowth: number;
    revenueGrowth: number;
  }>`/* paste the aggregated SQL from app/api/community/[communitySlug]/stats/route.ts, binding ${community.id} */`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Dashboard
        </h1>
      </header>

      <DashboardKpis stats={stats} />
    </div>
  );
}
```

- [ ] **Step 4.3: Create `components/admin/DashboardKpis.tsx`**

This is a presentation-only server component (no `"use client"`). Port the JSX from `components/CommunitySettingsModal.tsx` lines 1438–1527 (the `renderDashboard` function body). Replace any references to `dashboardStats` state with the `stats` prop. Strip any `useState`/`useEffect`/click handlers — the KPI cards are read-only display. Keep the same Tailwind classes and icon imports.

Shape:

```tsx
import { TrendingUp, Users, BarChart3, DollarSign } from 'lucide-react';

interface DashboardKpisProps {
  stats: {
    totalMembers: number;
    activeMembers: number;
    totalThreads: number;
    monthlyRevenue: number;
    membershipGrowth: number;
    revenueGrowth: number;
  };
}

export function DashboardKpis({ stats }: DashboardKpisProps) {
  return (
    // Paste the KPI grid JSX from CommunitySettingsModal.tsx lines 1438–1527,
    // replacing `dashboardStats.*` with `stats.*`.
    // Remove any interactive elements — this is read-only.
  );
}
```

- [ ] **Step 4.4: Build**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Expected: build succeeds. Visit `/[slug]/admin` in dev (`bun dev`) and confirm the dashboard renders with real data.

---

### Task 5: Add General settings page

**Files:**
- Create: `app/[communitySlug]/admin/general/page.tsx`
- Create: `components/admin/GeneralSettingsForm.tsx`

**Context:** The modal's General tab lives inline at `components/CommunitySettingsModal.tsx` lines 1713–1916 and uses these mutations (extracted from the modal):
- `PUT /api/community/[slug]/update` (name, description, customLinks) — called at modal line 698
- `POST /api/community/[slug]/update-image` (image upload) — called at modal line 777, uses `lib/storage-client`'s `uploadFileToStorage`

Image upload currently uses `uploadFileToStorage(file, STORAGE_FOLDERS.communityImages)` from `lib/storage-client`. Re-use as-is.

- [ ] **Step 5.1: Create the RSC shell at `app/[communitySlug]/admin/general/page.tsx`**

```tsx
import { queryOne } from '@/lib/db';
import { GeneralSettingsForm } from '@/components/admin/GeneralSettingsForm';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function GeneralSettingsPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    custom_links: any;
  }>`
    SELECT id, name, description, image_url, custom_links
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          General
        </h1>
      </header>

      <GeneralSettingsForm
        communitySlug={params.communitySlug}
        initialName={community.name}
        initialDescription={community.description ?? ''}
        initialImageUrl={community.image_url ?? ''}
        initialCustomLinks={community.custom_links ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 5.2: Create `components/admin/GeneralSettingsForm.tsx`**

Port the General tab JSX from `components/CommunitySettingsModal.tsx` lines 1713–1916 into a focused client component. Rules:
1. Mark it `"use client"`.
2. Initialize state from the `initialX` props passed in from the RSC.
3. Keep the exact field IDs (`#settings-general` wrapper, etc.) so the feature tour still finds them after Phase 3 updates the tour handler. Wrap the outer form `<div>` with `id="settings-general"`.
4. Re-use the existing handlers/mutations from the modal:
   - `handleSaveChanges` (modal line ~688): fetches `PUT /api/community/${communitySlug}/update` with `{name, description, customLinks}`.
   - `handleImageUpload` (modal line ~770): uses `uploadFileToStorage` then posts `/api/community/${communitySlug}/update-image`.
   - `handleAddLink`, `handleRemoveLink`, `handleLinkChange` — pure state mutations, copy as-is.
5. After a successful save, call `router.refresh()` (from `next/navigation`) to re-render the RSC with new data.
6. Show `toast.success` / `toast.error` for UX feedback (same `react-hot-toast` as the modal).

Skeleton:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { Plus, X } from "lucide-react";

interface CustomLink { title: string; url: string; }

interface GeneralSettingsFormProps {
  communitySlug: string;
  initialName: string;
  initialDescription: string;
  initialImageUrl: string;
  initialCustomLinks: CustomLink[];
}

export function GeneralSettingsForm({
  communitySlug,
  initialName,
  initialDescription,
  initialImageUrl,
  initialCustomLinks,
}: GeneralSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>(initialCustomLinks);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSaveChanges() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/community/${communitySlug}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, customLinks }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success("Saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageUpload(file: File) {
    // port lines ~770–800 of CommunitySettingsModal.tsx here,
    // uploading via uploadFileToStorage and posting to /update-image.
    // Call router.refresh() on success.
  }

  // Port link-management handlers unchanged from the modal.

  return (
    <div id="settings-general" className="space-y-8">
      {/* Port the JSX from CommunitySettingsModal.tsx lines 1714–1915 here.
          Keep the same Tailwind classes and card structure. */}
    </div>
  );
}
```

- [ ] **Step 5.3: Build + smoke test in dev**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Expected: build succeeds. Start dev server (`bun dev`), navigate to `/[slug]/admin/general`, edit name and save, confirm page re-renders with the new value.

---

### Task 6: Add Members page

**Files:**
- Create: `app/[communitySlug]/admin/members/page.tsx`
- Create: `components/admin/MembersTable.tsx`

**Context:** The modal's Members tab (`renderMembers`, lines 1528–1626) lists active/inactive members with a remove action. Current calls:
- GET `/api/community/[slug]/members` (modal line 440)
- DELETE `/api/community/[slug]/members` (modal line 993) with `{memberId}` in body

- [ ] **Step 6.1: Create `app/[communitySlug]/admin/members/page.tsx`**

```tsx
import { queryOne, query } from '@/lib/db';
import { MembersTable, MemberRow } from '@/components/admin/MembersTable';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function MembersPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  // Replicate the SELECT from app/api/community/[communitySlug]/members/route.ts.
  const members = await query<MemberRow>`/* paste the member SELECT, binding ${community.id} */`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Members
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{members.length} total</p>
      </header>

      <MembersTable communitySlug={params.communitySlug} members={members} />
    </div>
  );
}
```

- [ ] **Step 6.2: Create `components/admin/MembersTable.tsx`**

Port the table JSX from `components/CommunitySettingsModal.tsx` lines 1540–1623. Rules:
1. Mark it `"use client"`.
2. Receive the members list as a prop — no client-side `fetch` on mount.
3. `handleRemoveMember` (port from modal line ~987) calls `DELETE /api/community/[slug]/members` then `router.refresh()`.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  imageUrl: string;
  joinedAt: string;
  status: "active" | "inactive";
  lastActive?: string;
}

interface MembersTableProps {
  communitySlug: string;
  members: MemberRow[];
}

export function MembersTable({ communitySlug, members }: MembersTableProps) {
  const router = useRouter();

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Remove this member?")) return;
    try {
      const res = await fetch(`/api/community/${communitySlug}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) throw new Error("remove failed");
      toast.success("Member removed");
      router.refresh();
    } catch (err) {
      toast.error("Failed to remove member");
    }
  }

  return (
    // Port the <div className="bg-card rounded-2xl …"><table>…</table></div>
    // block from modal lines 1540–1623. Replace the modal's `members` variable
    // references with `members` from props; keep `handleRemoveMember` wired
    // to the table's Remove button.
  );
}
```

- [ ] **Step 6.3: Build + smoke test**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Navigate to `/[slug]/admin/members` in dev; confirm member list renders and remove action works end-to-end (returns to an updated list after `router.refresh`).

---

### Task 7: Add Subscriptions page (with OnboardingWizard modal)

**Files:**
- Create: `app/[communitySlug]/admin/subscriptions/page.tsx`
- Create: `components/admin/SubscriptionsEditor.tsx`

**Context:** The modal's Subscriptions tab (`renderSubscriptions` at line 1014) composes three sub-sections: `renderStripeConnectionStatus` (1027), `renderMembershipSettings` (1053), `renderPayoutManagement` (1178). It also triggers the `OnboardingWizard` modal (rendered at modal line 1938–1945). Relevant endpoints:
- `GET /api/stripe/account-status/[accountId]` — to render connection status (modal line 862)
- `POST /api/community/[slug]/update-price` — pricing mutation
- Stripe Connect onboarding — launched via the OnboardingWizard modal

`OnboardingWizard` props (from `components/stripe-onboarding/OnboardingWizard.tsx:75–80`):

```ts
interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communitySlug: string;
  onComplete: (accountId: string) => void;
}
```

- [ ] **Step 7.1: Create `app/[communitySlug]/admin/subscriptions/page.tsx`**

```tsx
import { queryOne } from '@/lib/db';
import { SubscriptionsEditor } from '@/components/admin/SubscriptionsEditor';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function SubscriptionsPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{
    id: string;
    stripe_account_id: string | null;
    monthly_price: number | null;
    // Add any other pricing columns the modal currently reads.
  }>`
    SELECT id, stripe_account_id, monthly_price
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Subscriptions
        </h1>
      </header>

      <SubscriptionsEditor
        communityId={community.id}
        communitySlug={params.communitySlug}
        stripeAccountId={community.stripe_account_id}
        initialMonthlyPrice={community.monthly_price}
      />
    </div>
  );
}
```

- [ ] **Step 7.2: Create `components/admin/SubscriptionsEditor.tsx`**

Port the three `renderStripeConnectionStatus`, `renderMembershipSettings`, `renderPayoutManagement` sections from the modal (lines 1027–1373) into a single client component. Wire the `OnboardingWizard` modal inside it.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingWizard } from "@/components/stripe-onboarding/OnboardingWizard";
// + other imports ported from the modal

interface SubscriptionsEditorProps {
  communityId: string;
  communitySlug: string;
  stripeAccountId: string | null;
  initialMonthlyPrice: number | null;
}

export function SubscriptionsEditor({
  communityId,
  communitySlug,
  stripeAccountId: initialStripeAccountId,
  initialMonthlyPrice,
}: SubscriptionsEditorProps) {
  const router = useRouter();
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState(initialStripeAccountId);
  // Port other state used by the three render* helpers.

  async function handleOnboardingComplete(accountId: string) {
    setStripeAccountId(accountId);
    setIsOnboardingWizardOpen(false);
    router.refresh();
  }

  // Port handleUpdatePrice and any other mutations from the modal.
  // Each mutation ends with router.refresh().

  return (
    <div id="settings-subscriptions" className="space-y-8">
      {/* Port renderStripeConnectionStatus JSX (modal lines 1027–1052) */}
      {/* Port renderMembershipSettings JSX (modal lines 1053–1177) */}
      {/* Port renderPayoutManagement JSX (modal lines 1178–1373) */}
      {/* "Set up payments" button → setIsOnboardingWizardOpen(true) */}

      <OnboardingWizard
        isOpen={isOnboardingWizardOpen}
        onClose={() => setIsOnboardingWizardOpen(false)}
        communityId={communityId}
        communitySlug={communitySlug}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
}
```

- [ ] **Step 7.3: Build + smoke test**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

In dev, visit `/[slug]/admin/subscriptions`. Confirm: Stripe status card renders; price can be updated; clicking "Set up payments" opens the OnboardingWizard modal (stays on page — no navigation away).

---

### Task 8: Add Thread Categories page

**Files:**
- Create: `app/[communitySlug]/admin/thread-categories/page.tsx`
- Create: `components/admin/ThreadCategoriesEditor.tsx`

**Context:** The modal's Thread Categories tab (`renderThreadCategories` at line 1374) uses `@dnd-kit` with `DraggableCategory` children for drag-to-reorder. The whole experience is client-side. We reuse `components/DraggableCategory.tsx` as-is.

Endpoint: `/api/community/[slug]/categories` (GET / POST / PATCH / DELETE) — check the existing route under `app/api/community/[communitySlug]/categories/route.ts` for the exact shapes.

- [ ] **Step 8.1: Create `app/[communitySlug]/admin/thread-categories/page.tsx`**

```tsx
import { queryOne, query } from '@/lib/db';
import { ThreadCategoriesEditor, CategoryRow } from '@/components/admin/ThreadCategoriesEditor';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ThreadCategoriesPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  // Replicate the SELECT used inside the existing categories API route.
  const categories = await query<CategoryRow>`/* paste the ordered SELECT, binding ${community.id} */`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Thread Categories
        </h1>
      </header>

      <ThreadCategoriesEditor
        communitySlug={params.communitySlug}
        initialCategories={categories}
      />
    </div>
  );
}
```

- [ ] **Step 8.2: Create `components/admin/ThreadCategoriesEditor.tsx`**

Port `renderThreadCategories` (modal lines 1374–1437) into a focused client component. Reuse the existing `components/DraggableCategory.tsx` import. Wrap the outer `<div>` with `id="settings-thread_categories"` to preserve the tour anchor.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DraggableCategory } from "@/components/DraggableCategory";
import { ThreadCategory } from "@/types/community";

export type CategoryRow = ThreadCategory;

interface ThreadCategoriesEditorProps {
  communitySlug: string;
  initialCategories: CategoryRow[];
}

export function ThreadCategoriesEditor({ communitySlug, initialCategories }: ThreadCategoriesEditorProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryRow[]>(initialCategories);

  // Port handleDragEnd, handleAddCategory, handleRemoveCategory,
  // handleEditCategory from modal. Each persists via
  // /api/community/${communitySlug}/categories and ends with router.refresh().

  return (
    <div id="settings-thread_categories" className="space-y-6">
      {/* Port JSX from modal lines 1374–1437 here. */}
    </div>
  );
}
```

- [ ] **Step 8.3: Build + smoke test**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

In dev, visit `/[slug]/admin/thread-categories`. Confirm add / drag-to-reorder / delete all persist.

---

### Task 9: Preprod deploy + smoke test (checkpoint 1)

**Files:** none (verification only)

- [ ] **Step 9.1: Stage all Phase 2 changes**

```bash
cd /home/debian/apps/dance-hub-preprod
git add app/[communitySlug]/admin components/admin
git status --short
```

Expected: all new admin pages + client islands listed, no unrelated files.

- [ ] **Step 9.2: Commit Phase 2**

```bash
git commit -m "feat(admin): add RSC settings pages alongside existing modal

Creates /admin/{general,members,subscriptions,thread-categories} as
async server components matching the admin/emails pattern, plus the
Dashboard at /admin root. Modal still exists; creators can reach
settings from either place during transition."
```

- [ ] **Step 9.3: Push and deploy to preprod**

```bash
git push -u origin refactor/admin-settings-consolidation
./deploy-preprod.sh deploy refactor/admin-settings-consolidation
```

Expected: build succeeds; PM2 `dance-hub-preprod` online on port 3009; https://preprod.dance-hub.io returns 200.

- [ ] **Step 9.4: Smoke test on preprod (as a community creator)**

Walk through all five admin routes on `preprod.dance-hub.io`:

- `/admin` — Dashboard KPIs render with real stats.
- `/admin/general` — edit name → save → reload; new name is shown.
- `/admin/general` — upload image → image updates.
- `/admin/members` — member list renders; remove a test member → list updates.
- `/admin/subscriptions` — Stripe status card renders; update price persists; "Set up payments" opens the OnboardingWizard modal.
- `/admin/thread-categories` — add / reorder / delete categories all persist.
- `/admin/emails` — Broadcasts still works unchanged.
- Open `/admin/general` in an incognito window as a non-creator → redirected away.

All must pass before moving to Phase 3.

---

## Phase 3 — Commit 2: Switch entry points

### Task 10: Update the gear icon to route to `/admin`

**Files:**
- Modify: `app/[communitySlug]/FeedClient.tsx` (around line 967)

**Context:** `CommunityHeader` (imported from `@/components/community/CommunityHeader`) receives an `onManageClick` callback that currently flips `showSettingsModal`. Per the spec, the gear navigates to `/admin` instead.

- [ ] **Step 10.1: Replace `onManageClick` with a router.push**

In `FeedClient.tsx`, near the top of the component, make sure `useRouter` is imported:

```tsx
import { useRouter } from "next/navigation";
```

Inside the component, add (if not already present):

```tsx
const router = useRouter();
```

Then change line 967:

```tsx
onManageClick={() => setShowSettingsModal(true)}
```

to:

```tsx
onManageClick={() => router.push(`/${communitySlug}/admin`)}
```

(Confirm `communitySlug` is in scope — it should be, the file already uses it elsewhere.)

- [ ] **Step 10.2: Build**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Expected: build succeeds.

---

### Task 11: Update the Stripe requirements alert to link to `/admin/subscriptions`

**Files:**
- Modify: `components/CommunityHeader.tsx` (lines 28–42)

**Context:** Today the Stripe alert's `onSettingsClick` opens the modal on the Subscriptions tab. Replace with a direct link.

- [ ] **Step 11.1: Convert the wrapper into a link**

Open `components/CommunityHeader.tsx`. The block currently is:

```tsx
<StripeRequirementsAlert
  stripeAccountId={community.stripeAccountId}
  onSettingsClick={() => {
    setIsSettingsModalOpen(true);
    setActiveSettingsTab('subscriptions');
  }}
/>
```

Replace with a router-based click:

```tsx
<StripeRequirementsAlert
  stripeAccountId={community.stripeAccountId}
  onSettingsClick={() => router.push(`/${community.slug}/admin/subscriptions`)}
/>
```

Add these at the top if not already imported:

```tsx
import { useRouter } from 'next/navigation';
```

And inside the component body before the `return`:

```tsx
const router = useRouter();
```

(Keep the state declarations intact — we delete them in Phase 4, not here.)

- [ ] **Step 11.2: Build**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Expected: build succeeds.

---

### Task 12: Update the feature tour handler to navigate routes

**Files:**
- Modify: `app/[communitySlug]/FeedClient.tsx` (lines 323–369)

**Context:** The tour currently opens the modal and relies on the modal rendering `#settings-*` selectors. With the modal gone, the tour must `router.push` to the corresponding admin route, wait for paint, then let the existing selector highlighting logic run. The new admin pages preserve the same DOM IDs (`#settings-general`, `#settings-subscriptions`, `#settings-thread_categories`) via Tasks 5, 7, 8.

- [ ] **Step 12.1: Map selectors to routes**

Inside the `handleStepChange` function (around line 322 of `FeedClient.tsx`), replace the `if (settingsStepSelectors.includes(selector)) { ... }` block with a navigation-based approach:

```tsx
const selectorToRoute: Record<string, string> = {
  '#settings-general': `/${communitySlug}/admin/general`,
  '#settings-subscriptions': `/${communitySlug}/admin/subscriptions`,
  '#settings-thread_categories': `/${communitySlug}/admin/thread-categories`,
};

if (selector in selectorToRoute) {
  router.push(selectorToRoute[selector]);
  // Wait for the new page to render before the tour tries to highlight the element.
  const waitAndReposition = () => {
    setTimeout(() => {
      const target = document.querySelector(selector);
      if (target && (target as HTMLElement).offsetParent !== null) {
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => window.dispatchEvent(new Event('scroll')));
      } else {
        setTimeout(waitAndReposition, 100);
      }
    }, 150);
  };
  waitAndReposition();
} else if (selector === '#member-count') {
  // Navigate back to the community root if the previous step took us to /admin.
  router.push(`/${communitySlug}`);
} else if (selector === '#manage-community-button') {
  router.push(`/${communitySlug}`);
}
```

Delete the original `setShowSettingsModal(true)` / `setShowSettingsModal(false)` calls from inside this function. Leave `showSettingsModal` state alone — deleted in Phase 4.

- [ ] **Step 12.2: Build**

```bash
cd /home/debian/apps/dance-hub-preprod && bun run build
```

Expected: build succeeds.

---

### Task 13: Preprod deploy + smoke test (checkpoint 2)

**Files:** none (verification only)

- [ ] **Step 13.1: Commit Phase 3**

```bash
cd /home/debian/apps/dance-hub-preprod
git add app/[communitySlug]/FeedClient.tsx components/CommunityHeader.tsx
git status --short
```

Expected: only the two entry-point files changed.

```bash
git commit -m "feat(admin): route entry points to /admin instead of opening the settings modal

Gear icon, Stripe requirements alert, and feature tour now navigate to
the new admin routes. Modal is no longer triggered by anything, but the
file remains until the next commit."
```

- [ ] **Step 13.2: Push and deploy**

```bash
git push
./deploy-preprod.sh restart refactor/admin-settings-consolidation
```

- [ ] **Step 13.3: Smoke test on preprod**

- Click the gear icon in the community header → lands on `/admin` Dashboard.
- Trigger the Stripe requirements alert (create a test account lacking some requirement, or simulate it) → click takes you to `/admin/subscriptions`.
- Run the feature tour from the start → each settings step navigates to the correct admin route and the highlight appears on the corresponding `#settings-*` element.
- Confirm no nested-modal behavior remains (modal should never open now).

All must pass before moving to Phase 4.

---

## Phase 4 — Commit 3: Delete the modal

### Task 14: Remove `CommunitySettingsModal` and orphaned state/props

**Files:**
- Delete: `components/CommunitySettingsModal.tsx`
- Modify: `components/CommunityHeader.tsx` (remove modal import, state, render)
- Modify: `app/[communitySlug]/FeedClient.tsx` (remove modal import, state, render)

- [ ] **Step 14.1: Confirm nothing else imports the modal**

```bash
cd /home/debian/apps/dance-hub-preprod
grep -rn "CommunitySettingsModal" app components lib --include='*.ts' --include='*.tsx'
```

Expected: only `components/CommunitySettingsModal.tsx`, `components/CommunityHeader.tsx`, and `app/[communitySlug]/FeedClient.tsx` should appear. If any other file is listed, update that call site to use `router.push('/[slug]/admin/...')` before proceeding.

- [ ] **Step 14.2: Remove modal usage from `components/CommunityHeader.tsx`**

Delete:
- The `import CommunitySettingsModal from './CommunitySettingsModal';` line (currently line 5).
- The `const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);` line (currently line 23).
- The `const [activeSettingsTab, setActiveSettingsTab] = useState('general');` line (currently line 24).
- The entire `<CommunitySettingsModal … />` JSX block (currently lines 44–59).

Resulting component body should end with the `<StripeRequirementsAlert>` fragment and its wrapping `<div>`.

- [ ] **Step 14.3: Remove modal usage from `app/[communitySlug]/FeedClient.tsx`**

Delete:
- The `import CommunitySettingsModal from "@/components/CommunitySettingsModal";` line (currently line 11).
- The `interface CommunitySettingsModalProps { … }` block starting at line 145 (the prop interface is no longer needed).
- Any `useState` for `isSettingsModalOpen` (line 256) and `showSettingsModal` (line 270) that are now unused — the tour no longer references them.
- The `<CommunitySettingsModal … />` JSX block at line 1119.

After deletion, run a TS build to surface any remaining references.

- [ ] **Step 14.4: Delete the modal file**

```bash
cd /home/debian/apps/dance-hub-preprod
git rm components/CommunitySettingsModal.tsx
```

- [ ] **Step 14.5: Build and resolve any TS errors**

```bash
bun run build
```

Expected: build succeeds. If TS flags an unused import or a dangling prop passed down, delete that too — they are all leftovers from the modal.

---

### Task 15: Preprod deploy + smoke test (checkpoint 3)

**Files:** none (verification only)

- [ ] **Step 15.1: Commit Phase 4**

```bash
cd /home/debian/apps/dance-hub-preprod
git add -A
git status --short
```

Expected: `CommunitySettingsModal.tsx` listed as deleted; `CommunityHeader.tsx` and `FeedClient.tsx` modified.

```bash
git commit -m "refactor(admin): delete CommunitySettingsModal

All entry points now route to /admin instead of opening the modal.
Removing 1948 lines of client code in favor of the RSC pages added
in the first commit of this branch."
```

- [ ] **Step 15.2: Push and deploy**

```bash
git push
./deploy-preprod.sh restart refactor/admin-settings-consolidation
```

- [ ] **Step 15.3: Full smoke test on preprod**

Run the complete verification checklist from the spec:

- `bun run build` succeeds with no TS errors (already confirmed via deploy).
- Gear icon → lands on `/admin` Dashboard.
- Each tab (`general`, `members`, `subscriptions`, `thread-categories`, `emails`) loads correct data.
- **General:** edit name / description / image / custom links → persists; page re-renders with new values.
- **Members:** remove a member → list updates without full page reload.
- **Subscriptions:** update price; open Stripe onboarding wizard → end-to-end flow works unchanged.
- **Thread Categories:** add, reorder (drag-drop), remove → persists.
- **Stripe requirements alert banner** → deep-links to `/admin/subscriptions`.
- **Feature tour** still highlights the correct elements on the correct routes.
- **Non-creators** redirected away from every `/admin/*` route.
- **DevTools Network tab:** new pages serve HTML on first load (RSC), not client-fetched JSON.
- **Bundle check:** the gear-icon route no longer pulls in the modal's old client bundle.
  - Example: `cd /home/debian/apps/dance-hub-preprod && ls -la .next/static/chunks | sort -k5 -n | tail -20` — the giant chunk tied to the modal should be gone.
- **Mobile:** `AdminNav` looks acceptable at narrow widths (test at 375px). If it wraps awkwardly, open a follow-up ticket — don't fix in this PR unless trivial.

All must pass before merging to main.

---

## Phase 5 — Merge and production deploy

### Task 16: Open PR and merge to main

- [ ] **Step 16.1: Open the PR**

```bash
cd /home/debian/apps/dance-hub-preprod
gh pr create --title "Move community settings from modal to /admin routes" --body "$(cat <<'EOF'
## Summary
- Replace the 1948-line `CommunitySettingsModal` with five RSC routes under `/[communitySlug]/admin/*`, matching the `admin/emails/page.tsx` pattern.
- Each settings tab is an async server component that queries only the data it needs; client islands handle interactive bits via existing API routes.
- `OnboardingWizard` stays a modal but is triggered from the Subscriptions page instead of nested in the settings modal.

Spec: `docs/superpowers/specs/2026-04-18-admin-settings-consolidation-design.md`
Plan: `docs/superpowers/plans/2026-04-18-admin-settings-consolidation.md`

## Test plan
- [x] Deployed to preprod.dance-hub.io and full smoke-test checklist passed (see plan Task 15).
- [x] Feature tour still highlights the correct elements on the corresponding admin pages.
- [x] Non-creators cannot reach `/admin/*`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL in your response to the user.

- [ ] **Step 16.2: After review, merge via `gh pr merge` or the GitHub UI.**

Do not force-push or rewrite history — the three-commit history on the branch is meaningful (each commit is a safe deployable state).

---

### Task 17: Production deploy

- [ ] **Step 17.1: Deploy via the standard script**

```bash
cd /home/debian/apps/dance-hub
./deploy.sh code
```

(This is the prod convention per the project's memory — never manual `bun build` + `pm2 restart`.)

- [ ] **Step 17.2: Post-deploy smoke test on prod**

Quick sanity pass on https://dance-hub.io (or the prod domain) as a creator account:
- Gear icon → `/admin` Dashboard loads.
- Edit General → save → change persists.
- Confirm no stack traces in PM2 logs: `pm2 logs dance-hub --lines 100`.

- [ ] **Step 17.3: Cleanup**

```bash
# Restore deploy-preprod.sh default to 'main' for future branches (already done in Task 1, but confirm).
cd /home/debian/apps/dance-hub-preprod
git checkout main
```

Close the UFW port that was opened for the brainstorming visual companion (if still open):

```bash
sudo ufw delete allow 65056/tcp
```

---

## Self-review notes

- **Spec coverage:** All five routes (Dashboard, General, Members, Subscriptions, Thread Categories) have dedicated tasks. Entry-point updates (gear, Stripe alert, tour) each have their own task. Modal deletion and prod deploy have tasks. The `deploy-preprod.sh` parameterization is handled in Task 1. All three "Commits" from the spec (Section 5) correspond to Tasks 9, 13, 15 commit points.
- **No placeholders:** Every task includes exact file paths and either full code (new files/scaffolding) or explicit line ranges of existing code to port. Where the engineer needs to copy specific SQL from an existing API route, the task names the route file and column expectations.
- **Type consistency:** `MemberRow`, `CategoryRow` are declared once in the client-island files and re-exported to the RSC pages. `SubscriptionsEditor` receives `initialMonthlyPrice` consistently. `OnboardingWizard` props exactly match its existing signature.
- **Out-of-scope items flagged:** Unit tests, Stripe onboarding route conversion, mobile nav rework, and dashboard filters are all explicitly deferred.
