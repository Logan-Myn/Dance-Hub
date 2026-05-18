# Slot picker redesign

**Date:** 2026-05-18
**Status:** Draft
**Scope:** `components/LessonBookingModal.tsx`, slot selection block (lines 273-320)

## Problem

When a teacher has many availability slots, the booking modal's slot picker becomes a 30-day flat list crammed into a 160px scrollable box. Students have to scroll through dozens of "Mon May 19 — 9:00 AM" rows to find a time. The UX collapses past ~10 slots.

## Goals

- Make slot selection scannable for teachers with dense schedules
- Two-step pattern: pick a day, then pick a time
- Keep the same backend API and data model — pure frontend redesign

## Non-goals (explicit out-of-scope)

- **Timezone support.** Slot times are still rendered as the raw stored string (teacher-local). Cross-timezone correctness is a separate spec.
- Booking flow changes after slot selection (form, payment, etc.)
- Teacher-side availability management UI

## UX

Reference mockup: `.superpowers/brainstorm/488465-1779120113/content/design-v1.html` (right panel).

### Layout

1. **Week navigation row** — `‹` button, `May 18 – 24` label, `›` button. Buttons disable at the boundaries (today's week, day-29 horizon).
2. **Day strip** — 7-column grid. Each day chip shows day abbrev (`MON`), date number (`19`), and a small filled dot if the day has at least one slot. Selected day = blue border + blue tint. Empty day = greyed text, no dot, not clickable.
3. **Selected-day header** — small text like "Wed, May 21" between the strip and the chips.
4. **Time chip grid** — flex-wrap row of buttons, each showing the slot's `start_time` (e.g., `10:00 AM`). Selected chip = solid blue background, white text.

### Open state

- Default landing week = today + 6 days.
- If that 7-day window contains zero slots, advance forward in 7-day jumps until a week with at least one slot is found, capped at the 30-day fetch horizon.
- If the whole 30-day window has no slots, show the empty state (below) instead of a strip.
- The first day with availability in the landing week is auto-selected so the user immediately sees chips below.

### Empty states

- **Loading** — skeleton: 7 grey day chips + 4 grey time chips.
- **No slots in current week** — strip shows greyed days only; below the strip: "No slots this week. Try `Next week ›`."
- **No slots in 30 days** — replace the entire picker section with: "No availability in the next 30 days. Contact the teacher directly." (matches the existing copy at line 286.)

### Mobile

Same layout, responsive:
- Day chips shrink: at <360px viewport, day abbrev becomes single letter (`M T W T F S S`); the date number stays the same size.
- Time chip grid wraps naturally — 3-4 chips per row on phone.
- Modal already opens full-width on small screens.

## Implementation

### New component

`components/WeekSlotPicker.tsx` — a self-contained client component (matches existing flat `components/` convention).

**Props:**
```ts
type WeekSlotPickerProps = {
  slots: TeacherAvailabilitySlot[];        // already-filtered future slots, from the modal
  selectedSlotId: string | null;
  onSelect: (slot: TeacherAvailabilitySlot) => void;
};
```

**Internal state:**
- `weekStartDate: Date` — the start of the currently-shown rolling 7-day window. Initialized to today; advanced/rewound by 7 via the Prev/Next buttons.
- `selectedDate: string` — the `YYYY-MM-DD` of the day whose chips are shown below the strip.

**Derived (memoized):**
- `slotsByDate: Map<string, TeacherAvailabilitySlot[]>` — grouped once per slots-prop change.
- `weekDays: { date: string, hasSlots: boolean }[]` — 7 entries built from `weekStartDate`.
- `canGoPrev: boolean` (weekStartDate > today).
- `canGoNext: boolean` (weekStartDate + 7 days <= today + 29 days).

**Effect on mount:** smart-jump to the first week containing a slot (within the 30-day horizon), then auto-select that week's first day with slots.

**Behavior on Prev/Next:** advance `weekStartDate` by ±7 days, then auto-select the first day in the new week that has slots. If the new week has no slots at all, leave `selectedDate` null and show the "No slots this week" message under the strip.

### Integration with `LessonBookingModal`

Replace the block at `LessonBookingModal.tsx:273-320` with `<WeekSlotPicker slots={availableSlots} selectedSlotId={selectedSlot?.id ?? null} onSelect={setSelectedSlot} />`. Everything above (fetch logic, `availabilityLoading`, error state) and below (form submission) stays as-is. Loading state moves into the picker (skeleton).

### Utilities

`lib/slot-grouping.ts`:
- `groupSlotsByDate(slots): Map<string, TeacherAvailabilitySlot[]>`
- `getWeekDays(start: Date): string[]` — returns 7 `YYYY-MM-DD` strings
- `findFirstWeekWithSlots(slots, startFrom: Date, horizonDays: number): Date | null`

Keep these pure and unit-testable.

## Testing

- Unit tests for `lib/slot-grouping.ts` covering: grouping, week boundary, smart-jump with empty leading weeks, smart-jump returning null.
- Component test for `WeekSlotPicker`:
  - Renders 7 day chips for a given week.
  - Empty days are greyed and not clickable.
  - Clicking a day with slots shows time chips below.
  - Clicking a time chip calls `onSelect` with the right slot.
  - Prev disabled at today's week; Next disabled at horizon.
- Smoke check in `LessonBookingModal` to confirm wiring (select a chip → submit form posts the right `availability_slot_id`).

## Rollout

Single PR, replaces the current section in `LessonBookingModal.tsx`. No feature flag (the change is contained, the old code is a small block, and the new picker is a strict improvement at every slot density). Deploy via preprod → main per the usual flow.
