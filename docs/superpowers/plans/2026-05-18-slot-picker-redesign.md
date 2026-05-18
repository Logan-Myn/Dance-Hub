# Slot picker redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 30-day scrolling list in `LessonBookingModal` with a week-strip + time-chip-grid picker that scales to any number of slots.

**Architecture:** Three layers — pure date/slot utilities in `lib/slot-grouping.ts`, a self-contained `<WeekSlotPicker />` client component, and a small replacement inside `LessonBookingModal.tsx`. Backend API and data model are unchanged; this is a pure frontend redesign.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind, Jest + React Testing Library. Worktree: `/home/debian/apps/dance-hub-cron-fix`, branch `feat/slot-picker-redesign`.

**Spec:** `docs/superpowers/specs/2026-05-18-slot-picker-redesign-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/slot-grouping.ts` (new) | Pure helpers: date math, week-day list, slot-by-date grouping, smart-jump search. |
| `__tests__/lib/slot-grouping.test.ts` (new) | Unit tests for every helper. |
| `components/WeekSlotPicker.tsx` (new) | The picker UI — internal state for `weekStartDate` and `selectedDate`, week nav, day strip, time chips, empty states. |
| `__tests__/components/WeekSlotPicker.test.tsx` (new) | Component tests covering rendering, interaction, navigation, edge cases. |
| `components/LessonBookingModal.tsx` (modify) | Delete the slot-list block at lines ~273–320, render `<WeekSlotPicker />` in its place. |

Run tests with `bun test` from the worktree root. Lib tests are jsdom (`bun test:lib`); component tests are jsdom (`bun test:components`).

---

## Task 1: Slot grouping & date utilities

**Files:**
- Create: `lib/slot-grouping.ts`
- Test: `__tests__/lib/slot-grouping.test.ts`

These are pure, deterministic helpers — easy to TDD.

- [ ] **Step 1: Write the failing test file**

Create `__tests__/lib/slot-grouping.test.ts`:

```ts
import {
  addDays,
  toDateString,
  getWeekDays,
  groupSlotsByDate,
  findFirstWeekWithSlots,
} from '@/lib/slot-grouping';
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';

const mkSlot = (date: string, start = '09:00'): TeacherAvailabilitySlot => ({
  id: `${date}-${start}`,
  teacher_id: 't',
  community_id: 'c',
  availability_date: date,
  start_time: start,
  end_time: '10:00',
  is_active: true,
  created_at: '',
  updated_at: '',
});

describe('addDays', () => {
  it('adds days without mutating the input', () => {
    const base = new Date('2026-05-18T00:00:00');
    const out = addDays(base, 3);
    expect(toDateString(out)).toBe('2026-05-21');
    expect(toDateString(base)).toBe('2026-05-18');
  });

  it('handles negatives', () => {
    expect(toDateString(addDays(new Date('2026-05-18T00:00:00'), -1))).toBe('2026-05-17');
  });
});

describe('toDateString', () => {
  it('formats as YYYY-MM-DD using local calendar (no UTC drift)', () => {
    expect(toDateString(new Date('2026-05-18T23:30:00'))).toBe('2026-05-18');
    expect(toDateString(new Date('2026-01-05T00:00:00'))).toBe('2026-01-05');
  });
});

describe('getWeekDays', () => {
  it('returns 7 consecutive YYYY-MM-DD strings starting from the given date', () => {
    const result = getWeekDays(new Date('2026-05-18T00:00:00'));
    expect(result).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ]);
  });
});

describe('groupSlotsByDate', () => {
  it('groups slots into a Map keyed by availability_date', () => {
    const slots = [
      mkSlot('2026-05-18', '09:00'),
      mkSlot('2026-05-18', '10:00'),
      mkSlot('2026-05-20', '14:00'),
    ];
    const grouped = groupSlotsByDate(slots);
    expect(grouped.get('2026-05-18')?.map(s => s.start_time)).toEqual(['09:00', '10:00']);
    expect(grouped.get('2026-05-20')?.map(s => s.start_time)).toEqual(['14:00']);
    expect(grouped.get('2026-05-19')).toBeUndefined();
  });

  it('sorts slots within a day ascending by start_time', () => {
    const slots = [
      mkSlot('2026-05-18', '14:00'),
      mkSlot('2026-05-18', '09:00'),
      mkSlot('2026-05-18', '11:00'),
    ];
    const grouped = groupSlotsByDate(slots);
    expect(grouped.get('2026-05-18')?.map(s => s.start_time)).toEqual(['09:00', '11:00', '14:00']);
  });

  it('returns an empty map for empty input', () => {
    expect(groupSlotsByDate([]).size).toBe(0);
  });
});

describe('findFirstWeekWithSlots', () => {
  const today = new Date('2026-05-18T00:00:00');

  it('returns startFrom when slots exist within the first 7 days', () => {
    const slots = [mkSlot('2026-05-20')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    expect(result && toDateString(result)).toBe('2026-05-18');
  });

  it('jumps forward to the next 7-day window when the first is empty', () => {
    const slots = [mkSlot('2026-05-27')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    expect(result && toDateString(result)).toBe('2026-05-25');
  });

  it('jumps multiple windows', () => {
    const slots = [mkSlot('2026-06-12')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    // windows: [05-18..05-24], [05-25..05-31], [06-01..06-07], [06-08..06-14]
    expect(result && toDateString(result)).toBe('2026-06-08');
  });

  it('returns null when no slots exist within the horizon', () => {
    const slots = [mkSlot('2026-08-01')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    expect(result).toBeNull();
  });

  it('returns null for empty slots', () => {
    expect(findFirstWeekWithSlots([], today, 30)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:lib slot-grouping`
Expected: ALL tests fail with "Cannot find module '@/lib/slot-grouping'".

- [ ] **Step 3: Implement the utilities**

Create `lib/slot-grouping.ts`:

```ts
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';

/** Returns a new Date with `days` added. Does not mutate input. */
export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Formats a Date as YYYY-MM-DD using its local calendar components.
 * Avoids the UTC-shift bug of `toISOString().split('T')[0]` for times near midnight.
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns 7 YYYY-MM-DD strings starting from `start`. */
export function getWeekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toDateString(addDays(start, i)));
}

/**
 * Groups slots by `availability_date`. Slots within a day are sorted ascending
 * by `start_time`.
 */
export function groupSlotsByDate(
  slots: TeacherAvailabilitySlot[]
): Map<string, TeacherAvailabilitySlot[]> {
  const map = new Map<string, TeacherAvailabilitySlot[]>();
  for (const slot of slots) {
    const list = map.get(slot.availability_date) ?? [];
    list.push(slot);
    map.set(slot.availability_date, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return map;
}

/**
 * Searches forward in 7-day windows for the first window containing at least
 * one slot. Returns the start Date of that window, or null if no slot exists
 * within `horizonDays` from `startFrom`.
 */
export function findFirstWeekWithSlots(
  slots: TeacherAvailabilitySlot[],
  startFrom: Date,
  horizonDays: number
): Date | null {
  if (slots.length === 0) return null;
  const grouped = groupSlotsByDate(slots);
  for (let offset = 0; offset < horizonDays; offset += 7) {
    const windowStart = addDays(startFrom, offset);
    for (const date of getWeekDays(windowStart)) {
      if (grouped.has(date)) return windowStart;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:lib slot-grouping`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-cron-fix
git add lib/slot-grouping.ts __tests__/lib/slot-grouping.test.ts
git commit -m "feat(slot-picker): pure utilities for week-based slot grouping"
```

---

## Task 2: `<WeekSlotPicker />` component

**Files:**
- Create: `components/WeekSlotPicker.tsx`
- Test: `__tests__/components/WeekSlotPicker.test.tsx`

The picker is self-contained: takes a flat list of future slots + a selected id + an onSelect callback. Internal state handles the week view and selected day.

- [ ] **Step 1: Write failing component tests**

Create `__tests__/components/WeekSlotPicker.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekSlotPicker } from '@/components/WeekSlotPicker';
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';

const mkSlot = (date: string, start: string): TeacherAvailabilitySlot => ({
  id: `${date}-${start}`,
  teacher_id: 't',
  community_id: 'c',
  availability_date: date,
  start_time: start,
  end_time: start.replace(/^(\d{2}):(\d{2})$/, (_, h) => `${String(Number(h) + 1).padStart(2, '0')}:00`),
  is_active: true,
  created_at: '',
  updated_at: '',
});

// Freeze "today" to make tests deterministic.
const TODAY = new Date('2026-05-18T10:00:00');
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
});
afterAll(() => {
  jest.useRealTimers();
});

test('renders the loading skeleton when loading=true', () => {
  render(<WeekSlotPicker loading slots={[]} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByTestId('week-slot-picker-skeleton')).toBeInTheDocument();
});

test('renders the empty state when no slots exist within the horizon', () => {
  render(<WeekSlotPicker slots={[]} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByText(/no availability in the next 30 days/i)).toBeInTheDocument();
});

test('lands on today + 6 days when there is a slot in that window', () => {
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-05-21', '14:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByText(/May 18\s*–\s*24/i)).toBeInTheDocument();
});

test('auto-selects the first day with slots on mount', () => {
  const slots = [mkSlot('2026-05-20', '09:00'), mkSlot('2026-05-20', '11:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  // Time chips for May 20 should be visible.
  expect(screen.getByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '11:00 AM' })).toBeInTheDocument();
});

test('smart-jumps to the first week with slots when the current week is empty', () => {
  const slots = [mkSlot('2026-05-28', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  // 7-day windows from 2026-05-18: [05-18..05-24], [05-25..05-31]. Jump to second.
  expect(screen.getByText(/May 25\s*–\s*31/i)).toBeInTheDocument();
});

test('greys out and blocks clicks on days with no slots', async () => {
  const slots = [mkSlot('2026-05-20', '09:00')];
  const onSelect = jest.fn();
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={onSelect} />);

  // The Mon (2026-05-18) chip has no slots — it should be disabled.
  const monChip = screen.getByRole('button', { name: /MON 18/i });
  expect(monChip).toBeDisabled();

  await userEvent.click(monChip);
  expect(onSelect).not.toHaveBeenCalled();
});

test('clicking a day with slots shows that day’s chips', async () => {
  const slots = [
    mkSlot('2026-05-19', '09:00'),
    mkSlot('2026-05-21', '14:00'),
    mkSlot('2026-05-21', '15:00'),
  ];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  await userEvent.click(screen.getByRole('button', { name: /THU 21/i }));
  expect(screen.getByRole('button', { name: '2:00 PM' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '3:00 PM' })).toBeInTheDocument();
});

test('clicking a time chip calls onSelect with that slot', async () => {
  const slots = [mkSlot('2026-05-19', '09:00')];
  const onSelect = jest.fn();
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={onSelect} />);

  await userEvent.click(screen.getByRole('button', { name: '9:00 AM' }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2026-05-19-09:00' }));
});

test('Prev is disabled in the landing week (today is the earliest)', () => {
  const slots = [mkSlot('2026-05-19', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: /previous week/i })).toBeDisabled();
});

test('Next navigates forward and auto-selects the new week’s first available day', async () => {
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-05-27', '14:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  await userEvent.click(screen.getByRole('button', { name: /next week/i }));
  expect(screen.getByText(/May 25\s*–\s*31/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2:00 PM' })).toBeInTheDocument();
});

test('shows a "no slots this week" message when nav lands on an empty week', async () => {
  // First week has a slot, second is empty, third has a slot — user navigates Next once.
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-06-02', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  await userEvent.click(screen.getByRole('button', { name: /next week/i }));
  expect(screen.getByText(/no slots this week/i)).toBeInTheDocument();
});

test('Next is disabled at the 30-day horizon', async () => {
  // Slot at day 29 so we can reach the horizon
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-06-15', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  // Click Next 4 times to advance through windows: 05-18, 05-25, 06-01, 06-08, 06-15.
  // After 4 clicks weekStart = 06-15, which equals today + 28 — still <= horizon.
  for (let i = 0; i < 4; i++) {
    await userEvent.click(screen.getByRole('button', { name: /next week/i }));
  }
  expect(screen.getByRole('button', { name: /next week/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:components WeekSlotPicker`
Expected: All tests fail — module `@/components/WeekSlotPicker` does not exist.

- [ ] **Step 3: Implement `WeekSlotPicker`**

Create `components/WeekSlotPicker.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';
import {
  addDays,
  toDateString,
  getWeekDays,
  groupSlotsByDate,
  findFirstWeekWithSlots,
} from '@/lib/slot-grouping';
import { formatSlotTime, cn } from '@/lib/utils';

const HORIZON_DAYS = 30;
const DAY_ABBREV = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type WeekSlotPickerProps = {
  slots: TeacherAvailabilitySlot[];
  selectedSlotId: string | null;
  onSelect: (slot: TeacherAvailabilitySlot) => void;
  loading?: boolean;
};

function todayAtMidnight(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function formatWeekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

export function WeekSlotPicker({ slots, selectedSlotId, onSelect, loading }: WeekSlotPickerProps) {
  const today = useMemo(() => todayAtMidnight(), []);
  const slotsByDate = useMemo(() => groupSlotsByDate(slots), [slots]);

  const initialWeekStart = useMemo(
    () => findFirstWeekWithSlots(slots, today, HORIZON_DAYS) ?? today,
    [slots, today]
  );

  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // On mount and when slots prop changes meaningfully, anchor the week + auto-select first available day.
  useEffect(() => {
    setWeekStart(initialWeekStart);
    const firstAvailable = getWeekDays(initialWeekStart).find((d) => slotsByDate.has(d));
    setSelectedDate(firstAvailable ?? null);
  }, [initialWeekStart, slotsByDate]);

  if (loading) {
    return (
      <div data-testid="week-slot-picker-skeleton" className="space-y-3">
        <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (slots.length === 0 || findFirstWeekWithSlots(slots, today, HORIZON_DAYS) === null) {
    return (
      <div className="text-center py-4 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        No availability in the next 30 days. Please contact the teacher directly.
      </div>
    );
  }

  const weekDays = getWeekDays(weekStart);
  const horizonEnd = addDays(today, HORIZON_DAYS - 1);
  const canGoPrev = weekStart > today;
  const canGoNext = addDays(weekStart, 7) <= horizonEnd;

  const goPrev = () => {
    const next = addDays(weekStart, -7);
    const clamped = next < today ? today : next;
    setWeekStart(clamped);
    const firstAvailable = getWeekDays(clamped).find((d) => slotsByDate.has(d));
    setSelectedDate(firstAvailable ?? null);
  };

  const goNext = () => {
    const next = addDays(weekStart, 7);
    setWeekStart(next);
    const firstAvailable = getWeekDays(next).find((d) => slotsByDate.has(d));
    setSelectedDate(firstAvailable ?? null);
  };

  const selectedSlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="Previous week"
          className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium">{formatWeekRangeLabel(weekStart)}</div>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          aria-label="Next week"
          className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((date) => {
          const d = new Date(`${date}T00:00:00`);
          const dayLabel = DAY_ABBREV[d.getDay()];
          const dateNum = d.getDate();
          const hasSlots = slotsByDate.has(date);
          const isSelected = selectedDate === date;

          return (
            <button
              key={date}
              type="button"
              onClick={() => hasSlots && setSelectedDate(date)}
              disabled={!hasSlots}
              aria-label={`${dayLabel} ${dateNum}`}
              className={cn(
                'flex flex-col items-center py-2 rounded-lg border transition-colors',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : hasSlots
                  ? 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 text-gray-400 cursor-not-allowed'
              )}
            >
              <span className="text-[10px] font-medium tracking-wide">{dayLabel}</span>
              <span className="text-sm font-semibold">{dateNum}</span>
              {hasSlots && <span className="w-1 h-1 rounded-full bg-blue-500 mt-1" />}
            </button>
          );
        })}
      </div>

      {selectedDate && selectedSlots.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedSlots.map((slot) => {
              const isSelected = slot.id === selectedSlotId;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelect(slot)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm transition-colors',
                    isSelected
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  {formatSlotTime(slot.start_time)}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-3 text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
          No slots this week. Try Next week.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run component tests to verify all pass**

Run: `bun test:components WeekSlotPicker`
Expected: all green. If any test fails because Jest's fake-timer fixture and `useMemo(today)` interact poorly, set `today` via `jest.setSystemTime` BEFORE rendering — the tests above already do this in `beforeAll`.

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-cron-fix
git add components/WeekSlotPicker.tsx __tests__/components/WeekSlotPicker.test.tsx
git commit -m "feat(slot-picker): week-strip + chip-grid component with smart-jump"
```

---

## Task 3: Wire into `LessonBookingModal`

**Files:**
- Modify: `components/LessonBookingModal.tsx` (lines ~273–320 — the entire `{/* Available Time Slots */}` block)

The modal already fetches slots into `availableSlots` and tracks `selectedSlot`. We swap the JSX block; the data flow is unchanged.

- [ ] **Step 1: Add the import**

In `components/LessonBookingModal.tsx`, after the existing imports (around line 17), add:

```tsx
import { WeekSlotPicker } from './WeekSlotPicker';
```

- [ ] **Step 2: Replace the slot-list block**

Replace lines ~273–320 (the entire `{/* Available Time Slots */}` `<div className="space-y-3">…</div>` block) with:

```tsx
{/* Available Time Slots */}
<div className="space-y-3">
  <div className="flex items-center gap-2">
    <Calendar className="w-4 h-4" />
    <Label className="text-base font-medium">Select a time *</Label>
  </div>
  <WeekSlotPicker
    slots={availableSlots}
    selectedSlotId={selectedSlot?.id ?? null}
    onSelect={setSelectedSlot}
    loading={availabilityLoading}
  />
</div>
```

Note: `formatSlotTime` was only used inside the removed block. Check if it's still imported elsewhere in this file; if not, remove it from the import on line 15. (Quick grep: `grep -n formatSlotTime components/LessonBookingModal.tsx`.)

- [ ] **Step 3: Run the existing test suite for the modal area**

Run: `bun test:components` (full component suite — fast).
Expected: existing tests still pass. No regressions in `LessonBookingModal`-related tests.

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new type errors. Address any that point at the modified file or the new component.

- [ ] **Step 5: Commit**

```bash
cd /home/debian/apps/dance-hub-cron-fix
git add components/LessonBookingModal.tsx
git commit -m "feat(slot-picker): use WeekSlotPicker in LessonBookingModal"
```

---

## Task 4: Manual smoke verification on preprod

The implementation is component-tested; one manual pass on preprod confirms the integration looks right with real data.

- [ ] **Step 1: Push the branch**

```bash
cd /home/debian/apps/dance-hub-cron-fix
git push -u origin feat/slot-picker-redesign
```

- [ ] **Step 2: Deploy to preprod**

Run: `./deploy-preprod.sh deploy feat/slot-picker-redesign` (from `/home/debian/apps/dance-hub-preprod` per the deploy script's worktree-aware behavior, or invoke it however the deploy convention requires for non-main branches).

Expected: preprod redeployed; `pm2 dance-hub-preprod` online.

- [ ] **Step 3: Smoke test in browser**

Visit `https://preprod.dance-hub.io/<community-with-teacher>/private-lessons`. Click "Book" on a lesson. Verify:

1. Week strip shows today + 6 days with the correct day labels and date numbers.
2. Days without slots are visibly greyed and don't respond to click.
3. Days with slots show a blue dot, are clickable, and reveal time chips below when selected.
4. Clicking a time chip turns it solid blue; the Continue / payment flow uses that slot.
5. Prev arrow is disabled on the landing week.
6. Next arrow advances by 7 days; trailing weeks empty → "No slots this week" message.
7. Next is disabled once weekStart + 7 would exceed the 30-day horizon.
8. On a teacher with zero upcoming availability, the picker shows the "No availability in the next 30 days" message.
9. Resize to phone width (DevTools, ~360px). Week strip stays 7-column, time chips wrap.

- [ ] **Step 4: Open a PR**

```bash
gh pr create --base main --title "feat: redesign private-lesson slot picker (week view)" --body "$(cat <<'EOF'
## Summary
- Replace flat 30-day slot list in `LessonBookingModal` with a week-strip + time-chip-grid picker
- Smart-jump on open: skip to the first 7-day window with availability
- Empty days are greyed and unclickable; week pagination capped at the 30-day fetch horizon
- Pure utilities (`lib/slot-grouping.ts`) plus self-contained `<WeekSlotPicker />` component, both unit-tested

## Test plan
- [x] `bun test:lib slot-grouping` — utility unit tests
- [x] `bun test:components WeekSlotPicker` — component tests
- [x] Manual smoke on preprod, mobile + desktop, with and without availability

Spec: `docs/superpowers/specs/2026-05-18-slot-picker-redesign-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: After PR merge — promote to prod**

```bash
cd /home/debian/apps/dance-hub
./deploy.sh code
```
