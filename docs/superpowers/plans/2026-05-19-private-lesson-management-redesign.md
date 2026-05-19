# Private Lesson Management Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `PrivateLessonManagementModal` into three focused tabs (Lessons / Bookings / Availability) with smaller, single-purpose sub-components, and replace the dialog-based availability flow with an inline side panel.

**Architecture:** Pure UI restructure — no schema, API, or behavior changes beyond layout. New components live under `components/private-lessons/manage/`. Each tab owns its own data fetching + handlers; the modal shell only manages tab state and dialog frame. Booking grouping logic is extracted to a pure function for testability.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind, shadcn primitives (`Tabs`, `Sheet`, `DropdownMenu`), date-fns + date-fns-tz, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-19-private-lesson-management-redesign.md`

---

## File Structure (new layout)

```
components/private-lessons/manage/
  PrivateLessonManagementModal.tsx   modal shell — Dialog frame, tab state
  LessonsTab.tsx                     fetches lessons, renders grid + new-lesson tile
  LessonCard.tsx                     single compact card with ⋯ menu
  BookingsTab.tsx                    fetches bookings, renders grouped timeline
  BookingRow.tsx                     single row + Join button / ⋯ menu
  BookingDetailsSheet.tsx            right side panel — full booking details
  AvailabilityTab.tsx                month calendar + day panel layout
  AvailabilityDayPanel.tsx           slot list + add form

lib/booking-grouping.ts              pure groupBookings() utility

__tests__/lib/booking-grouping.test.ts
__tests__/components/manage/LessonCard.test.tsx
__tests__/components/manage/BookingRow.test.tsx
__tests__/components/manage/AvailabilityDayPanel.test.tsx
```

Existing files modified:
- `components/PrivateLessonsPage.tsx` — update import path
- `components/TeacherCalendarAvailability.tsx` — remove embedded dialog, add `selectedDate` + `onDateSelect` props

Existing files removed:
- `components/PrivateLessonManagementModal.tsx` — moved to new location

Existing files left untouched: `CreatePrivateLessonModal.tsx`, `CancelLessonModal.tsx`, all API routes.

---

### Task 1: Set up new directory and move modal file as-is

This task is mechanical — relocate the existing modal so subsequent tasks have a stable target path. Behavior must not change.

**Files:**
- Create: `components/private-lessons/manage/` (directory)
- Move: `components/PrivateLessonManagementModal.tsx` → `components/private-lessons/manage/PrivateLessonManagementModal.tsx`
- Modify: `components/PrivateLessonsPage.tsx` (line 9 import)

- [ ] **Step 1: Create directory and move the file**

```bash
cd /home/debian/apps/dance-hub-pl-redesign
mkdir -p components/private-lessons/manage
git mv components/PrivateLessonManagementModal.tsx components/private-lessons/manage/PrivateLessonManagementModal.tsx
```

- [ ] **Step 2: Update the import in `PrivateLessonsPage.tsx`**

In `components/PrivateLessonsPage.tsx`, find line 9:

```typescript
import PrivateLessonManagementModal from "./PrivateLessonManagementModal";
```

Replace with:

```typescript
import PrivateLessonManagementModal from "./private-lessons/manage/PrivateLessonManagementModal";
```

- [ ] **Step 3: Run TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | head -10
```

Expected: zero new errors (one pre-existing unrelated error in `e2e/stripe-integration.spec.ts` is fine).

- [ ] **Step 4: Commit**

```bash
git add components/PrivateLessonsPage.tsx components/private-lessons/manage/PrivateLessonManagementModal.tsx
git commit -m "refactor(pl-manage): relocate modal under components/private-lessons/manage/"
```

---

### Task 2: Extract booking grouping utility with tests

The Bookings tab groups bookings into Today / This week / Upcoming / Past / Canceled. This is pure date logic — extract it to a testable function before building the UI.

**Files:**
- Create: `lib/booking-grouping.ts`
- Create: `__tests__/lib/booking-grouping.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `__tests__/lib/booking-grouping.test.ts`:

```typescript
import { groupBookings, BookingGroup } from '@/lib/booking-grouping';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

const mkBooking = (
  id: string,
  scheduledAtIso: string | null,
  lessonStatus: LessonBookingWithDetails['lesson_status'] = 'booked',
  durationMin = 60,
): LessonBookingWithDetails =>
  ({
    id,
    scheduled_at: scheduledAtIso,
    lesson_status: lessonStatus,
    duration_minutes: durationMin,
    payment_status: 'succeeded',
    viewer_role: 'teacher',
    lesson_title: 'L',
    student_name: 's',
    student_email: 's@e',
    community_name: 'C',
    price_paid: '0',
    cancellation_cutoff_hours: 24,
    late_refund_policy: 'no_refund',
  } as unknown as LessonBookingWithDetails);

const NOW = new Date('2026-05-20T12:00:00Z'); // Wed, May 20

test('puts a booking later today into "today"', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-20T18:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.today.map(b => b.id)).toEqual(['a']);
  expect(groups.thisWeek).toEqual([]);
});

test('puts a booking on Friday into "this week"', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-22T18:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.thisWeek.map(b => b.id)).toEqual(['a']);
});

test('puts a booking next week into "upcoming"', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-28T18:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.upcoming.map(b => b.id)).toEqual(['a']);
});

test('puts an ended booking into "past"', () => {
  // Started 3 hours ago for 60 min — ended 2h ago, past the 15-min grace.
  const groups = groupBookings(
    [mkBooking('a', '2026-05-20T09:00:00Z')],
    NOW,
    'UTC',
  );
  expect(groups.past.map(b => b.id)).toEqual(['a']);
});

test('puts a canceled booking into "canceled" regardless of scheduled_at', () => {
  const groups = groupBookings(
    [mkBooking('a', '2026-05-22T18:00:00Z', 'canceled')],
    NOW,
    'UTC',
  );
  expect(groups.canceled.map(b => b.id)).toEqual(['a']);
  expect(groups.thisWeek).toEqual([]);
});

test('sorts each section ascending by scheduled_at', () => {
  const groups = groupBookings(
    [
      mkBooking('b', '2026-05-22T18:00:00Z'),
      mkBooking('a', '2026-05-21T18:00:00Z'),
    ],
    NOW,
    'UTC',
  );
  expect(groups.thisWeek.map(b => b.id)).toEqual(['a', 'b']);
});

test('null scheduled_at goes to "upcoming"', () => {
  const groups = groupBookings(
    [mkBooking('a', null)],
    NOW,
    'UTC',
  );
  expect(groups.upcoming.map(b => b.id)).toEqual(['a']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test __tests__/lib/booking-grouping.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '@/lib/booking-grouping'`.

- [ ] **Step 3: Implement `lib/booking-grouping.ts`**

Create `lib/booking-grouping.ts`:

```typescript
import { toZonedTime } from 'date-fns-tz';
import { isSameDay, endOfWeek, startOfWeek } from 'date-fns';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

export interface BookingGroup {
  today: LessonBookingWithDetails[];
  thisWeek: LessonBookingWithDetails[];
  upcoming: LessonBookingWithDetails[];
  past: LessonBookingWithDetails[];
  canceled: LessonBookingWithDetails[];
}

const GRACE_MS = 15 * 60_000;

function hasEnded(b: LessonBookingWithDetails, now: Date): boolean {
  if (b.lesson_status === 'completed') return true;
  if (!b.scheduled_at) return false;
  const start = new Date(b.scheduled_at).getTime();
  const end = start + (b.duration_minutes ?? 60) * 60_000;
  return now.getTime() > end + GRACE_MS;
}

function compareScheduled(
  a: LessonBookingWithDetails,
  b: LessonBookingWithDetails,
): number {
  if (!a.scheduled_at) return 1;
  if (!b.scheduled_at) return -1;
  return (
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
}

export function groupBookings(
  bookings: LessonBookingWithDetails[],
  now: Date,
  tz: string,
): BookingGroup {
  const group: BookingGroup = {
    today: [],
    thisWeek: [],
    upcoming: [],
    past: [],
    canceled: [],
  };

  const zonedNow = toZonedTime(now, tz);
  const weekStart = startOfWeek(zonedNow, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(zonedNow, { weekStartsOn: 1 });

  for (const b of bookings) {
    if (b.lesson_status === 'canceled') {
      group.canceled.push(b);
      continue;
    }
    if (hasEnded(b, now)) {
      group.past.push(b);
      continue;
    }
    if (!b.scheduled_at) {
      group.upcoming.push(b);
      continue;
    }
    const zoned = toZonedTime(new Date(b.scheduled_at), tz);
    if (isSameDay(zoned, zonedNow)) {
      group.today.push(b);
    } else if (zoned >= weekStart && zoned <= weekEnd) {
      group.thisWeek.push(b);
    } else if (zoned > weekEnd) {
      group.upcoming.push(b);
    } else {
      group.past.push(b);
    }
  }

  group.today.sort(compareScheduled);
  group.thisWeek.sort(compareScheduled);
  group.upcoming.sort(compareScheduled);
  group.past.sort(compareScheduled);
  group.canceled.sort(compareScheduled);

  return group;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test __tests__/lib/booking-grouping.test.ts 2>&1 | tail -10
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/booking-grouping.ts __tests__/lib/booking-grouping.test.ts
git commit -m "feat(pl-manage): add booking grouping utility for Today/This week/Upcoming/Past/Canceled"
```

---

### Task 3: Build `LessonCard` with tests

Compact card showing title + active badge, price (hero), `duration · location` subline, and a ⋯ menu (Edit / Activate-Deactivate / Delete). Click on the card body fires `onEdit`.

**Files:**
- Create: `components/private-lessons/manage/LessonCard.tsx`
- Create: `__tests__/components/manage/LessonCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/manage/LessonCard.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonCard } from '@/components/private-lessons/manage/LessonCard';
import type { PrivateLesson } from '@/types/private-lessons';

const mkLesson = (over: Partial<PrivateLesson> = {}): PrivateLesson => ({
  id: 'l1',
  community_id: 'c1',
  teacher_id: 't1',
  title: 'Beginner Bachata',
  description: 'd',
  duration_minutes: 60,
  regular_price: 40,
  member_price: null,
  location_type: 'online',
  location_details: null,
  requirements: null,
  is_active: true,
  cancellation_cutoff_hours: 24,
  late_refund_policy: 'no_refund',
  created_at: '',
  updated_at: '',
  ...over,
} as unknown as PrivateLesson);

test('renders title, price, and duration/location subline', () => {
  render(
    <LessonCard
      lesson={mkLesson()}
      onEdit={() => {}}
      onToggleActive={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText('Beginner Bachata')).toBeInTheDocument();
  expect(screen.getByText(/€40/)).toBeInTheDocument();
  expect(screen.getByText(/60 min/)).toBeInTheDocument();
  expect(screen.getByText(/Online/i)).toBeInTheDocument();
  expect(screen.getByText(/Active/i)).toBeInTheDocument();
});

test('renders Inactive badge for inactive lessons', () => {
  render(
    <LessonCard
      lesson={mkLesson({ is_active: false })}
      onEdit={() => {}}
      onToggleActive={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText(/Inactive/i)).toBeInTheDocument();
});

test('clicking the card body calls onEdit', async () => {
  const onEdit = jest.fn();
  render(
    <LessonCard
      lesson={mkLesson()}
      onEdit={onEdit}
      onToggleActive={() => {}}
      onDelete={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /edit lesson/i }));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

test('⋯ menu fires onDelete', async () => {
  const onDelete = jest.fn();
  render(
    <LessonCard
      lesson={mkLesson()}
      onEdit={() => {}}
      onToggleActive={() => {}}
      onDelete={onDelete}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test __tests__/components/manage/LessonCard.test.tsx 2>&1 | tail -10
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `LessonCard.tsx`**

Create `components/private-lessons/manage/LessonCard.tsx`:

```tsx
"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import type { PrivateLesson } from '@/types/private-lessons';

interface LessonCardProps {
  lesson: PrivateLesson;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

const LOCATION_LABEL: Record<PrivateLesson['location_type'], string> = {
  online: 'Online',
  in_person: 'In person',
  both: 'Online or in person',
};

export function LessonCard({
  lesson,
  onEdit,
  onToggleActive,
  onDelete,
}: LessonCardProps) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card hover:border-border transition-colors">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit lesson"
        className="w-full text-left p-4 pr-12"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-display text-base font-semibold leading-snug">
            {lesson.title}
          </h3>
          <Badge
            variant={lesson.is_active ? 'default' : 'secondary'}
            className={cn(
              'shrink-0 font-normal text-xs',
              lesson.is_active
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                : '',
            )}
          >
            {lesson.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="text-2xl font-display font-bold text-foreground">
          {formatPrice(lesson.regular_price)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {lesson.duration_minutes} min · {LOCATION_LABEL[lesson.location_type]}
        </div>
      </button>

      <div className="absolute top-3 right-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleActive}>
              {lesson.is_active ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
bun test __tests__/components/manage/LessonCard.test.tsx 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/private-lessons/manage/LessonCard.tsx __tests__/components/manage/LessonCard.test.tsx
git commit -m "feat(pl-manage): LessonCard compact card with edit/toggle/delete actions"
```

---

### Task 4: Build `LessonsTab`

Lessons tab owns its own data: fetches `/api/community/[slug]/private-lessons?include_inactive=true`, renders the grid of `LessonCard`s + a dashed "+ New lesson" tile, and wires up Edit / Toggle / Delete handlers. Uses `CreatePrivateLessonModal` for create/edit and `AlertDialog` for delete confirmation.

**Files:**
- Create: `components/private-lessons/manage/LessonsTab.tsx`

- [ ] **Step 1: Implement `LessonsTab.tsx`**

Create `components/private-lessons/manage/LessonsTab.tsx`:

```tsx
"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import CreatePrivateLessonModal from '@/components/CreatePrivateLessonModal';
import { LessonCard } from './LessonCard';
import type { PrivateLesson } from '@/types/private-lessons';

interface LessonsTabProps {
  communityId: string;
  communitySlug: string;
  /** Called after any change to the lesson set so the parent page can refresh
   *  its own grid. */
  onLessonsChanged?: () => void;
}

export function LessonsTab({
  communityId,
  communitySlug,
  onLessonsChanged,
}: LessonsTabProps) {
  const { session } = useAuth();
  const [lessons, setLessons] = useState<PrivateLesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PrivateLesson | null>(null);

  const [toDelete, setToDelete] = useState<PrivateLesson | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchLessons = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/private-lessons?include_inactive=true`,
      );
      if (res.ok) {
        setLessons(await res.json());
      }
    } catch (e) {
      console.error('Failed to load lessons', e);
    } finally {
      setIsLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const handleToggleActive = useCallback(
    async (lesson: PrivateLesson) => {
      try {
        const res = await fetch(
          `/api/community/${communitySlug}/private-lessons/${lesson.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !lesson.is_active }),
          },
        );
        if (!res.ok) throw new Error();
        toast.success(lesson.is_active ? 'Lesson deactivated' : 'Lesson activated');
        await fetchLessons();
        onLessonsChanged?.();
      } catch {
        toast.error('Failed to update lesson');
      }
    },
    [communitySlug, fetchLessons, onLessonsChanged],
  );

  const handleDelete = useCallback(async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/private-lessons/${toDelete.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error();
      toast.success('Lesson deleted');
      setToDelete(null);
      await fetchLessons();
      onLessonsChanged?.();
    } catch {
      toast.error('Failed to delete lesson');
    } finally {
      setIsDeleting(false);
    }
  }, [toDelete, communitySlug, fetchLessons, onLessonsChanged]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map(lesson => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            onEdit={() => {
              setEditing(lesson);
              setEditorOpen(true);
            }}
            onToggleActive={() => handleToggleActive(lesson)}
            onDelete={() => setToDelete(lesson)}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          className="rounded-2xl border-2 border-dashed border-border/60 hover:border-border p-4 min-h-[140px] flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">New lesson</span>
        </button>
      </div>

      <CreatePrivateLessonModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        communityId={communityId}
        communitySlug={communitySlug}
        editingLesson={editing}
        onSuccess={() => {
          setEditorOpen(false);
          setEditing(null);
          fetchLessons();
          onLessonsChanged?.();
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.title} will be permanently removed. Past bookings stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify the `CreatePrivateLessonModal` prop shape**

```bash
grep -n "interface.*Props\|export default function CreatePrivateLessonModal\|onSuccess\|editingLesson" /home/debian/apps/dance-hub-pl-redesign/components/CreatePrivateLessonModal.tsx | head -10
```

If the existing prop names differ from `editingLesson` / `onSuccess` / `isOpen` / `onClose` / `communityId` / `communitySlug`, adjust the call site in `LessonsTab.tsx` to match. Do NOT modify `CreatePrivateLessonModal.tsx` — match its existing signature.

- [ ] **Step 3: TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | grep -E "LessonsTab|LessonCard" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/private-lessons/manage/LessonsTab.tsx
git commit -m "feat(pl-manage): LessonsTab with card grid, new-lesson tile, edit/toggle/delete"
```

---

### Task 5: Build `BookingDetailsSheet`

Right-side panel (shadcn `Sheet`) that shows full booking details for a selected booking. Pure render component — receives a booking and an open/close pair.

**Files:**
- Create: `components/private-lessons/manage/BookingDetailsSheet.tsx`

- [ ] **Step 1: Implement `BookingDetailsSheet.tsx`**

Create `components/private-lessons/manage/BookingDetailsSheet.tsx`:

```tsx
"use client";

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MessageSquare, Video, Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import { PAYMENT_STATUS_BADGE } from '@/lib/private-lessons-display';
import { formatInTz } from '@/lib/timezone';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

interface BookingDetailsSheetProps {
  booking: LessonBookingWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canJoinVideo: boolean;
  onCancel: () => void;
}

export function BookingDetailsSheet({
  booking,
  open,
  onOpenChange,
  canJoinVideo,
  onCancel,
}: BookingDetailsSheetProps) {
  const tz = useUserTimezone();

  if (!booking) return null;

  let contactInfo: { phone?: string; preferred_contact?: string } = {};
  try {
    contactInfo = booking.contact_info
      ? typeof booking.contact_info === 'string'
        ? JSON.parse(booking.contact_info)
        : booking.contact_info
      : {};
  } catch {}

  const paymentBadge = PAYMENT_STATUS_BADGE[booking.payment_status as keyof typeof PAYMENT_STATUS_BADGE];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{booking.lesson_title}</SheetTitle>
          <SheetDescription className="text-left flex items-center gap-2 mt-1">
            {paymentBadge && (
              <Badge variant="secondary" className={paymentBadge.className}>
                {paymentBadge.label}
              </Badge>
            )}
            <Badge variant="outline">{booking.lesson_status}</Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm">
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Scheduled
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {booking.scheduled_at
                ? formatInTz(new Date(booking.scheduled_at), tz, 'EEE, MMM d · h:mm a')
                : 'No time set'}
            </div>
          </section>

          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Student
            </div>
            <div className="font-medium">
              {booking.student_name || booking.student_email}
            </div>
            <div className="flex flex-col gap-1 mt-2 text-muted-foreground">
              {booking.student_email && (
                <a
                  href={`mailto:${booking.student_email}`}
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {booking.student_email}
                </a>
              )}
              {contactInfo.phone && (
                <a
                  href={`tel:${contactInfo.phone}`}
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {contactInfo.phone}
                </a>
              )}
            </div>
          </section>

          {booking.student_message && (
            <section>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Message
              </div>
              <div className="rounded-lg bg-muted/60 p-3 text-foreground/90 whitespace-pre-wrap">
                {booking.student_message}
              </div>
            </section>
          )}

          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Payment
            </div>
            <div>{formatPrice(Number(booking.price_paid))} paid</div>
          </section>

          <div className="flex flex-col gap-2 pt-2">
            {canJoinVideo && (
              <Button asChild className="rounded-xl">
                <Link href={`/video-session/${booking.id}`}>
                  <Video className="h-4 w-4 mr-2" />
                  Join video session
                </Link>
              </Button>
            )}
            {(booking.lesson_status === 'booked' ||
              booking.lesson_status === 'scheduled') && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="rounded-xl"
              >
                Cancel booking
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | grep "BookingDetailsSheet" | head -5
```

Expected: no errors. If `PAYMENT_STATUS_BADGE` has a different shape than `{ label, className }`, adjust the destructuring to match `lib/private-lessons-display.ts`.

- [ ] **Step 3: Commit**

```bash
git add components/private-lessons/manage/BookingDetailsSheet.tsx
git commit -m "feat(pl-manage): BookingDetailsSheet right-side panel"
```

---

### Task 6: Build `BookingRow` with tests

Compact row: avatar + student/lesson title + scheduled-time subline + right-side action (Join button if joinable, else "⋯" menu). Clicking the row body fires `onOpen` (opens the details sheet).

**Files:**
- Create: `components/private-lessons/manage/BookingRow.tsx`
- Create: `__tests__/components/manage/BookingRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/manage/BookingRow.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingRow } from '@/components/private-lessons/manage/BookingRow';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

const mkBooking = (
  over: Partial<LessonBookingWithDetails> = {},
): LessonBookingWithDetails =>
  ({
    id: 'b1',
    lesson_title: 'Beginner Bachata',
    student_name: 'Maria',
    student_email: 'm@example.com',
    scheduled_at: '2026-05-20T15:00:00Z',
    duration_minutes: 60,
    lesson_status: 'booked',
    payment_status: 'succeeded',
    viewer_role: 'teacher',
    community_name: 'Studio',
    price_paid: '40',
    cancellation_cutoff_hours: 24,
    late_refund_policy: 'no_refund',
    daily_room_name: null,
    ...over,
  } as unknown as LessonBookingWithDetails);

test('renders student name and lesson title', () => {
  render(
    <BookingRow
      booking={mkBooking()}
      canJoinVideo={false}
      onOpen={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByText(/Maria · Beginner Bachata/)).toBeInTheDocument();
});

test('renders Join button when canJoinVideo is true', () => {
  render(
    <BookingRow
      booking={mkBooking({ daily_room_name: 'room-1' })}
      canJoinVideo={true}
      onOpen={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole('link', { name: /join/i })).toBeInTheDocument();
});

test('does not render Join button when canJoinVideo is false', () => {
  render(
    <BookingRow
      booking={mkBooking()}
      canJoinVideo={false}
      onOpen={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByRole('link', { name: /join/i })).not.toBeInTheDocument();
});

test('clicking the row body calls onOpen', async () => {
  const onOpen = jest.fn();
  render(
    <BookingRow
      booking={mkBooking()}
      canJoinVideo={false}
      onOpen={onOpen}
      onCancel={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /open booking details/i }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test __tests__/components/manage/BookingRow.test.tsx 2>&1 | tail -10
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `BookingRow.tsx`**

Create `components/private-lessons/manage/BookingRow.tsx`:

```tsx
"use client";

import React from 'react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Mail } from 'lucide-react';
import { formatInTz } from '@/lib/timezone';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

interface BookingRowProps {
  booking: LessonBookingWithDetails;
  canJoinVideo: boolean;
  onOpen: () => void;
  onCancel: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function BookingRow({
  booking,
  canJoinVideo,
  onOpen,
  onCancel,
}: BookingRowProps) {
  const tz = useUserTimezone();
  const displayName = booking.student_name || booking.student_email || 'Student';

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {initials(displayName)}
      </div>

      <button
        type="button"
        aria-label="Open booking details"
        onClick={onOpen}
        className="flex-1 text-left min-w-0"
      >
        <div className="text-sm font-medium truncate">
          {displayName} · {booking.lesson_title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {booking.scheduled_at
            ? formatInTz(new Date(booking.scheduled_at), tz, 'EEE, MMM d · h:mm a')
            : 'No time set'}
        </div>
      </button>

      <div className="flex items-center gap-2 flex-shrink-0">
        {canJoinVideo && booking.daily_room_name ? (
          <Button asChild size="sm" className="rounded-xl">
            <Link href={`/video-session/${booking.id}`}>Join</Link>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>View details</DropdownMenuItem>
            {booking.student_email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${booking.student_email}`}>
                  <Mail className="h-3.5 w-3.5 mr-2" /> Contact student
                </a>
              </DropdownMenuItem>
            )}
            {(booking.lesson_status === 'booked' ||
              booking.lesson_status === 'scheduled') && (
              <DropdownMenuItem
                onClick={onCancel}
                className="text-destructive focus:text-destructive"
              >
                Cancel booking
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
bun test __tests__/components/manage/BookingRow.test.tsx 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/private-lessons/manage/BookingRow.tsx __tests__/components/manage/BookingRow.test.tsx
git commit -m "feat(pl-manage): BookingRow with Join button and ⋯ menu"
```

---

### Task 7: Build `BookingsTab`

Bookings tab owns its data: fetches `/api/community/[slug]/lesson-bookings`, groups via `groupBookings`, renders sections (Today / This week / Upcoming / Past / Canceled). Past and Canceled sections are collapsed by default. Hides empty sections. Owns the `BookingDetailsSheet` and the `CancelLessonModal` (existing).

**Files:**
- Create: `components/private-lessons/manage/BookingsTab.tsx`

- [ ] **Step 1: Implement `BookingsTab.tsx`**

Create `components/private-lessons/manage/BookingsTab.tsx`:

```tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { CancelLessonModal } from '@/components/CancelLessonModal';
import { groupBookings, type BookingGroup } from '@/lib/booking-grouping';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { BookingRow } from './BookingRow';
import { BookingDetailsSheet } from './BookingDetailsSheet';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

interface BookingsTabProps {
  communitySlug: string;
}

const GRACE_MS = 15 * 60_000;

function canJoinVideoFor(booking: LessonBookingWithDetails): boolean {
  if (booking.payment_status !== 'succeeded') return false;
  if (!booking.daily_room_name) return false;
  if (booking.lesson_status === 'canceled' || booking.lesson_status === 'completed')
    return false;
  if (!booking.scheduled_at) return true;
  const start = new Date(booking.scheduled_at).getTime();
  const end = start + (booking.duration_minutes ?? 60) * 60_000;
  const fifteenBefore = start - 15 * 60_000;
  return Date.now() >= fifteenBefore && Date.now() <= end + GRACE_MS;
}

function expectedRefundCents(
  booking: LessonBookingWithDetails,
): number {
  const pricePaid = Number(booking.price_paid);
  if (booking.viewer_role === 'teacher') return Math.round(pricePaid * 100);
  if (!booking.scheduled_at) return Math.round(pricePaid * 100);
  const scheduledMs = new Date(booking.scheduled_at).getTime();
  const cutoffMs =
    scheduledMs - (booking.cancellation_cutoff_hours ?? 24) * 3600_000;
  const beforeCutoff = Date.now() <= cutoffMs;
  if (beforeCutoff || booking.late_refund_policy === 'refund') {
    return Math.round(pricePaid * 100);
  }
  return 0;
}

interface SectionProps {
  title: string;
  count: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

function Section({ title, count, collapsible, defaultCollapsed, children }: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  if (count === 0) return null;
  return (
    <section className="border border-border/50 rounded-2xl bg-card overflow-hidden">
      <button
        type="button"
        onClick={collapsible ? () => setCollapsed(c => !c) : undefined}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          {collapsible &&
            (collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            ))}
          {title}
        </span>
        <span>{count}</span>
      </button>
      {!collapsed && <div className="divide-y divide-border/50">{children}</div>}
    </section>
  );
}

export function BookingsTab({ communitySlug }: BookingsTabProps) {
  const tz = useUserTimezone();
  const [bookings, setBookings] = useState<LessonBookingWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const [selected, setSelected] = useState<LessonBookingWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LessonBookingWithDetails | null>(null);

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/community/${communitySlug}/lesson-bookings`);
      if (res.ok) setBookings(await res.json());
    } catch (e) {
      console.error('Failed to load bookings', e);
    } finally {
      setIsLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Refresh "now" every minute so Join-button visibility stays current.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const groups: BookingGroup = useMemo(
    () => groupBookings(bookings, now, tz),
    [bookings, now, tz],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No bookings yet. Students will appear here when they reserve a lesson.
      </div>
    );
  }

  const renderRow = (booking: LessonBookingWithDetails) => (
    <BookingRow
      key={booking.id}
      booking={booking}
      canJoinVideo={canJoinVideoFor(booking)}
      onOpen={() => {
        setSelected(booking);
        setSheetOpen(true);
      }}
      onCancel={() => setCancelTarget(booking)}
    />
  );

  return (
    <>
      <div className="space-y-4">
        <Section title="Today" count={groups.today.length}>
          {groups.today.map(renderRow)}
        </Section>
        <Section title="This week" count={groups.thisWeek.length}>
          {groups.thisWeek.map(renderRow)}
        </Section>
        <Section title="Upcoming" count={groups.upcoming.length}>
          {groups.upcoming.map(renderRow)}
        </Section>
        <Section
          title="Past"
          count={groups.past.length}
          collapsible
          defaultCollapsed
        >
          {groups.past.map(renderRow)}
        </Section>
        <Section
          title="Canceled"
          count={groups.canceled.length}
          collapsible
          defaultCollapsed
        >
          {groups.canceled.map(renderRow)}
        </Section>
      </div>

      <BookingDetailsSheet
        booking={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        canJoinVideo={selected ? canJoinVideoFor(selected) : false}
        onCancel={() => {
          if (selected) setCancelTarget(selected);
          setSheetOpen(false);
        }}
      />

      {cancelTarget && (
        <CancelLessonModal
          isOpen={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            fetchBookings();
          }}
          bookingId={cancelTarget.id}
          lessonTitle={cancelTarget.lesson_title}
          scheduledAtIso={cancelTarget.scheduled_at ?? null}
          currency="EUR"
          role={cancelTarget.viewer_role}
          expectedRefundCents={expectedRefundCents(cancelTarget)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | grep "BookingsTab" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/private-lessons/manage/BookingsTab.tsx
git commit -m "feat(pl-manage): BookingsTab with grouped timeline and details sheet"
```

---

### Task 8: Build `AvailabilityDayPanel` with tests

Day panel that replaces the dialog. Receives a `selectedDate`, the slots for that day, an `onAdd` callback, and an `onDelete` callback. Renders the slot list and an inline add form with validation (end after start, no overlap).

**Files:**
- Create: `components/private-lessons/manage/AvailabilityDayPanel.tsx`
- Create: `__tests__/components/manage/AvailabilityDayPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/manage/AvailabilityDayPanel.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityDayPanel } from '@/components/private-lessons/manage/AvailabilityDayPanel';

const user = userEvent.setup();

test('renders the placeholder when no date is selected', () => {
  render(
    <AvailabilityDayPanel
      selectedDate={null}
      slots={[]}
      onAdd={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText(/select a day on the calendar/i)).toBeInTheDocument();
});

test('renders the empty state when day has no slots', () => {
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[]}
      onAdd={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText(/no availability set for this day/i)).toBeInTheDocument();
});

test('renders existing slots and triggers onDelete', async () => {
  const onDelete = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[{ id: 's1', start_time: '09:00', end_time: '10:30' }]}
      onAdd={() => {}}
      onDelete={onDelete}
    />,
  );
  expect(screen.getByText(/09:00/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /delete slot 09:00/i }));
  expect(onDelete).toHaveBeenCalledWith('s1');
});

test('rejects an add where end is not after start', async () => {
  const onAdd = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[]}
      onAdd={onAdd}
      onDelete={() => {}}
    />,
  );
  await user.type(screen.getByLabelText(/from/i), '10:00');
  await user.type(screen.getByLabelText(/to/i), '09:00');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
});

test('rejects an add that overlaps an existing slot', async () => {
  const onAdd = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[{ id: 's1', start_time: '09:00', end_time: '10:30' }]}
      onAdd={onAdd}
      onDelete={() => {}}
    />,
  );
  await user.type(screen.getByLabelText(/from/i), '10:00');
  await user.type(screen.getByLabelText(/to/i), '11:00');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(/overlaps an existing slot/i)).toBeInTheDocument();
});

test('valid add calls onAdd and clears inputs', async () => {
  const onAdd = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[]}
      onAdd={onAdd}
      onDelete={() => {}}
    />,
  );
  await user.type(screen.getByLabelText(/from/i), '14:00');
  await user.type(screen.getByLabelText(/to/i), '15:30');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).toHaveBeenCalledWith({ start_time: '14:00', end_time: '15:30' });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
bun test __tests__/components/manage/AvailabilityDayPanel.test.tsx 2>&1 | tail -10
```

Expected: cannot find module.

- [ ] **Step 3: Implement `AvailabilityDayPanel.tsx`**

Create `components/private-lessons/manage/AvailabilityDayPanel.tsx`:

```tsx
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, X, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface AvailabilitySlotView {
  id?: string;
  start_time: string; // "HH:MM"
  end_time: string;
}

interface AvailabilityDayPanelProps {
  selectedDate: string | null; // "YYYY-MM-DD"
  slots: AvailabilitySlotView[];
  onAdd: (slot: { start_time: string; end_time: string }) => void;
  onDelete: (slotId: string) => void;
  isBusy?: boolean;
}

function overlaps(
  a: { start_time: string; end_time: string },
  b: { start_time: string; end_time: string },
): boolean {
  return (
    (a.start_time >= b.start_time && a.start_time < b.end_time) ||
    (a.end_time > b.start_time && a.end_time <= b.end_time) ||
    (a.start_time <= b.start_time && a.end_time >= b.end_time)
  );
}

export function AvailabilityDayPanel({
  selectedDate,
  slots,
  onAdd,
  onDelete,
  isBusy,
}: AvailabilityDayPanelProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!selectedDate) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground h-full flex items-center justify-center">
        Select a day on the calendar to add or edit availability.
      </div>
    );
  }

  const handleAdd = () => {
    setError(null);
    if (!start || !end) {
      setError('Please enter both times.');
      return;
    }
    if (end <= start) {
      setError('End time must be after start time.');
      return;
    }
    const candidate = { start_time: start, end_time: end };
    if (slots.some(s => overlaps(candidate, s))) {
      setError('Overlaps an existing slot.');
      return;
    }
    onAdd(candidate);
    setStart('');
    setEnd('');
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <h3 className="font-display text-base font-semibold mb-3">
        {format(parseISO(selectedDate), 'EEE, MMM d')}
      </h3>

      <div className="space-y-2 mb-4">
        {slots.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-2">
            No availability set for this day.
          </div>
        ) : (
          slots.map(slot => (
            <div
              key={slot.id ?? `${slot.start_time}-${slot.end_time}`}
              className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {slot.start_time} – {slot.end_time}
                </span>
              </div>
              {slot.id && (
                <button
                  type="button"
                  aria-label={`Delete slot ${slot.start_time}`}
                  onClick={() => onDelete(slot.id!)}
                  className="text-muted-foreground hover:text-destructive p-1 rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border/50 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="add-from" className="text-xs">From</Label>
            <Input
              id="add-from"
              type="time"
              value={start}
              onChange={e => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="add-to" className="text-xs">To</Label>
            <Input
              id="add-to"
              type="time"
              value={end}
              onChange={e => setEnd(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}
        <Button
          type="button"
          onClick={handleAdd}
          disabled={isBusy}
          className="w-full rounded-xl"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add slot
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
bun test __tests__/components/manage/AvailabilityDayPanel.test.tsx 2>&1 | tail -10
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/private-lessons/manage/AvailabilityDayPanel.tsx __tests__/components/manage/AvailabilityDayPanel.test.tsx
git commit -m "feat(pl-manage): AvailabilityDayPanel with inline add form and validation"
```

---

### Task 9: Refactor `TeacherCalendarAvailability` + build `AvailabilityTab`

Strip the embedded dialog from `TeacherCalendarAvailability`. Add controlled `selectedDate` and `onSelectDate` props so the parent decides what to render when a day is clicked. Build `AvailabilityTab` as the composer that fetches availability, manages selected date, owns add/delete handlers, and renders calendar + day panel side by side.

**Files:**
- Modify: `components/TeacherCalendarAvailability.tsx`
- Create: `components/private-lessons/manage/AvailabilityTab.tsx`

- [ ] **Step 1: Refactor `TeacherCalendarAvailability.tsx`**

Open `components/TeacherCalendarAvailability.tsx`. Make these changes:

1. **Change the props interface** to accept controlled selection and remove the update callback (the parent will own the data and refetch):

```typescript
interface TeacherCalendarAvailabilityProps {
  communitySlug: string;
  availability: DayAvailability[];
  selectedDate: string | null;
  onSelectDate: (dateIso: string) => void;
}
```

2. **Update the function signature** to destructure these new props instead of `onAvailabilityUpdate`.

3. **Remove all dialog-related code**: the `ResponsiveDialog`/`ResponsiveDialogContent`/`ResponsiveDialogHeader`/`ResponsiveDialogTitle` imports, the `isDialogOpen`/`setIsDialogOpen` state, the `newSlot`/`setNewSlot` state, the `isLoading`/`setIsLoading` state, the `handleAddSlot` function, the `handleDeleteSlot` function, and the entire `<ResponsiveDialog>` JSX block at the bottom of the return.

4. **Replace the day-cell click handler** that currently opens the dialog. The click should now call `onSelectDate(formatDate(date))`. The day cell visually shows the `selected` state when its formatted date equals `selectedDate`.

5. **Add a "selected" visual state** to the day cells — when `formatDate(date) === selectedDate`, add a strong primary-color border:

```typescript
const isSelected = selectedDate === formatDate(date);
// in className:
isSelected && "ring-2 ring-primary ring-offset-1"
```

After the refactor, `TeacherCalendarAvailability` is purely a presentation calendar — no API calls, no dialog, no slot management.

- [ ] **Step 2: TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | grep "TeacherCalendarAvailability" | head -10
```

There may be type errors in any other caller of `TeacherCalendarAvailability` (likely none — `PrivateLessonManagementModal` is the only caller, and we'll rewire it in Task 10). Confirm no other callers:

```bash
grep -rn "TeacherCalendarAvailability" /home/debian/apps/dance-hub-pl-redesign --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v __tests__
```

Expected: only the file itself and `PrivateLessonManagementModal.tsx` reference it.

- [ ] **Step 3: Implement `AvailabilityTab.tsx`**

Create `components/private-lessons/manage/AvailabilityTab.tsx`:

```tsx
"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import TeacherCalendarAvailability from '@/components/TeacherCalendarAvailability';
import { useAuth } from '@/contexts/AuthContext';
import { AvailabilityDayPanel } from './AvailabilityDayPanel';

interface AvailabilityTabProps {
  communitySlug: string;
}

interface TimeSlot {
  id?: string;
  start_time: string;
  end_time: string;
}

interface DayAvailability {
  date: string;
  slots: TimeSlot[];
}

export function AvailabilityTab({ communitySlug }: AvailabilityTabProps) {
  const { session } = useAuth();
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fetchAvailability = useCallback(async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const ninetyDaysOut = new Date(today);
      ninetyDaysOut.setDate(today.getDate() + 90);
      const endDate = `${ninetyDaysOut.getFullYear()}-${String(ninetyDaysOut.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysOut.getDate()).padStart(2, '0')}`;

      const res = await fetch(
        `/api/community/${communitySlug}/teacher-availability?startDate=${startDate}&endDate=${endDate}`,
      );
      if (!res.ok) return;
      const slots: Array<{
        id: string;
        availability_date: string;
        start_time: string;
        end_time: string;
      }> = await res.json();

      const grouped = new Map<string, TimeSlot[]>();
      for (const s of slots) {
        const arr = grouped.get(s.availability_date) ?? [];
        arr.push({
          id: s.id,
          start_time: s.start_time.slice(0, 5),
          end_time: s.end_time.slice(0, 5),
        });
        grouped.set(s.availability_date, arr);
      }
      const days: DayAvailability[] = Array.from(grouped.entries()).map(
        ([date, slots]) => ({
          date,
          slots: slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
        }),
      );
      setAvailability(days);
    } catch (e) {
      console.error('Failed to load availability', e);
    } finally {
      setIsLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const slotsForSelected: TimeSlot[] = selectedDate
    ? availability.find(a => a.date === selectedDate)?.slots ?? []
    : [];

  const handleAdd = async (slot: { start_time: string; end_time: string }) => {
    if (!selectedDate) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/teacher-availability`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate, ...slot }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? 'Failed to add slot');
        return;
      }
      toast.success('Slot added');
      await fetchAvailability();
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (slotId: string) => {
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/teacher-availability?slotId=${slotId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error('Failed to delete slot');
        return;
      }
      toast.success('Slot removed');
      await fetchAvailability();
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <TeacherCalendarAvailability
        communitySlug={communitySlug}
        availability={availability}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      <AvailabilityDayPanel
        selectedDate={selectedDate}
        slots={slotsForSelected}
        onAdd={handleAdd}
        onDelete={handleDelete}
        isBusy={isBusy}
      />
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | grep -E "AvailabilityTab|TeacherCalendarAvailability" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/TeacherCalendarAvailability.tsx components/private-lessons/manage/AvailabilityTab.tsx
git commit -m "feat(pl-manage): inline AvailabilityTab replaces dialog-based slot editor"
```

---

### Task 10: Wire the modal shell to the three new tabs

Slim down `PrivateLessonManagementModal` to just the dialog frame + three tabs (`Lessons`, `Bookings`, `Availability`) that delegate to the tab components. Remove all the inline data fetching and rendering that's now in the tabs. Resize to `max-w-5xl` × `h-[85vh]`.

**Files:**
- Modify: `components/private-lessons/manage/PrivateLessonManagementModal.tsx`

- [ ] **Step 1: Replace the modal contents**

Replace the entire contents of `components/private-lessons/manage/PrivateLessonManagementModal.tsx` with:

```tsx
"use client";

import React, { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { LessonsTab } from './LessonsTab';
import { BookingsTab } from './BookingsTab';
import { AvailabilityTab } from './AvailabilityTab';

interface PrivateLessonManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communitySlug: string;
  /** Fires after lessons change so the parent page can refresh its grid. */
  onLessonsChanged?: () => void;
}

type TabKey = 'lessons' | 'bookings' | 'availability';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'lessons', label: 'Lessons' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'availability', label: 'Availability' },
];

export default function PrivateLessonManagementModal({
  isOpen,
  onClose,
  communityId,
  communitySlug,
  onLessonsChanged,
}: PrivateLessonManagementModalProps) {
  const [active, setActive] = useState<TabKey>('lessons');

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-5xl h-[85vh] bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                  <Dialog.Title className="font-display text-lg font-semibold">
                    Manage Private Lessons
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="px-5 border-b border-border/50">
                  <nav className="flex gap-1 -mb-px">
                    {TABS.map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActive(tab.key)}
                        className={cn(
                          'px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
                          active === tab.key
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {active === 'lessons' && (
                    <LessonsTab
                      communityId={communityId}
                      communitySlug={communitySlug}
                      onLessonsChanged={onLessonsChanged}
                    />
                  )}
                  {active === 'bookings' && (
                    <BookingsTab communitySlug={communitySlug} />
                  )}
                  {active === 'availability' && (
                    <AvailabilityTab communitySlug={communitySlug} />
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
```

This file should drop from ~724 lines to ~120 lines.

- [ ] **Step 2: Run full TypeScript check**

```bash
bun run tsc --noEmit 2>&1 | grep -v "e2e/stripe" | head -20
```

Expected: zero new errors.

- [ ] **Step 3: Run all the new tests**

```bash
bun test __tests__/lib/booking-grouping.test.ts __tests__/components/manage/ 2>&1 | tail -20
```

Expected: all new tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/private-lessons/manage/PrivateLessonManagementModal.tsx
git commit -m "feat(pl-manage): slim modal shell delegating to 3 tab components"
```

---

## Self-Review

**Spec coverage:**

- ✅ Modal stays as modal, resized to `max-w-5xl × h-[85vh]` → Task 10
- ✅ Three tabs (Lessons / Bookings / Availability) → Task 10
- ✅ Drop stats header → Task 10 (not included in new shell)
- ✅ Lessons grid 1/2/3 columns → Task 4
- ✅ Compact LessonCard with hero price + ⋯ menu → Task 3
- ✅ "+ New lesson" dashed tile → Task 4
- ✅ Click card body → CreatePrivateLessonModal in edit mode → Task 4
- ✅ Bookings grouped Today / This week / Upcoming / Past / Canceled → Task 7
- ✅ Past + Canceled collapsed by default → Task 7
- ✅ Empty sections hidden → Task 7 (`if (count === 0) return null`)
- ✅ Join button visible only within join window → Task 7 (`canJoinVideoFor`)
- ✅ Click row → BookingDetailsSheet → Task 6 + Task 7
- ✅ Status badges in sheet header, not on rows → Task 5
- ✅ Availability two-column layout, stacked on mobile → Task 9 (`grid-cols-1 lg:grid-cols-[1fr_320px]`)
- ✅ No more dialog for adding slots → Task 8 + Task 9
- ✅ Slot validation: end after start, no overlap → Task 8
- ✅ Times throughout in viewer's timezone → Tasks 5, 6, 7 (use `useUserTimezone` + `formatInTz`)
- ✅ Modal shell delegates → Task 10
- ✅ `CreatePrivateLessonModal` reused as-is → Task 4

**Placeholder scan:** Clean. Every step has concrete code or a concrete command.

**Type consistency:** All shared types (`PrivateLesson`, `LessonBookingWithDetails`, `TeacherAvailabilitySlot`) come from `@/types/private-lessons`. Props interfaces are defined in each component file and used consistently in tests + composers. `BookingGroup` is exported from `lib/booking-grouping.ts` and imported in `BookingsTab.tsx`. `AvailabilitySlotView` is exported from `AvailabilityDayPanel.tsx` for any future consumer.

**Cross-task dependencies:**
- Task 3 (LessonCard) before Task 4 (LessonsTab uses it)
- Task 2 (grouping util) before Task 7 (BookingsTab uses it)
- Task 5 (Sheet) and Task 6 (Row) before Task 7 (BookingsTab uses both)
- Task 8 (DayPanel) before Task 9 (AvailabilityTab uses it)
- Task 9 (AvailabilityTab) before Task 10 (modal uses all three tabs)
- Tasks 2, 3, 5, 6, 8 are independent and can run in parallel
- Tasks 4, 7, 9 depend on subsets of above and can be parallelised once dependencies land
- Task 10 is the final integration
