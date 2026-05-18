# Private Lesson Cancellation — Design Spec

**Date:** 2026-05-18
**Status:** Approved, ready for implementation plan
**Scope:** MVP cancellation for private lesson bookings (cancel only, no reschedule)

## Problem

Today neither students nor teachers can cancel a confirmed private lesson booking. There are no API routes, no UI affordances, and no refund handling. The `lesson_bookings.lesson_status` field already permits the value `'canceled'` but nothing in the app sets it.

## Goal

Let both parties cancel a booking from the surfaces they already use (student dashboard, teacher's `PrivateLessonManagementModal`), and automate the refund where the teacher's policy says it's owed. Out of scope here: reschedule, partial refunds, cancel-reason capture, bulk cancel.

## Policy model — teacher-owned, set per lesson

Cancellation is **never blocked**. The teacher's policy only determines whether the student gets refunded when they cancel after a configurable cutoff.

Two new columns on `private_lessons`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `cancellation_cutoff_hours` | `INT NOT NULL` | `24` | Presets in UI: 0 / 12 / 24 / 48 / 72 |
| `late_refund_policy` | `TEXT NOT NULL` | `'no_refund'` | CHECK in (`'refund'`, `'no_refund'`) |

Existing rows get the defaults via the `NOT NULL DEFAULT` clause — no explicit backfill needed.

### Decision matrix

| Who cancels | When | Refund |
|---|---|---|
| Student | ≥ `cutoff_hours` before `scheduled_at` | Full |
| Student | < `cutoff_hours` before, policy `refund` | Full |
| Student | < `cutoff_hours` before, policy `no_refund` | **€0** (cancel still proceeds) |
| Teacher | Anytime | Full |

A booking is **cancelable** while `lesson_status ∈ {booked, scheduled}` and `scheduled_at` has not already passed (with a small grace, e.g. 5 min, to avoid edge-of-window cancels during the session).

## Schema changes

### `private_lessons` — policy columns

```sql
ALTER TABLE private_lessons
  ADD COLUMN cancellation_cutoff_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN late_refund_policy TEXT NOT NULL DEFAULT 'no_refund'
    CHECK (late_refund_policy IN ('refund', 'no_refund'));
```

### `lesson_bookings` — audit + refunded status

```sql
ALTER TABLE lesson_bookings
  ADD COLUMN canceled_at TIMESTAMPTZ NULL,
  ADD COLUMN canceled_by TEXT NULL CHECK (canceled_by IN ('student', 'teacher'));

-- Extend payment_status CHECK to allow 'refunded'
ALTER TABLE lesson_bookings
  DROP CONSTRAINT lesson_bookings_payment_status_check,
  ADD CONSTRAINT lesson_bookings_payment_status_check
    CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));
```

## API

### `POST /api/bookings/[bookingId]/cancel`

**Auth.** Session required. Caller must be either `booking.student_id` or the community owner (`communities.created_by`). Anyone else → 403.

**Guards.**
- 404 if booking not found.
- 409 if `lesson_status NOT IN ('booked', 'scheduled')`.
- 409 if `scheduled_at` is in the past (plus 5 min grace).

**Flow.**
1. Resolve role: `'student'` if caller is `student_id`, `'teacher'` if caller is community owner.
2. Compute refund amount per the decision matrix.
3. If refund > 0 and `stripe_payment_intent_id IS NOT NULL`: call `stripe.refunds.create({ payment_intent, refund_application_fee: true })` on the connected account. The 5% platform fee returns to the connected account.
4. Transactional DB update:
   - `lesson_status = 'canceled'`
   - `canceled_at = NOW()`
   - `canceled_by = <role>`
   - `payment_status = 'refunded'` if refunded, otherwise unchanged
   - `availability_slot_id = NULL` — this is what frees the slot. Availability is computed in `/api/community/[communitySlug]/teacher-availability` via `LEFT JOIN lesson_bookings lb ON lb.availability_slot_id = tas.id`, so a slot is "free" iff no `lesson_bookings` row references it. The `teacher_availability_slots` table itself has no booked/free flag.
5. Fire Resend email to the *other* party (see Emails below).
6. Respond `{ status: 'canceled', refunded_amount_cents: number, refund_id: string | null }`.

**Error cases.**
- Stripe refund failure → 502, DB unchanged, response body `{ error: 'refund_failed', message }`. The booking stays `booked` so the user can retry or contact support. Logged.
- DB update failure after a successful Stripe refund → log loudly; this is the worst case (money returned but record stale). Acceptable risk for MVP; webhook reconciliation is a future improvement.
- No-payment edge (`stripe_payment_intent_id IS NULL` — e.g. free or promotional lesson) → skip refund step, flip status normally, `refunded_amount_cents = 0`.

**Concurrency.** The 409-on-not-cancelable guard handles double-cancel races. Refunding is idempotent enough — if step 3 succeeds and step 4 fails, retry will hit Stripe's "already refunded" which we treat as success.

**Hardening (nice-to-have, in scope if cheap).** Add `AND lb.lesson_status != 'canceled'` to the LEFT JOIN in `app/api/community/[communitySlug]/teacher-availability/route.ts`. Today the cancel path nulls `availability_slot_id` so the join already misses canceled bookings, but the extra predicate makes the availability query correct even if a future code path forgets that step.

## UI

### 1. Teacher — `CreatePrivateLessonModal` (also the edit modal)

New "Cancellation policy" section, positioned after pricing:

- **Cutoff before lesson**: dropdown — `Anytime (0h)` / `12 hours` / `24 hours` (default) / `48 hours` / `72 hours`
- **Late cancellations** (radio): `Full refund` / `No refund` (default `No refund`)
- Small help text: "Cancellations before the cutoff are always fully refunded. After the cutoff, the student gets the refund you choose here. You can always cancel any booking yourself with a full refund."

Display the resolved policy on `LessonBookingModal` (the student-facing booking modal) before the student pays, in plain language: "Free cancellation up to 24 hours before the lesson. Within 24 hours, no refund."

### 2. Student — `app/dashboard/page.tsx` (upcoming lessons cards)

Add a **Cancel** button next to **Join** on each cancelable upcoming-lesson card. On click → confirmation modal whose copy adapts to refund amount:

- Refund > 0 (full): "Cancel this lesson? €X will be refunded to your card. Refunds typically arrive within 5–10 days."
- Refund = 0 (late + `no_refund`): warning style. "Cancel this lesson? **No refund will be issued** per the teacher's cancellation policy (less than X hours before lesson)."

Confirm = call cancel endpoint, toast result, remove from upcoming list.

### 3. Teacher — `PrivateLessonManagementModal` (booking rows)

Per booking row, add a **Cancel booking** action (button or kebab menu, matching existing patterns in that modal). Disabled when not cancelable. Confirmation modal: "Cancel this booking? €X will be refunded to [student name]." On confirm → call cancel endpoint, toast result, refetch bookings list.

## Emails (Resend, existing infra)

Both use the existing transactional email path used by the booking confirmation. Templates live alongside other booking emails.

- **Student canceled** → email teacher:
  Subject: *Booking canceled — [Lesson title]*
  Body: "[Student name] canceled their booking for [Lesson title] on [Date]. [Refund line: either 'They were refunded €X.' or 'Per your cancellation policy, no refund was issued.'] The slot is now available again."

- **Teacher canceled** → email student:
  Subject: *Your lesson was canceled*
  Body: "[Teacher / community name] canceled your [Lesson title] on [Date]. €X has been refunded to your card. Refunds typically take 5–10 days to appear."

The canceler sees only an in-app toast — no self-email.

## Testing

- **Unit.** Refund-amount calculation across the decision matrix (4 cases + free-lesson edge).
- **Integration.** Cancel endpoint end-to-end against Stripe test mode on the preprod environment: student-before-cutoff, student-after-cutoff with each policy, teacher cancel, double-cancel 409, expired-lesson 409, unauthorized 403.
- **Manual QA** on preprod: full flow from both sides, verify Stripe dashboard shows the refund and application fee returned, verify slot is bookable again, verify both emails land.

## Explicitly out of scope (deferred)

- **Reschedule.** For now, the path is cancel + rebook.
- **Partial refunds** (50%, etc.).
- **Cancel reason** text field shown to the other party.
- **Bulk cancel** from teacher side.
- **Webhook reconciliation** for refund/DB drift.
- **Calendar invite cancellation** (no calendar invites are sent today).
