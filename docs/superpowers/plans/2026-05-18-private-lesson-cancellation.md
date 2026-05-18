# Private Lesson Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students and teachers cancel a private lesson booking from existing UI surfaces, with refund driven by a per-lesson policy (cutoff hours + late refund behavior), and notify the other party by email.

**Architecture:** One new server endpoint `POST /api/bookings/[bookingId]/cancel` enforces the policy decision matrix, calls Stripe to refund on the connected account (including the 5% platform application fee), updates `lesson_bookings` and frees the linked availability slot by nulling `availability_slot_id`, then dispatches a Resend email to the other party. Cancel never returns 403 for "too late" — the policy only changes the refund amount. Two new policy columns on `private_lessons` plus two audit columns on `lesson_bookings`. UI on three surfaces: lesson-create modal (set policy), student dashboard (cancel button), teacher booking management modal (cancel button).

**Tech Stack:** Next.js 16 App Router route handlers, Stripe Connect direct charges via `stripe.refunds.create({ refund_application_fee: true })` on connected account, Neon Postgres via tagged-template `sql\`\`` in `lib/db.ts`, React Email templates in `lib/resend/templates/booking/`, Jest + RTL for unit tests, no shadcn-equivalent in this repo so existing radix/AlertDialog patterns from `app/[communitySlug]/FeedClient.tsx` are reused.

**Spec:** `docs/superpowers/specs/2026-05-18-private-lesson-cancellation-design.md`

**Worktree:** `/home/debian/apps/dance-hub-preprod` on branch `fix/preprod-batch-may18`. All commands run from there.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/2026-05-18_private_lesson_cancellation.sql`
- Apply via Neon MCP `mcp__neon__run_sql` against project `wild-art-53938668` (main + preprod branches)

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/2026-05-18_private_lesson_cancellation.sql`:

```sql
-- Per-lesson cancellation policy
ALTER TABLE private_lessons
  ADD COLUMN cancellation_cutoff_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN late_refund_policy TEXT NOT NULL DEFAULT 'no_refund'
    CHECK (late_refund_policy IN ('refund', 'no_refund'));

-- Cancellation audit columns on bookings
ALTER TABLE lesson_bookings
  ADD COLUMN canceled_at TIMESTAMPTZ NULL,
  ADD COLUMN canceled_by TEXT NULL CHECK (canceled_by IN ('student', 'teacher'));

-- Allow 'refunded' as a payment_status value
ALTER TABLE lesson_bookings
  DROP CONSTRAINT lesson_bookings_payment_status_check;

ALTER TABLE lesson_bookings
  ADD CONSTRAINT lesson_bookings_payment_status_check
    CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));
```

- [ ] **Step 2: Apply to preprod Neon branch**

Use the Neon MCP. The preprod branch ID is recorded in memory `project_neon_preprod_branch.md` — read it; if unsure, list branches via `mcp__neon__describe_project` for `wild-art-53938668` and pick the one named "preprod".

Run via `mcp__neon__run_sql` with `projectId: "wild-art-53938668"` and `branchId: <preprod-branch-id>`, executing each `ALTER TABLE` statement.

- [ ] **Step 3: Verify schema on preprod**

Run via `mcp__neon__describe_table_schema` for `private_lessons` and `lesson_bookings` on the preprod branch. Confirm:
- `private_lessons.cancellation_cutoff_hours` INT NOT NULL DEFAULT 24
- `private_lessons.late_refund_policy` TEXT NOT NULL with CHECK
- `lesson_bookings.canceled_at`, `lesson_bookings.canceled_by` exist
- `lesson_bookings_payment_status_check` includes `'refunded'`

- [ ] **Step 4: Commit**

```bash
git add -f supabase/migrations/2026-05-18_private_lesson_cancellation.sql
git commit -m "feat(private-lesson-cancellation): schema for policy + audit cols"
```

(Note: prod migration is applied separately during deploy — out of scope for this task.)

---

## Task 2: Type updates

**Files:**
- Modify: `types/private-lessons.ts`

- [ ] **Step 1: Add new fields to PrivateLesson interface**

Edit `types/private-lessons.ts` lines ~1-17 to add the two policy fields:

```typescript
export interface PrivateLesson {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  regular_price: number;
  member_price?: number;
  member_discount_percentage: number;
  is_active: boolean;
  max_bookings_per_month?: number;
  requirements?: string;
  location_type: 'online' | 'in_person' | 'both';
  cancellation_cutoff_hours: number;
  late_refund_policy: 'refund' | 'no_refund';
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Extend LessonBooking with audit + refunded status**

In the same file, edit `LessonBooking`:
- Extend `payment_status` union to include `'refunded'`
- Add `canceled_at?: string` and `canceled_by?: 'student' | 'teacher'`

```typescript
  payment_status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  lesson_status: 'booked' | 'scheduled' | 'completed' | 'canceled';
  // ... existing fields ...
  canceled_at?: string;
  canceled_by?: 'student' | 'teacher';
```

- [ ] **Step 3: Extend CreatePrivateLessonData if it exists**

Open `types/private-lessons.ts` line 77 (`CreatePrivateLessonData`). Add the same two policy fields with `?` (optional on create since UI defaults them):

```typescript
  cancellation_cutoff_hours?: number;
  late_refund_policy?: 'refund' | 'no_refund';
```

- [ ] **Step 4: Typecheck**

Run: `bun run lint`
Expected: no new errors related to private-lessons types. If existing callers break because they construct `PrivateLesson` literals without the new fields, fix those literals to include the new fields with defaults (24, 'no_refund').

- [ ] **Step 5: Commit**

```bash
git add types/private-lessons.ts
git commit -m "feat(private-lesson-cancellation): types for policy + audit fields"
```

---

## Task 3: Cancel API route (TDD)

**Files:**
- Create: `app/api/bookings/[bookingId]/cancel/route.ts`
- Create: `__tests__/api/bookings/cancel.test.ts`

This task uses a strict TDD loop: write all scenario tests first, see them fail, then implement.

- [ ] **Step 1: Write the test scaffold**

Create `__tests__/api/bookings/cancel.test.ts` with mocks. Pattern mirrors `__tests__/api/broadcasts/route.test.ts`:

```typescript
import { POST } from '@/app/api/bookings/[bookingId]/cancel/route';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { stripe } from '@/lib/stripe';
import { getEmailService } from '@/lib/resend/email-service';

jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/stripe', () => ({
  stripe: { refunds: { create: jest.fn() } },
}));
jest.mock('@/lib/resend/email-service', () => ({
  getEmailService: jest.fn(() => ({
    sendNotificationEmail: jest.fn().mockResolvedValue({ id: 'em_1' }),
  })),
}));

const mockedQueryOne = queryOne as jest.Mock;
const mockedSql = sql as unknown as jest.Mock;
const mockedSession = getSession as jest.Mock;
const mockedRefund = stripe.refunds.create as jest.Mock;

const STUDENT_ID = 'usr_student';
const TEACHER_ID = 'usr_teacher';
const BOOKING_ID = 'bk_1';

const futureScheduledAt = (hoursAhead: number) =>
  new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();

const bookingRow = (overrides: Partial<any> = {}) => ({
  id: BOOKING_ID,
  student_id: STUDENT_ID,
  scheduled_at: futureScheduledAt(48),
  lesson_status: 'booked',
  payment_status: 'succeeded',
  price_paid: 50,
  stripe_payment_intent_id: 'pi_123',
  availability_slot_id: 'slot_1',
  community_created_by: TEACHER_ID,
  community_stripe_account_id: 'acct_x',
  community_name: 'Salsa Studio',
  lesson_title: 'Bachata Basics',
  cancellation_cutoff_hours: 24,
  late_refund_policy: 'no_refund',
  student_email: 'stu@x.com',
  student_name: 'Stu',
  duration_minutes: 60,
  ...overrides,
});

const makeReq = () =>
  new Request(`http://localhost/api/bookings/${BOOKING_ID}/cancel`, {
    method: 'POST',
  });

const callRoute = () =>
  POST(makeReq(), { params: Promise.resolve({ bookingId: BOOKING_ID }) } as any);

beforeEach(() => {
  jest.clearAllMocks();
  mockedSql.mockResolvedValue(undefined);
});
```

- [ ] **Step 2: Write the 401/403/404/409 guard tests**

Append to the test file:

```typescript
describe('POST /api/bookings/[bookingId]/cancel — guards', () => {
  test('401 when no session', async () => {
    mockedSession.mockResolvedValueOnce(null);
    const res = await callRoute();
    expect(res.status).toBe(401);
  });

  test('404 when booking missing', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(null);
    const res = await callRoute();
    expect(res.status).toBe(404);
  });

  test('403 when caller is neither student nor community owner', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: 'usr_other' } });
    mockedQueryOne.mockResolvedValueOnce(bookingRow());
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  test('409 when lesson_status is not cancelable', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(bookingRow({ lesson_status: 'canceled' }));
    const res = await callRoute();
    expect(res.status).toBe(409);
  });

  test('409 when scheduled_at is in the past (beyond 5-min grace)', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({ scheduled_at: futureScheduledAt(-1) }) // 1h ago
    );
    const res = await callRoute();
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Write the refund-decision tests**

Append:

```typescript
describe('POST /api/bookings/[bookingId]/cancel — refund decisions', () => {
  test('student before cutoff: full refund with application_fee returned', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({ scheduled_at: futureScheduledAt(48), cancellation_cutoff_hours: 24 })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_1', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_123',
        refund_application_fee: true,
      }),
      { stripeAccount: 'acct_x' }
    );
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });

  test('student after cutoff with no_refund policy: cancel without Stripe call', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(2),
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'no_refund',
      })
    );

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(0);
  });

  test('student after cutoff with refund policy: full refund', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(2),
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'refund',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_2', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });

  test('teacher anytime: always full refund', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: TEACHER_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(1), // way past cutoff
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'no_refund',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_3', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });

  test('no-payment edge (no stripe_payment_intent_id): skip Stripe, still cancel', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({ stripe_payment_intent_id: null, price_paid: 0 })
    );

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(0);
  });

  test('Stripe refund failure: 502 and DB untouched', async () => {
    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(bookingRow());
    mockedRefund.mockRejectedValueOnce(new Error('charge_too_old'));

    const res = await callRoute();
    expect(res.status).toBe(502);
    expect(mockedSql).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests, see them fail**

Run: `bun test __tests__/api/bookings/cancel.test.ts`
Expected: ALL tests fail with module-not-found error for `@/app/api/bookings/[bookingId]/cancel/route`.

- [ ] **Step 5: Implement the route**

Create `app/api/bookings/[bookingId]/cancel/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { stripe } from "@/lib/stripe";

const GRACE_MINUTES = 5;
const CANCELABLE_STATUSES = new Set(["booked", "scheduled"]);

interface BookingForCancel {
  id: string;
  student_id: string;
  scheduled_at: string | null;
  lesson_status: string;
  payment_status: string;
  price_paid: number;
  stripe_payment_intent_id: string | null;
  availability_slot_id: string | null;
  community_created_by: string;
  community_stripe_account_id: string | null;
  community_name: string;
  lesson_title: string;
  cancellation_cutoff_hours: number;
  late_refund_policy: "refund" | "no_refund";
  student_email: string;
  student_name: string | null;
  duration_minutes: number;
}

export async function POST(
  _request: Request,
  props: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await props.params;

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const booking = await queryOne<BookingForCancel>`
    SELECT
      lb.id,
      lb.student_id,
      lb.scheduled_at,
      lb.lesson_status,
      lb.payment_status,
      lb.price_paid,
      lb.stripe_payment_intent_id,
      lb.availability_slot_id,
      lb.student_email,
      lb.student_name,
      pl.title         AS lesson_title,
      pl.duration_minutes,
      pl.cancellation_cutoff_hours,
      pl.late_refund_policy,
      c.created_by        AS community_created_by,
      c.stripe_account_id AS community_stripe_account_id,
      c.name              AS community_name
    FROM lesson_bookings lb
    INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    INNER JOIN communities c       ON c.id = pl.community_id
    WHERE lb.id = ${bookingId}
  `;

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const isStudent = booking.student_id === userId;
  const isTeacher = booking.community_created_by === userId;
  if (!isStudent && !isTeacher) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role: "student" | "teacher" = isTeacher ? "teacher" : "student";

  if (!CANCELABLE_STATUSES.has(booking.lesson_status)) {
    return NextResponse.json(
      { error: "Booking not cancelable" },
      { status: 409 }
    );
  }

  const scheduledMs = booking.scheduled_at
    ? new Date(booking.scheduled_at).getTime()
    : null;
  const nowMs = Date.now();
  if (scheduledMs !== null && scheduledMs + GRACE_MINUTES * 60_000 < nowMs) {
    return NextResponse.json(
      { error: "Lesson already started or ended" },
      { status: 409 }
    );
  }

  // Decide refund amount
  const priceCents = Math.round(Number(booking.price_paid) * 100);
  let refundCents = 0;
  if (role === "teacher") {
    refundCents = priceCents;
  } else if (scheduledMs !== null) {
    const cutoffMs = scheduledMs - booking.cancellation_cutoff_hours * 3600_000;
    const beforeCutoff = nowMs <= cutoffMs;
    if (beforeCutoff || booking.late_refund_policy === "refund") {
      refundCents = priceCents;
    }
  }

  // Stripe refund (if applicable)
  let refundId: string | null = null;
  if (
    refundCents > 0 &&
    booking.stripe_payment_intent_id &&
    booking.community_stripe_account_id
  ) {
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: booking.stripe_payment_intent_id,
          refund_application_fee: true,
        },
        { stripeAccount: booking.community_stripe_account_id }
      );
      refundId = refund.id;
    } catch (err) {
      console.error("[cancel] Stripe refund failed", { bookingId, err });
      return NextResponse.json(
        { error: "refund_failed", message: "Could not issue refund. Try again or contact support." },
        { status: 502 }
      );
    }
  } else {
    refundCents = 0;
  }

  // DB update
  const newPaymentStatus = refundCents > 0 ? "refunded" : booking.payment_status;
  await sql`
    UPDATE lesson_bookings
    SET
      lesson_status        = 'canceled',
      payment_status       = ${newPaymentStatus},
      canceled_at          = NOW(),
      canceled_by          = ${role},
      availability_slot_id = NULL,
      updated_at           = NOW()
    WHERE id = ${bookingId}
  `;

  return NextResponse.json({
    status: "canceled",
    refunded_amount_cents: refundCents,
    refund_id: refundId,
  });
}
```

- [ ] **Step 6: Run tests, watch them pass**

Run: `bun test __tests__/api/bookings/cancel.test.ts`
Expected: ALL tests pass.

If any fail, fix the route to match the test expectations (tests are the contract).

- [ ] **Step 7: Commit**

```bash
git add app/api/bookings/[bookingId]/cancel/route.ts __tests__/api/bookings/cancel.test.ts
git commit -m "feat(private-lesson-cancellation): POST cancel route + decision matrix tests"
```

---

## Task 4: Cancel email templates

**Files:**
- Create: `lib/resend/templates/booking/cancellation-by-student.tsx`
- Create: `lib/resend/templates/booking/cancellation-by-teacher.tsx`

- [ ] **Step 1: Create "student canceled" template (recipient: teacher)**

Create `lib/resend/templates/booking/cancellation-by-student.tsx`:

```tsx
import React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface Props {
  teacherName: string;
  studentName: string;
  lessonTitle: string;
  lessonDate: string;
  refundedAmount: number;
  currency: string;
  wasRefunded: boolean;
}

export const CancellationByStudentEmail: React.FC<Props> = ({
  teacherName,
  studentName,
  lessonTitle,
  lessonDate,
  refundedAmount,
  currency,
  wasRefunded,
}) => {
  const preview = `${studentName} canceled their booking for ${lessonTitle}`;
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>Booking canceled</Heading>
      <Text style={EMAIL_STYLES.paragraph}>Hi {teacherName},</Text>
      <Text style={EMAIL_STYLES.paragraph}>
        {studentName} canceled their booking for <strong>{lessonTitle}</strong> on {lessonDate}.
      </Text>
      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '16px 0',
      }}>
        <Text style={EMAIL_STYLES.paragraph}>
          {wasRefunded
            ? `They were refunded ${currency.toUpperCase()} ${refundedAmount.toFixed(2)}.`
            : 'Per your cancellation policy, no refund was issued.'}
        </Text>
        <Text style={EMAIL_STYLES.paragraph}>
          The slot is now available again.
        </Text>
      </Section>
    </BaseLayout>
  );
};

export default CancellationByStudentEmail;
```

- [ ] **Step 2: Create "teacher canceled" template (recipient: student)**

Create `lib/resend/templates/booking/cancellation-by-teacher.tsx`:

```tsx
import React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import { BaseLayout } from '../base-layout';
import { EMAIL_STYLES, EMAIL_COLORS } from '../index';

interface Props {
  studentName: string;
  communityName: string;
  lessonTitle: string;
  lessonDate: string;
  refundedAmount: number;
  currency: string;
}

export const CancellationByTeacherEmail: React.FC<Props> = ({
  studentName,
  communityName,
  lessonTitle,
  lessonDate,
  refundedAmount,
  currency,
}) => {
  const preview = `Your lesson ${lessonTitle} was canceled`;
  return (
    <BaseLayout preview={preview}>
      <Heading style={EMAIL_STYLES.heading}>Your lesson was canceled</Heading>
      <Text style={EMAIL_STYLES.paragraph}>Hi {studentName},</Text>
      <Text style={EMAIL_STYLES.paragraph}>
        {communityName} canceled your <strong>{lessonTitle}</strong> scheduled for {lessonDate}.
      </Text>
      <Section style={{
        backgroundColor: EMAIL_COLORS.background,
        borderRadius: '8px',
        padding: '20px',
        margin: '16px 0',
      }}>
        <Text style={EMAIL_STYLES.paragraph}>
          <strong>{currency.toUpperCase()} {refundedAmount.toFixed(2)}</strong> has been refunded to your card. Refunds typically take 5–10 days to appear.
        </Text>
      </Section>
      <Text style={EMAIL_STYLES.paragraph}>
        Feel free to book another lesson with the teacher whenever you're ready.
      </Text>
    </BaseLayout>
  );
};

export default CancellationByTeacherEmail;
```

- [ ] **Step 3: Commit**

```bash
git add lib/resend/templates/booking/cancellation-by-student.tsx lib/resend/templates/booking/cancellation-by-teacher.tsx
git commit -m "feat(private-lesson-cancellation): cancellation email templates"
```

---

## Task 5: Wire emails into cancel route

**Files:**
- Modify: `app/api/bookings/[bookingId]/cancel/route.ts`
- Modify: `__tests__/api/bookings/cancel.test.ts`

- [ ] **Step 1: Add an email assertion to one existing test**

Edit `__tests__/api/bookings/cancel.test.ts`. In the existing test `'teacher anytime: always full refund'`, capture the email mock and assert the student is emailed:

```typescript
  test('teacher anytime: always full refund', async () => {
    const mockSend = jest.fn().mockResolvedValue({ id: 'em_1' });
    (getEmailService as jest.Mock).mockReturnValueOnce({
      sendNotificationEmail: mockSend,
    });

    mockedSession.mockResolvedValueOnce({ user: { id: TEACHER_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(1),
        cancellation_cutoff_hours: 24,
        late_refund_policy: 'no_refund',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_3', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      'stu@x.com',
      expect.stringMatching(/canceled/i),
      expect.anything()
    );
  });
```

And in `'student before cutoff: full refund...'`, add the symmetric assertion that the teacher gets emailed. The teacher's email isn't on the booking row; the route must look it up. Add the teacher's email to the SELECT in the route (next step) and the bookingRow fixture in this test (`teacher_email: 'teacher@x.com'`):

```typescript
  test('student before cutoff: full refund with application_fee returned', async () => {
    const mockSend = jest.fn().mockResolvedValue({ id: 'em_1' });
    (getEmailService as jest.Mock).mockReturnValueOnce({
      sendNotificationEmail: mockSend,
    });

    mockedSession.mockResolvedValueOnce({ user: { id: STUDENT_ID } });
    mockedQueryOne.mockResolvedValueOnce(
      bookingRow({
        scheduled_at: futureScheduledAt(48),
        cancellation_cutoff_hours: 24,
        teacher_email: 'teacher@x.com',
      })
    );
    mockedRefund.mockResolvedValueOnce({ id: 're_1', amount: 5000 });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(mockedRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: 'pi_123',
        refund_application_fee: true,
      }),
      { stripeAccount: 'acct_x' }
    );
    expect(mockSend).toHaveBeenCalledWith(
      'teacher@x.com',
      expect.stringMatching(/canceled/i),
      expect.anything()
    );
    const body = await res.json();
    expect(body.refunded_amount_cents).toBe(5000);
  });
```

Update the `bookingRow` factory to include `teacher_email: 'teacher@x.com'` by default.

- [ ] **Step 2: Run tests, see new assertions fail**

Run: `bun test __tests__/api/bookings/cancel.test.ts`
Expected: the two updated tests fail (`expect(mockSend).toHaveBeenCalledWith...`).

- [ ] **Step 3: Update route to fetch teacher email and send the right email**

Edit `app/api/bookings/[bookingId]/cancel/route.ts`:

(a) Extend `BookingForCancel` interface:
```typescript
  teacher_email: string;
  teacher_name: string | null;
```

(b) Extend the SQL SELECT — replace the joins block with:
```typescript
    FROM lesson_bookings lb
    INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    INNER JOIN communities c       ON c.id = pl.community_id
    INNER JOIN "user" tu           ON tu.id = c.created_by
    LEFT JOIN profiles tp          ON tp.auth_user_id = tu.id
```

(c) Add to the SELECT list:
```sql
      tu.email          AS teacher_email,
      tp.full_name      AS teacher_name,
```

(d) After the `await sql\`UPDATE ...\`` block, add the email dispatch (fire-and-forget — log failures, don't fail the request):

```typescript
  try {
    const emailService = getEmailService();
    const lessonDate = booking.scheduled_at
      ? new Date(booking.scheduled_at).toLocaleString('en-GB', {
          dateStyle: 'long',
          timeStyle: 'short',
        })
      : 'the scheduled date';
    const refundedAmount = refundCents / 100;
    if (role === 'student') {
      const { CancellationByStudentEmail } = await import(
        '@/lib/resend/templates/booking/cancellation-by-student'
      );
      await emailService.sendNotificationEmail(
        booking.teacher_email,
        `Booking canceled — ${booking.lesson_title}`,
        CancellationByStudentEmail({
          teacherName: booking.teacher_name ?? 'there',
          studentName: booking.student_name ?? booking.student_email,
          lessonTitle: booking.lesson_title,
          lessonDate,
          refundedAmount,
          currency: 'eur',
          wasRefunded: refundCents > 0,
        })
      );
    } else {
      const { CancellationByTeacherEmail } = await import(
        '@/lib/resend/templates/booking/cancellation-by-teacher'
      );
      await emailService.sendNotificationEmail(
        booking.student_email,
        `Your lesson was canceled`,
        CancellationByTeacherEmail({
          studentName: booking.student_name ?? 'there',
          communityName: booking.community_name,
          lessonTitle: booking.lesson_title,
          lessonDate,
          refundedAmount,
          currency: 'eur',
        })
      );
    }
  } catch (err) {
    console.error('[cancel] email dispatch failed', { bookingId, err });
  }
```

Add the import at the top:
```typescript
import { getEmailService } from "@/lib/resend/email-service";
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `bun test __tests__/api/bookings/cancel.test.ts`
Expected: ALL tests pass including the email assertions.

- [ ] **Step 5: Commit**

```bash
git add app/api/bookings/[bookingId]/cancel/route.ts __tests__/api/bookings/cancel.test.ts
git commit -m "feat(private-lesson-cancellation): notify other party on cancel"
```

---

## Task 6: Hardening — availability LEFT JOIN filter

**Files:**
- Modify: `app/api/community/[communitySlug]/teacher-availability/route.ts`

- [ ] **Step 1: Locate the four LEFT JOIN blocks**

Open `app/api/community/[communitySlug]/teacher-availability/route.ts`. Lines ~70–124 contain four near-identical `SELECT` queries each with:

```sql
LEFT JOIN lesson_bookings lb ON lb.availability_slot_id = tas.id
```

- [ ] **Step 2: Add the canceled filter to each JOIN**

Change each occurrence to:

```sql
LEFT JOIN lesson_bookings lb
  ON lb.availability_slot_id = tas.id
  AND lb.lesson_status != 'canceled'
```

(Use `Edit` with `replace_all: true` since the line is identical in all 4 spots.)

- [ ] **Step 3: Smoke-check the file compiles**

Run: `bun run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/community/[communitySlug]/teacher-availability/route.ts
git commit -m "fix(teacher-availability): exclude canceled bookings from slot-taken check"
```

---

## Task 7: Teacher policy controls in `CreatePrivateLessonModal`

**Files:**
- Modify: `components/CreatePrivateLessonModal.tsx`
- Modify: `app/api/community/[communitySlug]/private-lessons/route.ts` (or wherever POST handles lesson create)
- Modify: `app/api/community/[communitySlug]/private-lessons/[lessonId]/route.ts` (edit)

- [ ] **Step 1: Locate the modal's form state**

Open `components/CreatePrivateLessonModal.tsx`. Find the `useState` block that holds the form data (search for `regular_price` or `duration_minutes`). Add two new fields to the state with the documented defaults:

```typescript
const [cancellationCutoffHours, setCancellationCutoffHours] = useState<number>(24);
const [lateRefundPolicy, setLateRefundPolicy] = useState<'refund' | 'no_refund'>('no_refund');
```

If the modal is also used for editing (check for an `initialData` prop), seed these from `initialData.cancellation_cutoff_hours ?? 24` and `initialData.late_refund_policy ?? 'no_refund'`.

- [ ] **Step 2: Render the policy controls**

In the form JSX, after the pricing section, add a "Cancellation policy" block. Match the visual style of the surrounding form (find an existing `<Label>` + `<Select>` pair to mirror — likely from `components/ui/select.tsx`):

```tsx
<div className="space-y-2">
  <Label>Cancellation cutoff</Label>
  <Select
    value={String(cancellationCutoffHours)}
    onValueChange={(v) => setCancellationCutoffHours(Number(v))}
  >
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="0">Anytime</SelectItem>
      <SelectItem value="12">12 hours before</SelectItem>
      <SelectItem value="24">24 hours before</SelectItem>
      <SelectItem value="48">48 hours before</SelectItem>
      <SelectItem value="72">72 hours before</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    Cancellations before this cutoff are always fully refunded.
  </p>
</div>

<div className="space-y-2">
  <Label>Late cancellations</Label>
  <RadioGroup
    value={lateRefundPolicy}
    onValueChange={(v) => setLateRefundPolicy(v as 'refund' | 'no_refund')}
  >
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="refund" id="late-refund" />
      <Label htmlFor="late-refund">Full refund</Label>
    </div>
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="no_refund" id="late-no-refund" />
      <Label htmlFor="late-no-refund">No refund</Label>
    </div>
  </RadioGroup>
  <p className="text-xs text-muted-foreground">
    You can always cancel any booking yourself with a full refund to the student.
  </p>
</div>
```

If `RadioGroup` isn't already imported in the file, check `components/ui/` for the equivalent (search `find components/ui -name "radio*"`). If absent, fall back to two `<input type="radio">` elements styled with Tailwind to match the project look.

- [ ] **Step 3: Include the fields in the POST body**

In the same file, find where the form submits (search `fetch(` calling the lessons create endpoint). Add the two fields to the request body:

```typescript
body: JSON.stringify({
  // ...existing fields,
  cancellation_cutoff_hours: cancellationCutoffHours,
  late_refund_policy: lateRefundPolicy,
}),
```

- [ ] **Step 4: Accept and persist the new fields in the lesson create/update API**

Open `app/api/community/[communitySlug]/private-lessons/route.ts` (POST). Find the `INSERT INTO private_lessons (...)` statement and add the two new columns plus values, defaulting to `24` and `'no_refund'` when missing.

Then open `app/api/community/[communitySlug]/private-lessons/[lessonId]/route.ts` (PATCH/PUT). Allow updating the two new fields — same pattern as other updatable fields.

- [ ] **Step 5: Manual smoke test**

Run dev server: `bun dev`
Open `http://localhost:3000/<some-community>/admin/private-lessons` (or wherever lesson create lives — check `git grep CreatePrivateLessonModal`).
Create a new test lesson with cutoff = 48h, policy = refund. Confirm with a Neon SQL query that the new row has those values set.

- [ ] **Step 6: Commit**

```bash
git add components/CreatePrivateLessonModal.tsx app/api/community/[communitySlug]/private-lessons/route.ts app/api/community/[communitySlug]/private-lessons/[lessonId]/route.ts
git commit -m "feat(private-lesson-cancellation): teacher policy controls in lesson create/edit"
```

---

## Task 8: Display policy on `LessonBookingModal`

**Files:**
- Modify: `components/LessonBookingModal.tsx`

- [ ] **Step 1: Locate where the lesson summary is rendered**

Open `components/LessonBookingModal.tsx`. Find where price / duration are displayed (search `regular_price` or `duration_minutes`). Add a small "Cancellation policy" caption beneath those.

- [ ] **Step 2: Add the policy line**

Use a helper to format:

```typescript
function describeCancellationPolicy(hours: number, latePolicy: 'refund' | 'no_refund'): string {
  if (hours === 0) {
    return latePolicy === 'refund'
      ? 'Free cancellation anytime.'
      : 'Cancellations are non-refundable.';
  }
  const window = hours === 1 ? '1 hour' : `${hours} hours`;
  return latePolicy === 'refund'
    ? `Free cancellation. Cancellations within ${window} of the lesson are also fully refunded.`
    : `Free cancellation up to ${window} before the lesson. No refund within ${window}.`;
}
```

Render it where lesson details show:

```tsx
<p className="text-sm text-muted-foreground">
  {describeCancellationPolicy(lesson.cancellation_cutoff_hours, lesson.late_refund_policy)}
</p>
```

- [ ] **Step 3: Manual check**

Run dev server, open a community's `/private-lessons`, click a lesson to open the booking modal, confirm the policy line appears with the right copy.

- [ ] **Step 4: Commit**

```bash
git add components/LessonBookingModal.tsx
git commit -m "feat(private-lesson-cancellation): show cancellation policy on booking modal"
```

---

## Task 9: Reusable `CancelLessonModal`

**Files:**
- Create: `components/CancelLessonModal.tsx`
- Create: `__tests__/components/CancelLessonModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/CancelLessonModal.test.tsx`:

```tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelLessonModal } from '@/components/CancelLessonModal';

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

const baseProps = {
  isOpen: true,
  onClose: jest.fn(),
  onCancelled: jest.fn(),
  bookingId: 'bk_1',
  lessonTitle: 'Bachata Basics',
  scheduledAtIso: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  pricePaid: 50,
  currency: 'EUR',
  role: 'student' as const,
  expectedRefundCents: 5000,
};

test('shows refund amount when expectedRefundCents > 0', () => {
  render(<CancelLessonModal {...baseProps} />);
  expect(screen.getByText(/€50/)).toBeInTheDocument();
  expect(screen.getByText(/refund/i)).toBeInTheDocument();
});

test('shows no-refund warning when expectedRefundCents === 0', () => {
  render(<CancelLessonModal {...baseProps} expectedRefundCents={0} />);
  expect(screen.getByText(/no refund/i)).toBeInTheDocument();
});

test('on confirm, POSTs to the cancel endpoint and calls onCancelled', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 'canceled', refunded_amount_cents: 5000 }),
  });

  render(<CancelLessonModal {...baseProps} />);
  await userEvent.click(screen.getByRole('button', { name: /cancel lesson/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/bookings/bk_1/cancel',
      expect.objectContaining({ method: 'POST' })
    );
    expect(baseProps.onCancelled).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `bun test __tests__/components/CancelLessonModal.test.tsx`
Expected: fails with module-not-found.

- [ ] **Step 3: Implement the modal**

Create `components/CancelLessonModal.tsx`. Pattern: mirror an existing AlertDialog use in the codebase (e.g., the leave-community dialog in `app/[communitySlug]/FeedClient.tsx`):

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void;
  bookingId: string;
  lessonTitle: string;
  scheduledAtIso: string | null;
  pricePaid: number;
  currency: string;
  role: "student" | "teacher";
  expectedRefundCents: number;
}

export function CancelLessonModal({
  isOpen,
  onClose,
  onCancelled,
  bookingId,
  lessonTitle,
  pricePaid,
  currency,
  role,
  expectedRefundCents,
}: Props) {
  const [submitting, setSubmitting] = React.useState(false);
  const refundsFully = expectedRefundCents > 0;
  const refundDisplay = (expectedRefundCents / 100).toFixed(2);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || "Cancel failed");
      }
      const body = await res.json();
      const amount = (body.refunded_amount_cents / 100).toFixed(2);
      toast.success(
        body.refunded_amount_cents > 0
          ? `Lesson canceled. ${currency} ${amount} will be refunded.`
          : `Lesson canceled.`
      );
      onCancelled();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Could not cancel lesson");
    } finally {
      setSubmitting(false);
    }
  };

  const description = refundsFully
    ? role === "teacher"
      ? `This will refund ${currency} ${refundDisplay} to the student. Refunds typically take 5–10 days to appear.`
      : `${currency} ${refundDisplay} will be refunded to your card. Refunds typically take 5–10 days to appear.`
    : `No refund will be issued per the teacher's cancellation policy. You will not be charged again.`;

  return (
    <AlertDialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Cancel {lessonTitle}?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep lesson</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={submitting}
            className={refundsFully ? undefined : "bg-destructive text-destructive-foreground"}
          >
            {submitting ? "Canceling..." : "Cancel lesson"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test __tests__/components/CancelLessonModal.test.tsx`
Expected: ALL pass.

- [ ] **Step 5: Commit**

```bash
git add components/CancelLessonModal.tsx __tests__/components/CancelLessonModal.test.tsx
git commit -m "feat(private-lesson-cancellation): reusable CancelLessonModal"
```

---

## Task 10: Student-side Cancel button on `/dashboard`

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/api/bookings/route.ts` (if not already returning policy fields)

- [ ] **Step 1: Make sure `/api/bookings` returns the policy fields**

Open `app/api/bookings/route.ts`. Find the SELECT. Confirm it joins `private_lessons` and includes `pl.cancellation_cutoff_hours` and `pl.late_refund_policy`. If missing, add them.

- [ ] **Step 2: Add expected-refund helper**

In `app/dashboard/page.tsx`, near the existing `isLessonOver` helper (~line 157), add:

```typescript
function expectedRefundCents(
  pricePaid: number,
  scheduledAtIso: string | null,
  cutoffHours: number,
  latePolicy: 'refund' | 'no_refund'
): number {
  if (!scheduledAtIso) return Math.round(pricePaid * 100);
  const scheduledMs = new Date(scheduledAtIso).getTime();
  const cutoffMs = scheduledMs - cutoffHours * 3600_000;
  const beforeCutoff = Date.now() <= cutoffMs;
  if (beforeCutoff || latePolicy === 'refund') {
    return Math.round(pricePaid * 100);
  }
  return 0;
}
```

- [ ] **Step 3: Add modal state and the Cancel button**

Near the top of the component, add state:

```typescript
const [cancelTarget, setCancelTarget] = useState<LessonBookingWithDetails | null>(null);
```

Find the upcoming-lessons card render block (search `upcomingLessons.map` or the Join button rendering). Next to the Join button, add:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setCancelTarget(lesson)}
>
  Cancel
</Button>
```

Render the modal at the bottom of the component, alongside other modals:

```tsx
{cancelTarget && (
  <CancelLessonModal
    isOpen={!!cancelTarget}
    onClose={() => setCancelTarget(null)}
    onCancelled={() => {
      setBookings((prev) => prev.filter((b) => b.id !== cancelTarget.id));
      setCancelTarget(null);
    }}
    bookingId={cancelTarget.id}
    lessonTitle={cancelTarget.lesson_title}
    scheduledAtIso={cancelTarget.scheduled_at ?? null}
    pricePaid={Number(cancelTarget.price_paid)}
    currency="EUR"
    role="student"
    expectedRefundCents={expectedRefundCents(
      Number(cancelTarget.price_paid),
      cancelTarget.scheduled_at ?? null,
      cancelTarget.cancellation_cutoff_hours,
      cancelTarget.late_refund_policy
    )}
  />
)}
```

Add the import at the top:
```typescript
import { CancelLessonModal } from "@/components/CancelLessonModal";
```

- [ ] **Step 4: Manual smoke**

Run dev server, log in as a student with at least one upcoming paid lesson on a community. Confirm:
1. Cancel button shows next to Join on the upcoming lesson card.
2. Click Cancel — modal opens with refund amount.
3. Confirm — booking disappears from upcoming list, toast appears.
4. Refresh — booking still gone (DB persisted).
5. Check Neon: `lesson_bookings.lesson_status = 'canceled'`, `availability_slot_id = NULL`.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/api/bookings/route.ts
git commit -m "feat(private-lesson-cancellation): student Cancel button on dashboard"
```

---

## Task 11: Teacher Cancel button in `PrivateLessonManagementModal`

**Files:**
- Modify: `components/PrivateLessonManagementModal.tsx`
- Modify: `app/api/community/[communitySlug]/lesson-bookings/route.ts` (if needed)

- [ ] **Step 1: Confirm the teacher endpoint returns policy fields**

Open `app/api/community/[communitySlug]/lesson-bookings/route.ts`. The SELECT must include `pl.cancellation_cutoff_hours` and `pl.late_refund_policy`. Add if missing.

- [ ] **Step 2: Add modal state and Cancel action**

In `components/PrivateLessonManagementModal.tsx`, add state at the top:

```typescript
const [cancelTarget, setCancelTarget] = useState<LessonBookingWithDetails | null>(null);
```

Find the booking row render (around line 468 — search for `bg-card rounded-2xl` inside the `lessonBookings.map` loop). In the actions area (alongside the existing Join button), add:

```tsx
{['booked', 'scheduled'].includes(booking.lesson_status) && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setCancelTarget(booking)}
  >
    Cancel booking
  </Button>
)}
```

- [ ] **Step 3: Render the modal**

At the bottom of the component (just before the closing tags):

```tsx
{cancelTarget && (
  <CancelLessonModal
    isOpen={!!cancelTarget}
    onClose={() => setCancelTarget(null)}
    onCancelled={() => {
      setLessonBookings((prev) =>
        prev.map((b) =>
          b.id === cancelTarget.id
            ? { ...b, lesson_status: 'canceled', payment_status: 'refunded' }
            : b
        )
      );
      setCancelTarget(null);
    }}
    bookingId={cancelTarget.id}
    lessonTitle={cancelTarget.lesson_title}
    scheduledAtIso={cancelTarget.scheduled_at ?? null}
    pricePaid={Number(cancelTarget.price_paid)}
    currency="EUR"
    role="teacher"
    expectedRefundCents={Math.round(Number(cancelTarget.price_paid) * 100)}
  />
)}
```

Note: for teacher-initiated cancel, expected refund is always the full price — no policy logic needed client-side.

Add the import:
```typescript
import { CancelLessonModal } from "@/components/CancelLessonModal";
```

- [ ] **Step 4: Manual smoke**

As a community owner, open the lesson management modal for a lesson with a paid booking. Confirm:
1. Cancel booking button appears.
2. Click — modal opens with "Will refund €X to the student".
3. Confirm — toast shows, row status flips to canceled.
4. Verify in Neon: `lesson_status='canceled'`, `canceled_by='teacher'`, `payment_status='refunded'`.
5. Check Stripe dashboard: refund created with the application fee returned.

- [ ] **Step 5: Commit**

```bash
git add components/PrivateLessonManagementModal.tsx app/api/community/[communitySlug]/lesson-bookings/route.ts
git commit -m "feat(private-lesson-cancellation): teacher Cancel button in management modal"
```

---

## Task 12: Preprod QA + deploy

**Files:** (none — manual)

- [ ] **Step 1: Push the branch**

```bash
cd /home/debian/apps/dance-hub-preprod
git push -u origin fix/preprod-batch-may18
```

- [ ] **Step 2: Deploy to preprod**

```bash
./deploy-preprod.sh
```

(Reference: memory `feedback_cpd_shorthand` — use `deploy-preprod.sh` for preprod.)

- [ ] **Step 3: Verify migration on preprod DB**

Use Neon MCP to confirm preprod has the new columns and CHECK constraints (re-run the check from Task 1 Step 3 if needed).

- [ ] **Step 4: End-to-end matrix on preprod (Stripe test mode)**

Switch preprod to Stripe test keys if not already (per memory `project_preprod_stripe_live_keys`, `cp .env.preprod.test .env.preprod && ./deploy-preprod.sh`).

For each scenario, book a fresh test-card lesson, then cancel:

1. **Student before cutoff** — verify: refund visible in Stripe, slot bookable again, teacher receives email, dashboard shows the booking gone.
2. **Student after cutoff with `no_refund`** — verify: no Stripe refund, status flipped, teacher email mentions "no refund", slot bookable again.
3. **Student after cutoff with `refund`** — verify: refund issued, teacher email mentions refund.
4. **Teacher cancel** — verify: refund issued, student receives email with refund amount.
5. **Free lesson** (price_paid=0) — verify: status flipped, no Stripe call.
6. **Double-cancel race** — call the cancel API twice quickly; second one returns 409.
7. **Past lesson** — try to cancel a lesson scheduled in the past; expect 409.
8. **Unauthorized** — call API as a random member; expect 403.

- [ ] **Step 5: Restore preprod to live mode if you swapped earlier**

```bash
cp .env.preprod.live .env.preprod
./deploy-preprod.sh
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat: private lesson cancellation (cancel-only MVP)" --body "$(cat <<'EOF'
## Summary
- Per-lesson cancellation policy: `cancellation_cutoff_hours` + `late_refund_policy` set by the teacher when creating the lesson.
- New `POST /api/bookings/[bookingId]/cancel` route. Cancel is never blocked; the policy only determines refund. Teacher cancel always full-refund.
- Stripe refund includes the 5% platform application fee (`refund_application_fee: true`).
- Cancel UI on student dashboard and `PrivateLessonManagementModal`. Reusable `CancelLessonModal`.
- Resend email to the other party on cancel.
- Hardening: availability LEFT JOIN now filters out canceled bookings.

Spec: `docs/superpowers/specs/2026-05-18-private-lesson-cancellation-design.md`

## Test plan
- [x] Unit tests for cancel route decision matrix and email dispatch
- [x] Unit test for `CancelLessonModal`
- [x] Preprod end-to-end on Stripe test mode (8 scenarios — see plan Task 12 Step 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (for the engineer executing this plan)

Before opening the PR, verify:

- [ ] All tests pass: `bun test`
- [ ] No lint errors: `bun run lint`
- [ ] Migration applied on preprod, schema verified
- [ ] All 8 e2e scenarios in Task 12 Step 4 pass on preprod with Stripe test mode
- [ ] No stray `console.log` or commented-out code
- [ ] The branch is rebased on latest `origin/main`
