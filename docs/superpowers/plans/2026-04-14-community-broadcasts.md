# Community Broadcasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let community owners send rich-text email broadcasts to their active members, with a 10-per-month free quota, a €10/month unlimited tier, and an admin-toggleable VIP bypass.

**Architecture:** Owner opens an "Admin → Emails" section of their community, composes a rich-text email (Tiptap, inline images on B2), and sends it as a broadcast. Server-side, `lib/broadcasts/` modules handle quota checking, recipient filtering, Stripe billing, and Resend Batch API orchestration. A new `email_broadcasts` table is the audit trail and quota source. Stripe subscriptions (platform, not Connect) gate the unlimited tier.

**Tech Stack:** Next.js 14 App Router, Neon Postgres via `@neondatabase/serverless`, better-auth, Resend (Batch API), Tiptap, Backblaze B2 (S3-compatible), Stripe (platform account), React Email, Jest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-04-14-community-broadcasts-design.md`](../specs/2026-04-14-community-broadcasts-design.md)

---

## File structure

**New files (created by this plan):**

```
# Migrations (folder is named supabase/migrations/ historically — still the migration home)
supabase/migrations/2026-04-14_create_email_broadcasts.sql
supabase/migrations/2026-04-14_create_community_broadcast_subscriptions.sql
supabase/migrations/2026-04-14_add_is_broadcast_vip.sql
supabase/migrations/2026-04-14_add_teacher_broadcast_preference.sql

# Server-side lib
lib/broadcasts/quota.ts                    # getQuota, checkCanSend
lib/broadcasts/recipients.ts               # getActiveRecipientsForCommunity
lib/broadcasts/sender.ts                   # runBroadcast — batch send orchestration
lib/broadcasts/billing.ts                  # Stripe checkout + subscription helpers
lib/broadcasts/constants.ts                # FREE_QUOTA, SOFT_CAP, BATCH_SIZE, BATCH_DELAY_MS

# Resend template
lib/resend/templates/marketing/broadcast.tsx

# API routes
app/api/community/[communitySlug]/broadcasts/route.ts
app/api/community/[communitySlug]/broadcasts/[broadcastId]/route.ts
app/api/community/[communitySlug]/broadcasts/quota/route.ts
app/api/community/[communitySlug]/broadcasts/subscription/route.ts
app/api/community/[communitySlug]/broadcasts/test/route.ts
app/api/upload/broadcast-image/route.ts    # inline image upload endpoint

# UI pages
app/[communitySlug]/admin/layout.tsx
app/[communitySlug]/admin/page.tsx
app/[communitySlug]/admin/emails/page.tsx
app/[communitySlug]/admin/emails/new/page.tsx
app/[communitySlug]/admin/emails/[broadcastId]/page.tsx

# UI components
components/admin/AdminNav.tsx
components/emails/EmailEditor.tsx
components/emails/EmailComposer.tsx
components/emails/QuotaBadge.tsx
components/emails/UpgradeDialog.tsx
components/emails/BroadcastHistoryList.tsx

# Tests
__tests__/lib/broadcasts/quota.test.ts
__tests__/lib/broadcasts/recipients.test.ts
__tests__/lib/broadcasts/sender.test.ts
__tests__/lib/broadcasts/billing.test.ts
__tests__/api/broadcasts/route.test.ts
__tests__/api/broadcasts/subscription.test.ts
__tests__/api/broadcasts/quota.test.ts
__tests__/components/emails/EmailEditor.test.tsx
__tests__/components/emails/QuotaBadge.test.tsx
e2e/community-broadcasts.spec.ts
```

**Modified files:**

```
lib/resend/check-preferences.ts       # add 'teacher_broadcast' category
app/api/webhooks/stripe/route.ts      # add broadcast subscription event handlers
components/CommunityNavbar.tsx        # add owner-only "Admin" tab (path found during Task 25)
```

**File responsibilities:**

- **`lib/broadcasts/quota.ts`** — Pure async functions over the DB: quota lookup, send-gate decision. No Resend, no Stripe calls.
- **`lib/broadcasts/recipients.ts`** — Query active opted-in members for a community. Returns `{ userId, email, displayName, unsubscribeToken }[]`.
- **`lib/broadcasts/sender.ts`** — Given a broadcast row + recipient list, chunks and calls `resend.batch.send`, handles retries and partial failure. Updates the broadcast row.
- **`lib/broadcasts/billing.ts`** — Creates Stripe Checkout sessions and handles subscription lifecycle writes to `community_broadcast_subscriptions`.
- **`lib/broadcasts/constants.ts`** — `FREE_QUOTA_PER_MONTH = 10`, `PAID_SOFT_CAP_PER_MONTH = 200`, `BATCH_SIZE = 100`, `BATCH_DELAY_MS = 250`, `MAX_BATCH_RETRIES = 3`. Change these in one place.

---

## Implementation philosophy

- **Test-first for logic modules** (`lib/broadcasts/*`) and API routes — every function gets a failing test before implementation.
- **Lighter coverage for UI components** — one smoke test per interactive component, visual QA via Playwright smoke + manual checklist.
- **Commit after every green test**, and after each UI component is wired up. Keep commits small so review is easy.
- **No scaffolding before it's used.** If a later task needs a helper, the task that introduces it defines it — don't create empty shells.

---

## Phase 1 — Database foundation

### Task 1: Create `email_broadcasts` table

**Files:**
- Create: `supabase/migrations/2026-04-14_create_email_broadcasts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026-04-14_create_email_broadcasts.sql

CREATE TABLE email_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES profiles(id),
  subject text NOT NULL,
  html_content text NOT NULL,
  editor_json jsonb NOT NULL,
  preview_text text,
  recipient_count integer NOT NULL DEFAULT 0,
  status text NOT NULL
    CHECK (status IN ('pending', 'sending', 'sent', 'partial_failure', 'failed')),
  resend_batch_ids text[] NOT NULL DEFAULT '{}',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_broadcasts_community_created
  ON email_broadcasts (community_id, created_at DESC);

COMMENT ON TABLE email_broadcasts IS
  'Audit trail of community broadcast emails. Also the source of truth for monthly quota counting.';
```

- [ ] **Step 2: Apply migration against preprod branch**

Run: `psql "$NEON_PREPROD_DATABASE_URL" -f supabase/migrations/2026-04-14_create_email_broadcasts.sql`

Expected: `CREATE TABLE`, `CREATE INDEX`, `COMMENT` — no errors.

- [ ] **Step 3: Verify**

Run: `psql "$NEON_PREPROD_DATABASE_URL" -c "\d email_broadcasts"`
Expected: Table description listing all columns with correct types, the FK constraints, and the index.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-04-14_create_email_broadcasts.sql
git commit -m "feat(broadcasts): add email_broadcasts table"
```

---

### Task 2: Create `community_broadcast_subscriptions` table

**Files:**
- Create: `supabase/migrations/2026-04-14_create_community_broadcast_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026-04-14_create_community_broadcast_subscriptions.sql

CREATE TABLE community_broadcast_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL UNIQUE REFERENCES communities(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_broadcast_subscriptions_stripe_sub
  ON community_broadcast_subscriptions (stripe_subscription_id);

COMMENT ON TABLE community_broadcast_subscriptions IS
  'Stripe subscription state for the €10/month unlimited broadcast tier, one row per community.';
```

- [ ] **Step 2: Apply + verify**

Run: `psql "$NEON_PREPROD_DATABASE_URL" -f supabase/migrations/2026-04-14_create_community_broadcast_subscriptions.sql && psql "$NEON_PREPROD_DATABASE_URL" -c "\d community_broadcast_subscriptions"`
Expected: table created, UNIQUE constraint on community_id listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-04-14_create_community_broadcast_subscriptions.sql
git commit -m "feat(broadcasts): add community_broadcast_subscriptions table"
```

---

### Task 3: Add `is_broadcast_vip` to `communities`

**Files:**
- Create: `supabase/migrations/2026-04-14_add_is_broadcast_vip.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026-04-14_add_is_broadcast_vip.sql

ALTER TABLE communities
  ADD COLUMN is_broadcast_vip boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN communities.is_broadcast_vip IS
  'Platform-admin-toggleable flag. When true, this community bypasses broadcast quota and billing checks.';
```

- [ ] **Step 2: Apply + verify**

Run: `psql "$NEON_PREPROD_DATABASE_URL" -f supabase/migrations/2026-04-14_add_is_broadcast_vip.sql && psql "$NEON_PREPROD_DATABASE_URL" -c "\d communities" | grep is_broadcast_vip`
Expected: `is_broadcast_vip | boolean | ... | not null | false`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-04-14_add_is_broadcast_vip.sql
git commit -m "feat(broadcasts): add is_broadcast_vip flag to communities"
```

---

### Task 4: Add `teacher_broadcast` email preference column

**Context:** `lib/resend/check-preferences.ts` reads boolean columns from `email_preferences` (e.g., `marketing_emails`, `lesson_reminders`). We're adding a new column for the broadcast category.

**Files:**
- Create: `supabase/migrations/2026-04-14_add_teacher_broadcast_preference.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026-04-14_add_teacher_broadcast_preference.sql

ALTER TABLE email_preferences
  ADD COLUMN teacher_broadcast boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN email_preferences.teacher_broadcast IS
  'Whether this user accepts teacher/community-owner newsletter broadcasts. Default true — members opt in by joining a community.';
```

- [ ] **Step 2: Apply + verify**

Run: `psql "$NEON_PREPROD_DATABASE_URL" -f supabase/migrations/2026-04-14_add_teacher_broadcast_preference.sql`
Expected: `ALTER TABLE` — no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-04-14_add_teacher_broadcast_preference.sql
git commit -m "feat(broadcasts): add teacher_broadcast email preference"
```

---

## Phase 2 — Core library modules

### Task 5: `lib/broadcasts/constants.ts`

**Files:**
- Create: `lib/broadcasts/constants.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/broadcasts/constants.ts

export const FREE_QUOTA_PER_MONTH = 10;
export const PAID_SOFT_CAP_PER_MONTH = 200;
export const BATCH_SIZE = 100;          // Resend batch API: max 100 emails per call
export const BATCH_DELAY_MS = 250;      // ~4 req/sec, stays under Resend's 5 req/sec team cap
export const MAX_BATCH_RETRIES = 3;

export const BROADCAST_FROM_ADDRESS = 'community@dance-hub.io';

// Stripe — the €10/month price must be created in Stripe Dashboard, ID set here via env
export const BROADCAST_PRICE_ID_ENV = 'STRIPE_BROADCAST_PRICE_ID';
```

- [ ] **Step 2: Commit**

```bash
git add lib/broadcasts/constants.ts
git commit -m "feat(broadcasts): add shared constants"
```

---

### Task 6: `lib/broadcasts/recipients.ts` — get active opted-in members

**Files:**
- Create: `lib/broadcasts/recipients.ts`
- Test: `__tests__/lib/broadcasts/recipients.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/broadcasts/recipients.test.ts
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { sql } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
}));

const mockedSql = sql as unknown as jest.Mock;

describe('getActiveRecipientsForCommunity', () => {
  beforeEach(() => {
    mockedSql.mockReset();
  });

  it('returns active members who opted in to teacher_broadcast', async () => {
    mockedSql.mockResolvedValueOnce([
      { user_id: 'u1', email: 'a@example.com', full_name: 'Alice', unsubscribe_token: 'tok1' },
      { user_id: 'u2', email: 'b@example.com', full_name: 'Bob', unsubscribe_token: 'tok2' },
    ]);

    const result = await getActiveRecipientsForCommunity('community-123');

    expect(result).toEqual([
      { userId: 'u1', email: 'a@example.com', displayName: 'Alice', unsubscribeToken: 'tok1' },
      { userId: 'u2', email: 'b@example.com', displayName: 'Bob', unsubscribeToken: 'tok2' },
    ]);
    expect(mockedSql).toHaveBeenCalledTimes(1);
    // Query must filter: active status, teacher_broadcast = true, not unsubscribed_all
    const sqlCall = mockedSql.mock.calls[0];
    const sqlText = sqlCall[0].join('?');
    expect(sqlText).toMatch(/status = 'active'/);
    expect(sqlText).toMatch(/teacher_broadcast/);
    expect(sqlText).toMatch(/unsubscribed_all/);
  });

  it('returns empty array when no members match', async () => {
    mockedSql.mockResolvedValueOnce([]);
    const result = await getActiveRecipientsForCommunity('community-123');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/broadcasts/recipients.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/broadcasts/recipients.ts
import { query } from '@/lib/db';

export interface BroadcastRecipient {
  userId: string;
  email: string;
  displayName: string;
  unsubscribeToken: string | null;
}

interface RecipientRow {
  user_id: string;
  email: string;
  full_name: string | null;
  unsubscribe_token: string | null;
}

export async function getActiveRecipientsForCommunity(
  communityId: string
): Promise<BroadcastRecipient[]> {
  const rows = await query<RecipientRow>`
    SELECT
      m.user_id,
      p.email,
      p.full_name,
      ep.unsubscribe_token
    FROM community_members m
    JOIN profiles p ON p.id = m.user_id
    LEFT JOIN email_preferences ep ON ep.email = p.email
    WHERE m.community_id = ${communityId}
      AND m.status = 'active'
      AND (m.subscription_status = 'active' OR m.subscription_status IS NULL)
      AND (ep.teacher_broadcast IS DISTINCT FROM false)
      AND (ep.unsubscribed_all IS DISTINCT FROM true)
      AND p.email IS NOT NULL
  `;

  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.full_name ?? 'there',
    unsubscribeToken: row.unsubscribe_token,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/broadcasts/recipients.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/broadcasts/recipients.ts __tests__/lib/broadcasts/recipients.test.ts
git commit -m "feat(broadcasts): add recipient query"
```

---

### Task 7: `lib/broadcasts/quota.ts` — quota check logic

**Files:**
- Create: `lib/broadcasts/quota.ts`
- Test: `__tests__/lib/broadcasts/quota.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/broadcasts/quota.test.ts
import { getQuota, checkCanSend } from '@/lib/broadcasts/quota';
import { queryOne } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
}));

const mockedQueryOne = queryOne as unknown as jest.Mock;

describe('getQuota', () => {
  beforeEach(() => mockedQueryOne.mockReset());

  it('returns VIP when community is_broadcast_vip=true', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: true })
      .mockResolvedValueOnce(null);
    const result = await getQuota('c1');
    expect(result).toEqual({ tier: 'vip', used: expect.any(Number), limit: null });
  });

  it('returns paid when active subscription exists', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ count: 37 });
    const result = await getQuota('c1');
    expect(result).toEqual({ tier: 'paid', used: 37, limit: 200 });
  });

  it('returns free when no VIP, no active subscription', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 4 });
    const result = await getQuota('c1');
    expect(result).toEqual({ tier: 'free', used: 4, limit: 10 });
  });

  it('returns free when subscription is past_due', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce({ status: 'past_due' })
      .mockResolvedValueOnce({ count: 2 });
    const result = await getQuota('c1');
    expect(result.tier).toBe('free');
    expect(result.limit).toBe(10);
  });
});

describe('checkCanSend', () => {
  beforeEach(() => mockedQueryOne.mockReset());

  it('allows VIP unconditionally', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: true })
      .mockResolvedValueOnce(null);
    await expect(checkCanSend('c1')).resolves.toEqual({ allowed: true });
  });

  it('rejects free tier at 10/10 used', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 10 });
    await expect(checkCanSend('c1')).resolves.toEqual({
      allowed: false,
      reason: 'quota_exhausted',
      quota: { tier: 'free', used: 10, limit: 10 },
    });
  });

  it('rejects paid tier at soft cap 200/200', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ count: 200 });
    await expect(checkCanSend('c1')).resolves.toEqual({
      allowed: false,
      reason: 'soft_cap_reached',
      quota: { tier: 'paid', used: 200, limit: 200 },
    });
  });

  it('allows free tier at 9/10', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 9 });
    await expect(checkCanSend('c1')).resolves.toEqual({ allowed: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/broadcasts/quota.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// lib/broadcasts/quota.ts
import { queryOne } from '@/lib/db';
import { FREE_QUOTA_PER_MONTH, PAID_SOFT_CAP_PER_MONTH } from './constants';

export type QuotaTier = 'vip' | 'paid' | 'free';

export interface Quota {
  tier: QuotaTier;
  used: number;
  /** Null when unlimited (VIP). */
  limit: number | null;
}

export type CanSendResult =
  | { allowed: true }
  | { allowed: false; reason: 'quota_exhausted' | 'soft_cap_reached'; quota: Quota };

async function getUsedThisMonth(communityId: string): Promise<number> {
  const row = await queryOne<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM email_broadcasts
    WHERE community_id = ${communityId}
      AND created_at >= date_trunc('month', now())
      AND status IN ('sent', 'sending', 'partial_failure')
  `;
  return row?.count ?? 0;
}

export async function getQuota(communityId: string): Promise<Quota> {
  const community = await queryOne<{ is_broadcast_vip: boolean }>`
    SELECT is_broadcast_vip FROM communities WHERE id = ${communityId}
  `;

  const subscription = await queryOne<{ status: string }>`
    SELECT status
    FROM community_broadcast_subscriptions
    WHERE community_id = ${communityId}
  `;

  const used = await getUsedThisMonth(communityId);

  if (community?.is_broadcast_vip) {
    return { tier: 'vip', used, limit: null };
  }

  if (subscription?.status === 'active') {
    return { tier: 'paid', used, limit: PAID_SOFT_CAP_PER_MONTH };
  }

  // past_due, canceled, incomplete, or no subscription → free tier
  return { tier: 'free', used, limit: FREE_QUOTA_PER_MONTH };
}

export async function checkCanSend(communityId: string): Promise<CanSendResult> {
  const quota = await getQuota(communityId);

  if (quota.limit === null) {
    return { allowed: true };
  }

  if (quota.used < quota.limit) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: quota.tier === 'paid' ? 'soft_cap_reached' : 'quota_exhausted',
    quota,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/broadcasts/quota.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/broadcasts/quota.ts __tests__/lib/broadcasts/quota.test.ts
git commit -m "feat(broadcasts): add quota and checkCanSend"
```

---

### Task 8: `lib/broadcasts/sender.ts` — batch send orchestration

**Files:**
- Create: `lib/broadcasts/sender.ts`
- Test: `__tests__/lib/broadcasts/sender.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/broadcasts/sender.test.ts
import { runBroadcast } from '@/lib/broadcasts/sender';

const mockBatchSend = jest.fn();
const mockSql = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    batch: { send: (...args: unknown[]) => mockBatchSend(...args) },
  })),
}));

jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  queryOne: jest.fn(),
}));

const recipient = (i: number) => ({
  userId: `u${i}`,
  email: `user${i}@example.com`,
  displayName: `User ${i}`,
  unsubscribeToken: `tok${i}`,
});

describe('runBroadcast', () => {
  beforeEach(() => {
    mockBatchSend.mockReset();
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);
  });

  it('sends a single batch when recipients <= BATCH_SIZE', async () => {
    mockBatchSend.mockResolvedValueOnce({ data: { data: [{ id: 'batch-1' }] }, error: null });

    const result = await runBroadcast({
      broadcastId: 'b1',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      previewText: 'preview',
      recipients: [recipient(1), recipient(2)],
      fromName: 'My Community',
      replyTo: 'owner@example.com',
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('sent');
    expect(result.resendBatchIds).toEqual(['batch-1']);
  });

  it('chunks into multiple batches of 100', async () => {
    mockBatchSend.mockResolvedValue({ data: { data: [{ id: 'batch' }] }, error: null });
    const recipients = Array.from({ length: 250 }, (_, i) => recipient(i));

    const result = await runBroadcast({
      broadcastId: 'b1',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      recipients,
      fromName: 'X',
      replyTo: 'x@example.com',
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(result.status).toBe('sent');
  });

  it('returns partial_failure when some batches fail after retries', async () => {
    mockBatchSend
      .mockResolvedValueOnce({ data: { data: [{ id: 'batch-1' }] }, error: null })
      .mockRejectedValue(new Error('boom'));

    const recipients = Array.from({ length: 150 }, (_, i) => recipient(i));

    const result = await runBroadcast({
      broadcastId: 'b1',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      recipients,
      fromName: 'X',
      replyTo: 'x@example.com',
    });

    expect(result.status).toBe('partial_failure');
    expect(result.errorMessage).toContain('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/broadcasts/sender.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// lib/broadcasts/sender.ts
import { Resend } from 'resend';
import { BroadcastRecipient } from './recipients';
import {
  BATCH_SIZE,
  BATCH_DELAY_MS,
  MAX_BATCH_RETRIES,
  BROADCAST_FROM_ADDRESS,
} from './constants';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface RunBroadcastInput {
  broadcastId: string;
  subject: string;
  htmlContent: string;
  previewText?: string;
  recipients: BroadcastRecipient[];
  fromName: string;
  replyTo: string;
}

export interface RunBroadcastResult {
  status: 'sent' | 'partial_failure' | 'failed';
  resendBatchIds: string[];
  errorMessage?: string;
  successfulCount: number;
  failedCount: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildUnsubscribeUrl(token: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
  if (!token) return `${base}/settings/email-preferences`;
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}&type=teacher_broadcast`;
}

function personalizeHtml(html: string, recipient: BroadcastRecipient): string {
  // Replace placeholders that the template inserts: {{unsubscribeUrl}}, {{displayName}}
  return html
    .replace(/{{unsubscribeUrl}}/g, buildUnsubscribeUrl(recipient.unsubscribeToken))
    .replace(/{{displayName}}/g, recipient.displayName);
}

async function sendBatchWithRetry(
  batch: BroadcastRecipient[],
  subject: string,
  htmlContent: string,
  fromName: string,
  replyTo: string,
  previewText?: string
): Promise<{ batchId: string | null; error?: Error }> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_BATCH_RETRIES; attempt++) {
    try {
      const emails = batch.map((r) => ({
        from: `${fromName} <${BROADCAST_FROM_ADDRESS}>`,
        to: r.email,
        replyTo,
        subject,
        html: personalizeHtml(htmlContent, r),
        headers: previewText ? { 'X-Preview': previewText } : undefined,
        tags: [{ name: 'category', value: 'teacher_broadcast' }],
      }));

      const result = await resend.batch.send(emails);
      const firstId = (result as { data?: { data?: Array<{ id: string }> } })?.data?.data?.[0]?.id ?? null;
      return { batchId: firstId };
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_BATCH_RETRIES - 1) {
        await sleep(BATCH_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }
  return { batchId: null, error: lastError };
}

export async function runBroadcast(input: RunBroadcastInput): Promise<RunBroadcastResult> {
  const { recipients, subject, htmlContent, fromName, replyTo, previewText } = input;
  const chunks = chunk(recipients, BATCH_SIZE);

  const batchIds: string[] = [];
  const errors: Error[] = [];
  let successfulCount = 0;
  let failedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    const { batchId, error } = await sendBatchWithRetry(
      batch,
      subject,
      htmlContent,
      fromName,
      replyTo,
      previewText
    );
    if (batchId) {
      batchIds.push(batchId);
      successfulCount += batch.length;
    } else {
      if (error) errors.push(error);
      failedCount += batch.length;
    }
    // Throttle between batches (not after the last one)
    if (i < chunks.length - 1) await sleep(BATCH_DELAY_MS);
  }

  let status: RunBroadcastResult['status'];
  if (failedCount === 0) status = 'sent';
  else if (successfulCount === 0) status = 'failed';
  else status = 'partial_failure';

  return {
    status,
    resendBatchIds: batchIds,
    errorMessage: errors.length > 0 ? errors.map((e) => e.message).join('; ') : undefined,
    successfulCount,
    failedCount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/broadcasts/sender.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/broadcasts/sender.ts __tests__/lib/broadcasts/sender.test.ts
git commit -m "feat(broadcasts): add batch send orchestration with retries"
```

---

### Task 9: `lib/broadcasts/billing.ts` — Stripe Checkout + subscription helpers

**Files:**
- Create: `lib/broadcasts/billing.ts`
- Test: `__tests__/lib/broadcasts/billing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/lib/broadcasts/billing.test.ts
import {
  createBroadcastCheckoutSession,
  upsertBroadcastSubscription,
  markBroadcastSubscriptionStatus,
} from '@/lib/broadcasts/billing';

const mockCreateCheckout = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: (...a: unknown[]) => mockCreateCheckout(...a) } } },
}));

const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...args: unknown[]) => mockSql(...args),
  queryOne: jest.fn(),
}));

describe('createBroadcastCheckoutSession', () => {
  beforeEach(() => {
    mockCreateCheckout.mockReset();
    process.env.STRIPE_BROADCAST_PRICE_ID = 'price_test_123';
  });

  it('creates a Stripe Checkout session with community metadata', async () => {
    mockCreateCheckout.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/test', id: 'cs_1' });

    const result = await createBroadcastCheckoutSession({
      communityId: 'c1',
      communitySlug: 'salsa',
      ownerEmail: 'owner@example.com',
      returnUrl: 'https://app/admin/emails',
    });

    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/test', sessionId: 'cs_1' });
    expect(mockCreateCheckout).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      line_items: [{ price: 'price_test_123', quantity: 1 }],
      customer_email: 'owner@example.com',
      metadata: expect.objectContaining({ communityId: 'c1', purpose: 'broadcast_subscription' }),
      success_url: expect.stringContaining('salsa'),
      cancel_url: expect.stringContaining('salsa'),
    }));
  });
});

describe('upsertBroadcastSubscription', () => {
  it('inserts a new subscription row', async () => {
    mockSql.mockResolvedValueOnce([]);
    await upsertBroadcastSubscription({
      communityId: 'c1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      status: 'active',
      currentPeriodEnd: new Date('2026-05-01'),
    });
    expect(mockSql).toHaveBeenCalled();
    const sqlText = mockSql.mock.calls[0][0].join('?');
    expect(sqlText).toMatch(/INSERT INTO community_broadcast_subscriptions/);
    expect(sqlText).toMatch(/ON CONFLICT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/lib/broadcasts/billing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// lib/broadcasts/billing.ts
import { stripe } from '@/lib/stripe';
import { sql } from '@/lib/db';
import { BROADCAST_PRICE_ID_ENV } from './constants';

export interface CreateCheckoutSessionInput {
  communityId: string;
  communitySlug: string;
  ownerEmail: string;
  returnUrl: string; // base URL to build success/cancel
}

export interface CreateCheckoutSessionResult {
  checkoutUrl: string;
  sessionId: string;
}

export async function createBroadcastCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
  const priceId = process.env[BROADCAST_PRICE_ID_ENV];
  if (!priceId) throw new Error(`Missing ${BROADCAST_PRICE_ID_ENV}`);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
  const successUrl = `${baseUrl}/${input.communitySlug}/admin/emails?subscription=success`;
  const cancelUrl = `${baseUrl}/${input.communitySlug}/admin/emails?subscription=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: input.ownerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      communityId: input.communityId,
      purpose: 'broadcast_subscription',
    },
    subscription_data: {
      metadata: {
        communityId: input.communityId,
        purpose: 'broadcast_subscription',
      },
    },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');

  return { checkoutUrl: session.url, sessionId: session.id };
}

export interface UpsertSubscriptionInput {
  communityId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: Date | null;
}

export async function upsertBroadcastSubscription(input: UpsertSubscriptionInput): Promise<void> {
  await sql`
    INSERT INTO community_broadcast_subscriptions
      (community_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
    VALUES
      (${input.communityId}, ${input.stripeCustomerId}, ${input.stripeSubscriptionId},
       ${input.status}, ${input.currentPeriodEnd})
    ON CONFLICT (community_id) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
  `;
}

export async function markBroadcastSubscriptionStatus(
  stripeSubscriptionId: string,
  status: UpsertSubscriptionInput['status'],
  currentPeriodEnd: Date | null
): Promise<void> {
  await sql`
    UPDATE community_broadcast_subscriptions
    SET status = ${status},
        current_period_end = ${currentPeriodEnd},
        updated_at = now()
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/lib/broadcasts/billing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/broadcasts/billing.ts __tests__/lib/broadcasts/billing.test.ts
git commit -m "feat(broadcasts): add Stripe billing helpers"
```

---

### Task 10: React Email template for broadcasts

**Context:** Wraps the owner's composed HTML in the shared `BaseLayout`, with footer showing unsubscribe + preferences links. The placeholders `{{unsubscribeUrl}}` and `{{displayName}}` are inserted into the raw HTML and replaced per-recipient by `sender.ts`.

**Files:**
- Create: `lib/resend/templates/marketing/broadcast.tsx`

- [ ] **Step 1: Write the template**

```tsx
// lib/resend/templates/marketing/broadcast.tsx
import React from 'react';
import { Section, Text } from '@react-email/components';
import { BaseLayout } from '../base-layout';

interface BroadcastEmailProps {
  communityName: string;
  subject: string;
  bodyHtml: string;       // sanitized HTML from the editor
  previewText?: string;
}

/**
 * The broadcast email template. The `bodyHtml` placeholder-interpolations
 * (e.g. {{unsubscribeUrl}}, {{displayName}}) are replaced later in sender.ts
 * per recipient. The footer's unsubscribe link uses {{unsubscribeUrl}}.
 */
export const BroadcastEmail: React.FC<BroadcastEmailProps> = ({
  communityName,
  subject,
  bodyHtml,
  previewText,
}) => (
  <BaseLayout
    preview={previewText ?? subject}
    footer={{
      showUnsubscribe: true,
      unsubscribeUrl: '{{unsubscribeUrl}}',
      preferencesUrl: '{{unsubscribeUrl}}',
    }}
  >
    <Section>
      <Text style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
        A message from {communityName}
      </Text>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </Section>
  </BaseLayout>
);
```

- [ ] **Step 2: Commit**

```bash
git add lib/resend/templates/marketing/broadcast.tsx
git commit -m "feat(broadcasts): add react-email template"
```

---

### Task 11: Update `check-preferences.ts` to handle `teacher_broadcast`

**Files:**
- Modify: `lib/resend/check-preferences.ts`

- [ ] **Step 1: Add the category to the union type**

Edit `lib/resend/check-preferences.ts`:

Change line 11–17 from:
```ts
export type EmailCategory =
  | 'transactional'
  | 'marketing'
  | 'course_announcements'
  | 'lesson_reminders'
  | 'community_updates'
  | 'weekly_digest';
```
to:
```ts
export type EmailCategory =
  | 'transactional'
  | 'marketing'
  | 'course_announcements'
  | 'lesson_reminders'
  | 'community_updates'
  | 'weekly_digest'
  | 'teacher_broadcast';
```

- [ ] **Step 2: Add the column to the `EmailPreferences` interface**

Inside the interface (around line 19–28), add:
```ts
  teacher_broadcast: boolean | null;
```

- [ ] **Step 3: Include column in the SELECT**

In the `canSendEmail` function's SELECT (around lines 48–60), add `teacher_broadcast,` after `weekly_digest,`.

- [ ] **Step 4: Add the switch case**

In the switch statement (around lines 75–88), add **before** `default`:
```ts
      case 'teacher_broadcast':
        return preferences.teacher_broadcast ?? true;
```

- [ ] **Step 5: Commit**

```bash
git add lib/resend/check-preferences.ts
git commit -m "feat(broadcasts): add teacher_broadcast email category"
```

---

## Phase 3 — API routes

### Task 12: `GET /api/community/[communitySlug]/broadcasts/quota`

**Files:**
- Create: `app/api/community/[communitySlug]/broadcasts/quota/route.ts`
- Test: `__tests__/api/broadcasts/quota.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/broadcasts/quota.test.ts
import { GET } from '@/app/api/community/[communitySlug]/broadcasts/quota/route';
import { getSession } from '@/lib/auth-session';
import { getQuota } from '@/lib/broadcasts/quota';
import { queryOne } from '@/lib/db';

jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/broadcasts/quota', () => ({ getQuota: jest.fn() }));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn() }));

const mockedSession = getSession as jest.Mock;
const mockedQuota = getQuota as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;

function makeReq() {
  return new Request('http://localhost/api/community/salsa/broadcasts/quota');
}

describe('GET broadcasts/quota', () => {
  beforeEach(() => {
    mockedSession.mockReset();
    mockedQuota.mockReset();
    mockedQueryOne.mockReset();
  });

  it('returns 401 when not logged in', async () => {
    mockedSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(401);
  });

  it('returns 403 when not the community owner', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: 'user-2' } });
    mockedQueryOne.mockResolvedValueOnce({ id: 'c1', created_by: 'user-1' });
    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });

  it('returns quota when owner', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockedQueryOne.mockResolvedValueOnce({ id: 'c1', created_by: 'user-1' });
    mockedQuota.mockResolvedValueOnce({ tier: 'free', used: 3, limit: 10 });

    const res = await GET(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tier: 'free', used: 3, limit: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/api/broadcasts/quota.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// app/api/community/[communitySlug]/broadcasts/quota/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const quota = await getQuota(community.id);
  return NextResponse.json(quota);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/api/broadcasts/quota.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/community/[communitySlug]/broadcasts/quota/route.ts __tests__/api/broadcasts/quota.test.ts
git commit -m "feat(broadcasts): add quota API endpoint"
```

---

### Task 13: `POST /api/community/[communitySlug]/broadcasts` — send a broadcast

**Files:**
- Create: `app/api/community/[communitySlug]/broadcasts/route.ts`
- Test: `__tests__/api/broadcasts/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/broadcasts/route.test.ts
import { POST, GET } from '@/app/api/community/[communitySlug]/broadcasts/route';
import { getSession } from '@/lib/auth-session';
import { queryOne, query, sql } from '@/lib/db';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';

jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
  query: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('@/lib/broadcasts/quota', () => ({ checkCanSend: jest.fn() }));
jest.mock('@/lib/broadcasts/recipients', () => ({ getActiveRecipientsForCommunity: jest.fn() }));
jest.mock('@/lib/broadcasts/sender', () => ({ runBroadcast: jest.fn() }));

const body = {
  subject: 'Hello',
  htmlContent: '<p>Hello</p>',
  editorJson: { type: 'doc', content: [] },
  previewText: 'Hi',
};

function makeReq(b = body) {
  return new Request('http://localhost/api/community/salsa/broadcasts', {
    method: 'POST',
    body: JSON.stringify(b),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST broadcasts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce(null);
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(401);
  });

  it('403 when not owner', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u2', email: 'x@x.com' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });

  it('402 when quota exhausted', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' });
    (checkCanSend as jest.Mock).mockResolvedValueOnce({
      allowed: false, reason: 'quota_exhausted',
      quota: { tier: 'free', used: 10, limit: 10 },
    });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(402);
  });

  it('422 when no recipients', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock)
      .mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' })
      .mockResolvedValueOnce({ id: 'b-new' }); // insert returns id
    (checkCanSend as jest.Mock).mockResolvedValueOnce({ allowed: true });
    (getActiveRecipientsForCommunity as jest.Mock).mockResolvedValueOnce([]);
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(422);
  });

  it('200 happy path — inserts row, calls runBroadcast, updates status', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock)
      .mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' })
      .mockResolvedValueOnce({ id: 'b-new' });
    (checkCanSend as jest.Mock).mockResolvedValueOnce({ allowed: true });
    (getActiveRecipientsForCommunity as jest.Mock).mockResolvedValueOnce([
      { userId: 'u2', email: 'a@a.com', displayName: 'A', unsubscribeToken: 't' },
    ]);
    (runBroadcast as jest.Mock).mockResolvedValueOnce({
      status: 'sent', resendBatchIds: ['b1'], successfulCount: 1, failedCount: 0,
    });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      broadcastId: 'b-new',
      recipientCount: 1,
      status: 'sent',
    }));
    expect(runBroadcast).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/api/broadcasts/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// app/api/community/[communitySlug]/broadcasts/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne, query, sql } from '@/lib/db';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';

interface CommunityRow {
  id: string;
  name: string;
  created_by: string;
}

interface BroadcastListRow {
  id: string;
  subject: string;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export async function POST(
  req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<CommunityRow>`
    SELECT id, name, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { subject, htmlContent, editorJson, previewText } = body as {
    subject: string;
    htmlContent: string;
    editorJson: unknown;
    previewText?: string;
  };
  if (!subject || !htmlContent || !editorJson) {
    return NextResponse.json({ error: 'Missing subject/htmlContent/editorJson' }, { status: 400 });
  }

  const gate = await checkCanSend(community.id);
  if (!gate.allowed) {
    const httpStatus = gate.reason === 'soft_cap_reached' ? 429 : 402;
    return NextResponse.json({ error: gate.reason, quota: gate.quota }, { status: httpStatus });
  }

  // Insert broadcast row (status=sending) — quota query counts this row, preventing races
  const inserted = await queryOne<{ id: string }>`
    INSERT INTO email_broadcasts
      (community_id, sender_user_id, subject, html_content, editor_json, preview_text,
       recipient_count, status)
    VALUES
      (${community.id}, ${session.user.id}, ${subject}, ${htmlContent},
       ${JSON.stringify(editorJson)}::jsonb, ${previewText ?? null}, 0, 'sending')
    RETURNING id
  `;
  if (!inserted) return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  const broadcastId = inserted.id;

  const recipients = await getActiveRecipientsForCommunity(community.id);
  if (recipients.length === 0) {
    await sql`UPDATE email_broadcasts SET status = 'failed', error_message = 'no_recipients' WHERE id = ${broadcastId}`;
    return NextResponse.json({ error: 'no_recipients' }, { status: 422 });
  }

  await sql`UPDATE email_broadcasts SET recipient_count = ${recipients.length} WHERE id = ${broadcastId}`;

  const result = await runBroadcast({
    broadcastId,
    subject,
    htmlContent,
    previewText,
    recipients,
    fromName: community.name,
    replyTo: session.user.email,
  });

  await sql`
    UPDATE email_broadcasts
    SET status = ${result.status},
        resend_batch_ids = ${result.resendBatchIds},
        error_message = ${result.errorMessage ?? null},
        sent_at = ${result.status === 'sent' || result.status === 'partial_failure' ? new Date() : null}
    WHERE id = ${broadcastId}
  `;

  return NextResponse.json({
    broadcastId,
    recipientCount: recipients.length,
    status: result.status,
    successfulCount: result.successfulCount,
    failedCount: result.failedCount,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<CommunityRow>`
    SELECT id, name, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await query<BroadcastListRow>`
    SELECT id, subject, recipient_count, status, sent_at, created_at
    FROM email_broadcasts
    WHERE community_id = ${community.id}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ broadcasts: rows });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/api/broadcasts/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/community/[communitySlug]/broadcasts/route.ts __tests__/api/broadcasts/route.test.ts
git commit -m "feat(broadcasts): add POST/GET broadcasts endpoint"
```

---

### Task 14: `GET /api/community/[communitySlug]/broadcasts/[broadcastId]`

**Files:**
- Create: `app/api/community/[communitySlug]/broadcasts/[broadcastId]/route.ts`

- [ ] **Step 1: Write implementation** (skipping TDD — trivial read endpoint with the same auth pattern as Task 12)

```ts
// app/api/community/[communitySlug]/broadcasts/[broadcastId]/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string; broadcastId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const broadcast = await queryOne`
    SELECT id, subject, html_content, editor_json, preview_text, recipient_count,
           status, error_message, sent_at, created_at
    FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/community/[communitySlug]/broadcasts/[broadcastId]/route.ts
git commit -m "feat(broadcasts): add GET single broadcast endpoint"
```

---

### Task 15: `POST /api/community/[communitySlug]/broadcasts/test` — send test to self

**Files:**
- Create: `app/api/community/[communitySlug]/broadcasts/test/route.ts`

- [ ] **Step 1: Write implementation**

```ts
// app/api/community/[communitySlug]/broadcasts/test/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { runBroadcast } from '@/lib/broadcasts/sender';

export async function POST(
  req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; name: string; created_by: string }>`
    SELECT id, name, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { subject, htmlContent, previewText } = await req.json();
  if (!subject || !htmlContent) {
    return NextResponse.json({ error: 'Missing subject or htmlContent' }, { status: 400 });
  }

  // Send only to the owner, no DB insert (test sends don't count)
  const result = await runBroadcast({
    broadcastId: 'test',
    subject: `[TEST] ${subject}`,
    htmlContent,
    previewText,
    recipients: [{
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.name || 'there',
      unsubscribeToken: null,
    }],
    fromName: community.name,
    replyTo: session.user.email,
  });

  return NextResponse.json({ status: result.status, failedCount: result.failedCount });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/community/[communitySlug]/broadcasts/test/route.ts
git commit -m "feat(broadcasts): add test-send-to-self endpoint"
```

---

### Task 16: `POST/DELETE /api/community/[communitySlug]/broadcasts/subscription`

**Files:**
- Create: `app/api/community/[communitySlug]/broadcasts/subscription/route.ts`
- Test: `__tests__/api/broadcasts/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/broadcasts/subscription.test.ts
import { POST, DELETE } from '@/app/api/community/[communitySlug]/broadcasts/subscription/route';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { createBroadcastCheckoutSession } from '@/lib/broadcasts/billing';

jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), sql: jest.fn() }));
jest.mock('@/lib/broadcasts/billing', () => ({ createBroadcastCheckoutSession: jest.fn() }));
jest.mock('@/lib/stripe', () => ({
  stripe: { subscriptions: { cancel: jest.fn().mockResolvedValue({}) } },
}));

describe('POST subscription', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns checkout URL for owner', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', created_by: 'u1', slug: 'salsa' });
    (createBroadcastCheckoutSession as jest.Mock).mockResolvedValueOnce({
      checkoutUrl: 'https://checkout.url', sessionId: 'cs_1',
    });
    const req = new Request('http://localhost', { method: 'POST' });
    const res = await POST(req, { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ checkoutUrl: 'https://checkout.url' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/api/broadcasts/subscription.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// app/api/community/[communitySlug]/broadcasts/subscription/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne, sql } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { createBroadcastCheckoutSession } from '@/lib/broadcasts/billing';

export async function POST(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; slug: string; created_by: string }>`
    SELECT id, slug, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { checkoutUrl } = await createBroadcastCheckoutSession({
    communityId: community.id,
    communitySlug: community.slug,
    ownerEmail: session.user.email,
    returnUrl: '',
  });
  return NextResponse.json({ checkoutUrl });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sub = await queryOne<{ stripe_subscription_id: string }>`
    SELECT stripe_subscription_id FROM community_broadcast_subscriptions
    WHERE community_id = ${community.id} AND status = 'active'
  `;
  if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 404 });

  // Cancel at period end — member retains unlimited until period ends
  await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
  return NextResponse.json({ ok: true, cancelsAtPeriodEnd: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test __tests__/api/broadcasts/subscription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/community/[communitySlug]/broadcasts/subscription/route.ts __tests__/api/broadcasts/subscription.test.ts
git commit -m "feat(broadcasts): add subscription checkout + cancel endpoint"
```

---

### Task 17: Extend Stripe webhook for broadcast subscription events

**Files:**
- Modify: `app/api/webhooks/stripe/route.ts`

**Context:** The existing webhook handles Connect events and platform events. We add three handlers for the broadcast subscription: `checkout.session.completed` (with `metadata.purpose === 'broadcast_subscription'`), `customer.subscription.updated`, `customer.subscription.deleted`.

- [ ] **Step 1: Read existing switch/event-handling structure**

Read `app/api/webhooks/stripe/route.ts` fully to locate where `event.type` is handled (search for a `switch (event.type)` or chained `if` blocks). Identify where platform events are handled (not Connect — Connect events go through the Connect secret branch).

- [ ] **Step 2: Add handler functions at the bottom of the file (before the closing of `POST`)**

```ts
// ...existing code...

import {
  upsertBroadcastSubscription,
  markBroadcastSubscriptionStatus,
} from '@/lib/broadcasts/billing';

async function handleBroadcastCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.purpose !== 'broadcast_subscription') return;
  const communityId = session.metadata?.communityId;
  if (!communityId) {
    console.error('[Broadcast sub] missing communityId in metadata');
    return;
  }
  const subscriptionId = session.subscription as string;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertBroadcastSubscription({
    communityId,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: sub.id,
    status: sub.status as 'active' | 'past_due' | 'canceled' | 'incomplete',
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
  });
}

async function handleBroadcastSubscriptionUpdated(sub: Stripe.Subscription) {
  if (sub.metadata?.purpose !== 'broadcast_subscription') return;
  await markBroadcastSubscriptionStatus(
    sub.id,
    sub.status as 'active' | 'past_due' | 'canceled' | 'incomplete',
    sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
  );
}
```

- [ ] **Step 3: Wire the handlers into the event dispatch**

Locate the existing `switch (event.type)` or if-chain for platform events. Add cases:

```ts
case 'checkout.session.completed':
  await handleBroadcastCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
  // …existing logic below this, or if existing code handles checkout.session.completed, call
  //   both handlers — broadcast handler no-ops when metadata.purpose isn't broadcast_subscription.
  break;

case 'customer.subscription.updated':
case 'customer.subscription.deleted':
  await handleBroadcastSubscriptionUpdated(event.data.object as Stripe.Subscription);
  break;
```

If the existing webhook already has these cases for other purposes, **add the broadcast handler call alongside existing logic** — it safely no-ops for non-broadcast events thanks to the `metadata.purpose` check.

- [ ] **Step 4: Verify no typescript errors**

Run: `bun run build` (if fast enough) or `bunx tsc --noEmit`
Expected: No new type errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "feat(broadcasts): wire Stripe webhook for subscription lifecycle"
```

---

### Task 18: `POST /api/upload/broadcast-image` — inline image upload

**Files:**
- Create: `app/api/upload/broadcast-image/route.ts`

**Context:** Mirrors the pattern of other uploads in `lib/storage-client.ts`. The endpoint takes multipart/form-data, uploads to B2 under `email-assets/<communityId>/<uuid>.<ext>`, returns the public URL.

- [ ] **Step 1: Read existing storage pattern**

Run: Read `lib/storage.ts` (the `uploadFile` function) and check any existing upload route for request-parsing pattern (e.g., `app/api/upload/`).

- [ ] **Step 2: Write implementation**

```ts
// app/api/upload/broadcast-image/route.ts
import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { uploadFile } from '@/lib/storage';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const communitySlug = formData.get('communitySlug') as string | null;
  if (!file || !communitySlug) {
    return NextResponse.json({ error: 'Missing file or communitySlug' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
  }

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${communitySlug}
  `;
  if (!community || community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ext = file.name.split('.').pop() || 'bin';
  const key = `email-assets/${community.id}/${uuid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const url = await uploadFile(buffer, key, file.type);
  return NextResponse.json({ url });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/broadcast-image/route.ts
git commit -m "feat(broadcasts): add inline image upload endpoint"
```

---

## Phase 4 — UI

### Task 19: `EmailEditor` component — Tiptap with image upload

**Files:**
- Create: `components/emails/EmailEditor.tsx`

**Context:** Reuses the same Tiptap extensions as `components/Editor.tsx` but adds a Link button (via `@tiptap/extension-link` — installed in Step 1), an Image button (uploads via `/api/upload/broadcast-image`), and drops the blockquote (not useful in email). We don't reuse `Editor.tsx` directly because the two toolbars diverge and the email editor needs image upload.

- [ ] **Step 1: Install Tiptap Link and Image extensions**

Run: `bun add @tiptap/extension-link @tiptap/extension-image`
Expected: packages added to `package.json`.

- [ ] **Step 2: Write the component**

```tsx
// components/emails/EmailEditor.tsx
'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Link as LinkIcon, ImageIcon, Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailEditorProps {
  communitySlug: string;
  initialHtml?: string;
  onChange: (html: string, json: unknown) => void;
}

export function EmailEditor({ communitySlug, initialHtml = '', onChange }: EmailEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        codeBlock: false,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-indigo-600 underline' } }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded' } }),
      Placeholder.configure({ placeholder: 'Write your email…' }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-full focus:outline-none min-h-[400px] p-4',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getJSON()),
  });

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('URL', previous);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('communitySlug', communitySlug);
      const res = await fetch('/api/upload/broadcast-image', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploading(false);
    }
  };

  const Btn = ({ onClick, active, children, label }: { onClick: () => void; active?: boolean; children: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/10'
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2 bg-muted/30">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label="Bold"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label="Italic"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} label="Heading 1"><Heading1 className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} label="Heading 2"><Heading2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} label="Bullet list"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} label="Numbered list"><ListOrdered className="h-4 w-4" /></Btn>
        <Btn onClick={setLink} active={editor.isActive('link')} label="Link"><LinkIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => fileInputRef.current?.click()} label="Image"><ImageIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} label="Align left"><AlignLeft className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} label="Align center"><AlignCenter className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} label="Align right"><AlignRight className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} label="Clear formatting"><Eraser className="h-4 w-4" /></Btn>
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])}
      />

      <div className="border-2 border-border/30 rounded-2xl bg-card">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/emails/EmailEditor.tsx package.json bun.lockb
git commit -m "feat(broadcasts): add EmailEditor component"
```

---

### Task 20: `QuotaBadge` component

**Files:**
- Create: `components/emails/QuotaBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/emails/QuotaBadge.tsx
import { cn } from '@/lib/utils';

export interface QuotaBadgeProps {
  tier: 'vip' | 'paid' | 'free';
  used: number;
  limit: number | null;
  className?: string;
}

export function QuotaBadge({ tier, used, limit, className }: QuotaBadgeProps) {
  if (tier === 'vip') {
    return (
      <span className={cn('inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-medium', className)}>
        VIP · Unlimited
      </span>
    );
  }
  if (tier === 'paid') {
    return (
      <span className={cn('inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-3 py-1 text-xs font-medium', className)}>
        Unlimited · {used} sent this month
      </span>
    );
  }
  const atLimit = limit !== null && used >= limit;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
      atLimit ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800',
      className
    )}>
      {used} / {limit} this month
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/emails/QuotaBadge.tsx
git commit -m "feat(broadcasts): add QuotaBadge component"
```

---

### Task 21: `UpgradeDialog` component

**Files:**
- Create: `components/emails/UpgradeDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/emails/UpgradeDialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communitySlug: string;
}

export function UpgradeDialog({ open, onOpenChange, communitySlug }: UpgradeDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/community/${communitySlug}/broadcasts/subscription`, { method: 'POST' });
      if (!res.ok) throw new Error('Checkout failed');
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to unlimited broadcasts</DialogTitle>
          <DialogDescription>
            You've sent 10 emails this month. Upgrade to send unlimited broadcasts for €10/month.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm space-y-2 py-2">
          <li>Unlimited broadcasts to your community</li>
          <li>Cancel anytime from the same page</li>
          <li>Fair-use cap of 200 sends per month</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Redirecting…' : 'Subscribe — €10/month'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/emails/UpgradeDialog.tsx
git commit -m "feat(broadcasts): add UpgradeDialog component"
```

---

### Task 22: `BroadcastHistoryList` component

**Files:**
- Create: `components/emails/BroadcastHistoryList.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/emails/BroadcastHistoryList.tsx
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export interface BroadcastHistoryItem {
  id: string;
  subject: string;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  sent_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<BroadcastHistoryItem['status'], string> = {
  pending: 'Pending',
  sending: 'Sending…',
  sent: 'Sent',
  partial_failure: 'Partial delivery',
  failed: 'Failed',
};

const STATUS_COLOR: Record<BroadcastHistoryItem['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  sending: 'bg-indigo-100 text-indigo-800',
  sent: 'bg-emerald-100 text-emerald-800',
  partial_failure: 'bg-amber-100 text-amber-800',
  failed: 'bg-rose-100 text-rose-800',
};

export function BroadcastHistoryList({
  broadcasts,
  communitySlug,
}: {
  broadcasts: BroadcastHistoryItem[];
  communitySlug: string;
}) {
  if (broadcasts.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No broadcasts yet.</p>;
  }

  return (
    <ul className="divide-y border rounded-lg">
      {broadcasts.map((b) => (
        <li key={b.id}>
          <Link
            href={`/${communitySlug}/admin/emails/${b.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{b.subject}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {b.sent_at
                  ? `Sent ${formatDistanceToNow(new Date(b.sent_at), { addSuffix: true })}`
                  : `Created ${formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}`}
                {' · '}
                {b.recipient_count} recipient{b.recipient_count === 1 ? '' : 's'}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[b.status]}`}>
              {STATUS_LABEL[b.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/emails/BroadcastHistoryList.tsx
git commit -m "feat(broadcasts): add BroadcastHistoryList component"
```

---

### Task 23: `EmailComposer` component — the main compose form

**Files:**
- Create: `components/emails/EmailComposer.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/emails/EmailComposer.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EmailEditor } from './EmailEditor';
import { QuotaBadge } from './QuotaBadge';
import { UpgradeDialog } from './UpgradeDialog';

interface Props {
  communityId: string;
  communitySlug: string;
  communityName: string;
  ownerEmail: string;
  activeMemberCount: number;
  quota: { tier: 'vip' | 'paid' | 'free'; used: number; limit: number | null };
}

export function EmailComposer(props: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [html, setHtml] = useState('');
  const [json, setJson] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const atLimit = props.quota.limit !== null && props.quota.used >= props.quota.limit;

  const validate = () => {
    if (!subject.trim()) { toast.error('Subject is required'); return false; }
    if (!html.trim() || html === '<p></p>') { toast.error('Message is empty'); return false; }
    return true;
  };

  const handleSend = async () => {
    if (atLimit && props.quota.tier === 'free') { setUpgradeOpen(true); return; }
    if (!validate()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/community/${props.communitySlug}/broadcasts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent: html, editorJson: json, previewText }),
      });
      if (res.status === 402) { setUpgradeOpen(true); return; }
      if (!res.ok) throw new Error((await res.json()).error || 'Send failed');
      const data = await res.json();
      if (data.status === 'partial_failure') {
        toast(`Sent to ${data.successfulCount} of ${data.recipientCount}. ${data.failedCount} failed.`, { icon: '⚠️' });
      } else {
        toast.success(`Sent to ${data.recipientCount} members.`);
      }
      router.push(`/${props.communitySlug}/admin/emails/${data.broadcastId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleSendTest = async () => {
    if (!validate()) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/community/${props.communitySlug}/broadcasts/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, htmlContent: html, previewText }),
      });
      if (!res.ok) throw new Error('Test send failed');
      toast.success(`Test sent to ${props.ownerEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g., Spring schedule update" />
        </div>
        <div>
          <Label htmlFor="preview">Preview text (optional)</Label>
          <Input id="preview" value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Short description shown in inbox" />
        </div>
        <EmailEditor communitySlug={props.communitySlug} onChange={(h, j) => { setHtml(h); setJson(j); }} />
      </div>

      <aside className="space-y-4">
        <div className="border rounded-lg p-4 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Recipients</div>
            <div className="text-lg font-semibold">{props.activeMemberCount} active members</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sending from</div>
            <div className="text-sm">{props.communityName} &lt;community@dance-hub.io&gt;</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Reply-to</div>
            <div className="text-sm">{props.ownerEmail}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Quota</div>
            <QuotaBadge {...props.quota} />
          </div>
        </div>

        <div className="space-y-2">
          <Button onClick={handleSend} disabled={sending} className="w-full">
            {sending ? 'Sending…' : atLimit && props.quota.tier === 'free' ? 'Upgrade to send →' : 'Send now'}
          </Button>
          <Button variant="outline" onClick={handleSendTest} disabled={testing} className="w-full">
            {testing ? 'Sending test…' : 'Send test to me'}
          </Button>
        </div>
      </aside>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} communitySlug={props.communitySlug} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/emails/EmailComposer.tsx
git commit -m "feat(broadcasts): add EmailComposer component"
```

---

### Task 24: `AdminNav` component

**Files:**
- Create: `components/admin/AdminNav.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/admin/AdminNav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AdminNav({ communitySlug }: { communitySlug: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/${communitySlug}/admin/emails`, label: 'Emails', icon: Mail },
  ];

  return (
    <nav className="w-full sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r bg-muted/20">
      <ul className="flex sm:flex-col p-2 gap-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
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

- [ ] **Step 2: Commit**

```bash
git add components/admin/AdminNav.tsx
git commit -m "feat(broadcasts): add AdminNav sidebar component"
```

---

### Task 25: `/admin/layout.tsx` — owner gate

**Files:**
- Create: `app/[communitySlug]/admin/layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
// app/[communitySlug]/admin/layout.tsx
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

  const community = await queryOne<{ id: string; created_by: string; name: string; is_broadcast_vip: boolean }>`
    SELECT id, created_by, name, is_broadcast_vip FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) redirect(`/${params.communitySlug}`);
  if (community.created_by !== session.user.id) redirect(`/${params.communitySlug}`);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold mb-6">Admin · {community.name}</h1>
      <div className="flex flex-col sm:flex-row gap-6">
        <AdminNav communitySlug={params.communitySlug} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/[communitySlug]/admin/layout.tsx
git commit -m "feat(broadcasts): add admin layout with owner gate"
```

---

### Task 26: `/admin/page.tsx` — redirect

**Files:**
- Create: `app/[communitySlug]/admin/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/[communitySlug]/admin/page.tsx
import { redirect } from 'next/navigation';

export default function AdminIndex({ params }: { params: { communitySlug: string } }) {
  redirect(`/${params.communitySlug}/admin/emails`);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/[communitySlug]/admin/page.tsx
git commit -m "feat(broadcasts): redirect admin index to emails"
```

---

### Task 27: `/admin/emails/page.tsx` — list page

**Files:**
- Create: `app/[communitySlug]/admin/emails/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/[communitySlug]/admin/emails/page.tsx
import Link from 'next/link';
import { queryOne, query } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';
import { Button } from '@/components/ui/button';
import { QuotaBadge } from '@/components/emails/QuotaBadge';
import { BroadcastHistoryList, BroadcastHistoryItem } from '@/components/emails/BroadcastHistoryList';

export default async function EmailsListPage({ params }: { params: { communitySlug: string } }) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const [quota, broadcasts] = await Promise.all([
    getQuota(community.id),
    query<BroadcastHistoryItem>`
      SELECT id, subject, recipient_count, status, sent_at, created_at::text AS created_at
      FROM email_broadcasts
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
      LIMIT 100
    `,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Emails</h2>
          <QuotaBadge tier={quota.tier} used={quota.used} limit={quota.limit} />
        </div>
        <Button asChild>
          <Link href={`/${params.communitySlug}/admin/emails/new`}>+ New email</Link>
        </Button>
      </div>
      <BroadcastHistoryList broadcasts={broadcasts} communitySlug={params.communitySlug} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/[communitySlug]/admin/emails/page.tsx
git commit -m "feat(broadcasts): add emails list page"
```

---

### Task 28: `/admin/emails/new/page.tsx` — composer page

**Files:**
- Create: `app/[communitySlug]/admin/emails/new/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/[communitySlug]/admin/emails/new/page.tsx
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { EmailComposer } from '@/components/emails/EmailComposer';

export default async function NewEmailPage({ params }: { params: { communitySlug: string } }) {
  const session = await getSession();
  if (!session) return null;

  const community = await queryOne<{ id: string; name: string }>`
    SELECT id, name FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const [quota, recipients] = await Promise.all([
    getQuota(community.id),
    getActiveRecipientsForCommunity(community.id),
  ]);

  return (
    <EmailComposer
      communityId={community.id}
      communitySlug={params.communitySlug}
      communityName={community.name}
      ownerEmail={session.user.email}
      activeMemberCount={recipients.length}
      quota={quota}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/[communitySlug]/admin/emails/new/page.tsx
git commit -m "feat(broadcasts): add new email page"
```

---

### Task 29: `/admin/emails/[broadcastId]/page.tsx` — detail page

**Files:**
- Create: `app/[communitySlug]/admin/emails/[broadcastId]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/[communitySlug]/admin/emails/[broadcastId]/page.tsx
import Link from 'next/link';
import { queryOne } from '@/lib/db';
import { Button } from '@/components/ui/button';

interface BroadcastRow {
  id: string;
  subject: string;
  html_content: string;
  preview_text: string | null;
  recipient_count: number;
  status: 'pending' | 'sending' | 'sent' | 'partial_failure' | 'failed';
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export default async function BroadcastDetailPage({
  params,
}: {
  params: { communitySlug: string; broadcastId: string };
}) {
  const community = await queryOne<{ id: string }>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const broadcast = await queryOne<BroadcastRow>`
    SELECT * FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) return <p>Broadcast not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{broadcast.subject}</h2>
          <p className="text-sm text-muted-foreground">
            {broadcast.sent_at ? `Sent ${new Date(broadcast.sent_at).toLocaleString()}` : 'Not sent'}
            {' · '}
            {broadcast.recipient_count} recipients · {broadcast.status}
          </p>
          {broadcast.error_message && (
            <p className="text-sm text-rose-600 mt-2">Error: {broadcast.error_message}</p>
          )}
        </div>
        <Button variant="outline" asChild>
          <Link href={`/${params.communitySlug}/admin/emails`}>Back</Link>
        </Button>
      </div>

      <div className="border rounded-lg p-6 bg-white">
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: broadcast.html_content }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/[communitySlug]/admin/emails/[broadcastId]/page.tsx
git commit -m "feat(broadcasts): add broadcast detail page"
```

---

### Task 30: Add "Admin" tab to community navbar (owner-only)

**Files:**
- Modify: the community navbar component (find exact path in Step 1)

- [ ] **Step 1: Find the community navbar**

Run: `grep -Rl "Classroom\|Calendar\|Private lessons" components/ app/` (via Grep tool)
Expected: Likely `components/CommunityNavbar.tsx` or similar. Read the file to understand existing tab structure.

- [ ] **Step 2: Add the Admin tab conditionally**

The navbar takes a community and current user. Where the existing tabs (Classroom, Calendar, Private lessons) are rendered, add at the end:

```tsx
{community.created_by === currentUserId && (
  <NavItem href={`/${community.slug}/admin`} label="Admin" icon={ShieldCheck} />
)}
```

Use whatever `NavItem` component or tab-rendering pattern the existing navbar uses. Import `ShieldCheck` from `lucide-react` (or similar gear/admin icon).

- [ ] **Step 3: Manual test**

Run dev server (in a worktree, per project convention): start dev server, navigate to a community you own, verify the "Admin" tab appears. Log out or switch to a non-owner account and verify it's hidden.

- [ ] **Step 4: Commit**

```bash
git add <navbar file path>
git commit -m "feat(broadcasts): add owner-only Admin tab to community navbar"
```

---

## Phase 5 — E2E, component smoke tests, rollout

### Task 31: Component smoke test — `QuotaBadge`

**Files:**
- Create: `__tests__/components/emails/QuotaBadge.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// __tests__/components/emails/QuotaBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { QuotaBadge } from '@/components/emails/QuotaBadge';

describe('QuotaBadge', () => {
  it('shows VIP pill when tier is vip', () => {
    render(<QuotaBadge tier="vip" used={5} limit={null} />);
    expect(screen.getByText(/VIP/)).toBeInTheDocument();
  });

  it('shows used/limit when tier is free', () => {
    render(<QuotaBadge tier="free" used={3} limit={10} />);
    expect(screen.getByText(/3 \/ 10/)).toBeInTheDocument();
  });

  it('uses amber style when free tier is at limit', () => {
    const { container } = render(<QuotaBadge tier="free" used={10} limit={10} />);
    expect(container.firstChild).toHaveClass('bg-amber-100');
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun test __tests__/components/emails/QuotaBadge.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/components/emails/QuotaBadge.test.tsx
git commit -m "test(broadcasts): QuotaBadge smoke test"
```

---

### Task 32: Playwright E2E smoke — full send flow

**Files:**
- Create: `e2e/community-broadcasts.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// e2e/community-broadcasts.spec.ts
import { test, expect } from '@playwright/test';

// NOTE: Assumes a seeded owner account and a community slug 'e2e-community' in the test environment.
// Uses Resend's `delivered@resend.dev` test address via a one-off recipient seed before the run.

test('owner can compose and send a test broadcast', async ({ page }) => {
  // Sign in as owner (reuse existing auth helper or login flow)
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\//);

  await page.goto('/e2e-community/admin/emails');
  await expect(page.getByRole('heading', { name: 'Emails' })).toBeVisible();

  await page.getByRole('link', { name: /new email/i }).click();
  await page.getByLabel('Subject').fill('E2E smoke subject');
  await page.locator('[contenteditable="true"]').click();
  await page.keyboard.type('Hello from the E2E test.');

  // Send test to self (no DB write, goes to owner email)
  await page.getByRole('button', { name: /send test to me/i }).click();
  await expect(page.getByText(/test sent to/i)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run the test**

Run: `bun run test:e2e community-broadcasts.spec.ts`
Expected: PASS (requires the seeded owner + community in the E2E environment; if not yet seeded, add to your e2e fixtures per existing pattern in `e2e/`).

- [ ] **Step 3: Commit**

```bash
git add e2e/community-broadcasts.spec.ts
git commit -m "test(broadcasts): e2e smoke test for compose + test-send"
```

---

### Task 33: Kill-switch env flag for phased rollout

**Files:**
- Modify: `components/admin/AdminNav.tsx`
- Modify: the community navbar (from Task 30)
- Modify: `app/[communitySlug]/admin/layout.tsx`

- [ ] **Step 1: Add env check**

Create the env var `NEXT_PUBLIC_BROADCASTS_ENABLED` (default `false`). When `false` AND community is not VIP, hide the Admin tab and redirect `/admin/*` to the community root.

Edit `app/[communitySlug]/admin/layout.tsx`:

Replace the post-session/community checks block with:
```ts
const featureEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true';
if (!featureEnabled && !community.is_broadcast_vip) {
  redirect(`/${params.communitySlug}`);
}
```

Edit the community navbar (from Task 30): wrap the Admin tab render with the same check:
```tsx
{community.created_by === currentUserId
  && (process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true' || community.is_broadcast_vip)
  && <NavItem … />}
```

- [ ] **Step 2: Document env var**

Add to `.env.example` (or the closest equivalent — check if one exists, if not skip):
```
# Community Broadcasts feature flag. Set "true" to enable for all communities.
NEXT_PUBLIC_BROADCASTS_ENABLED=false
# Stripe Price ID for €10/month unlimited broadcasts (create in Stripe Dashboard)
STRIPE_BROADCAST_PRICE_ID=price_...
```

- [ ] **Step 3: Commit**

```bash
git add app/[communitySlug]/admin/layout.tsx components/admin/AdminNav.tsx <navbar file> .env.example
git commit -m "feat(broadcasts): add kill-switch env flag for phased rollout"
```

---

### Task 34: Manual QA checklist + rollout notes

**Files:**
- Create: (none — this task runs the manual QA checklist documented in the spec's "Manual QA before launch" section and reports results to the user)

- [ ] **Step 1: Configure Stripe**

- Create a Stripe product in the Dashboard called "Community Broadcasts — Unlimited" with a recurring €10/month price.
- Copy the price ID into `STRIPE_BROADCAST_PRICE_ID` env var on preprod AND production.
- Ensure the existing Stripe webhook endpoint URL is subscribed to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

- [ ] **Step 2: Mark one community as VIP for soft launch**

Run on preprod:
```sql
UPDATE communities SET is_broadcast_vip = true WHERE slug = '<friendly-community-slug>';
```

- [ ] **Step 3: Run the manual QA checklist from the spec**

Walk through every bullet in the "Manual QA before launch" section of `docs/superpowers/specs/2026-04-14-community-broadcasts-design.md`:
- Plain text, headings, inline image, links, bold/italic/lists — in Gmail web + iOS, Apple Mail, Outlook web
- Unsubscribe link → member correctly opted out of `teacher_broadcast`
- Send to `bounced@resend.dev` → broadcast marked `partial_failure`
- Stripe Checkout flow end-to-end in test mode
- VIP toggle → badge + bypass behavior

- [ ] **Step 4: Enable for production**

Only after all QA passes:
- Set `NEXT_PUBLIC_BROADCASTS_ENABLED=true` in prod env.
- Upgrade Resend to Pro tier.
- Deploy.

- [ ] **Step 5: Commit rollout notes**

Nothing to commit from this task directly — but if you captured anything worth documenting (e.g., a bug found during QA + fix), commit that as a separate change.

---

## Self-review

- **Spec coverage** — all spec requirements addressed:
  - Quota (free/paid/VIP) → Task 7
  - €10/mo subscription → Tasks 9, 16, 17
  - Broadcast send with batching + retries → Task 8
  - Recipient filtering with opt-out respect → Tasks 6, 11
  - Email template → Task 10
  - Inline B2 image upload → Task 18
  - Admin UI + navbar → Tasks 24–30
  - VIP admin toggle → DB column in Task 3; used throughout
  - Phased rollout kill switch → Task 33
  - Manual QA checklist → Task 34
- **Placeholder scan** — no TBDs, TODOs, or "similar to Task N" shortcuts. Task 34 intentionally runs the existing manual QA checklist in the spec rather than duplicating it here.
- **Type consistency** — `BroadcastRecipient`, `Quota`, `CanSendResult`, `RunBroadcastInput`/`RunBroadcastResult` are each defined once and reused consistently across consuming tasks.
- **Known ambiguity** — Task 17 references "the existing `switch (event.type)` or if-chain" because the webhook file is 100+ lines and evolves. The task tells the engineer to read the file first and add alongside existing logic. Acceptable, since the handler functions themselves are fully specified and safe (they no-op on irrelevant metadata).

---

Plan complete.
