# Private Lesson Management Redesign

**Status:** Design approved, ready to plan
**Surface:** Teacher's "Manage Private Lessons" modal

## Goal

Restructure the existing `PrivateLessonManagementModal` so the content reads more cleanly and adding availability slots is no longer dialog-driven. No new routes, no schema changes. Pure UI/UX restructure.

## Today's pain points

1. **Details tab is dense.** Each lesson is a tall card containing title + Active badge, full description, a 4-field grid (duration / regular price / member price / location), an optional requirements box, and three action buttons. Same density for each booking card. Result: a wall of big rectangles.
2. **Availability scheduling is dialog-driven.** Click a day on the month calendar, a dialog opens with a time-input form and a slot list. Adding a slot means opening + dismissing this dialog repeatedly.

## Approved design

### Modal shell

- Keep `PrivateLessonManagementModal.tsx` as the entry point — no route changes, teachers stay in the private-lessons page context.
- Resize to `max-w-5xl` width and `h-[85vh]` height so each tab has breathing room. Content area is scrollable inside the modal frame.
- Replace the current two tabs (`Details`, `Schedule`) with three: **Lessons · Bookings · Availability**.
- Drop the stats header (Total / Active / Bookings counts) — those numbers are noise when the lists are right there.

### Lessons tab

Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

Each lesson card shows only:
- Title + Active/Inactive badge
- Price as the hero (large, bold)
- Subline: `60 min · Online` (duration · location type)
- "⋯" menu in the corner: Edit, Activate/Deactivate, Delete

The last grid cell is a dashed-border `+ New lesson` tile.

Click anywhere on a card body → opens the existing `CreatePrivateLessonModal` in edit mode. The "⋯" menu handles less-frequent actions.

**Moved into the editor:** description, requirements, member price, full location text. None of these are shown inline anymore.

### Bookings tab

Grouped timeline. Sections rendered as headers with rows underneath:

- **Today** — bookings happening today
- **This week** — rest of the current week
- **Upcoming** — anything beyond this week
- **Past** — completed/ended, collapsed by default
- **Canceled** — collapsed by default

Empty sections are hidden entirely.

Each row contains:
- Avatar + initials
- `Maria · Beginner Bachata` (student name · lesson title)
- Subline: scheduled date/time in viewer's timezone, e.g. "Today, 3:00 PM" or "Thu, May 21 · 5:30 PM"
- Right side: contextual primary action
  - "Join" button when video is joinable (within the existing 15-min pre-window)
  - "⋯" menu otherwise → Contact student / View details / Cancel

Click the row body → opens a **right-side Sheet** (`BookingDetailsSheet`) showing payment status, price paid, student message, contact info, full schedule, and cancellation/refund policy. This is where the density from today's booking card lives.

Status badges (payment status, lesson status) appear in the side-panel header — not on every row.

### Availability tab

Two-column layout. On mobile (`< sm`), they stack — calendar on top, day panel below; selecting a day scrolls the panel into view.

**Left — Month calendar.** Reuse the existing `TeacherCalendarAvailability` look (month nav, day cells with green background for days that have slots, today highlighted, past days disabled). Add a "selected day" state with a primary-color border.

**Right — Day panel** (`AvailabilityDayPanel`, replaces the existing dialog):
- Header shows the selected day, e.g. `Wed, May 21`
- List of existing slots — each row: clock icon + `9:00 – 10:30` + delete button (with confirm)
- Inline add form below: From / To time inputs + `+ Add` button
- Validation: end after start, no overlap with existing slots (same rules as today)
- Empty state when no slots: "No availability set for this day"
- Placeholder state when no day selected: "Select a day on the calendar to add or edit availability."

The existing POST/DELETE `/api/community/[slug]/teacher-availability` endpoints stay unchanged.

## Component breakdown

```
components/private-lessons/manage/
  PrivateLessonManagementModal.tsx   orchestrator — modal frame, tab state,
                                      shared data fetching, refresh callbacks
  LessonsTab.tsx                     card grid + new-lesson tile
  LessonCard.tsx                     single compact card with ⋯ menu
  BookingsTab.tsx                    grouped timeline
  BookingRow.tsx                     single row + Join / ⋯ menu
  BookingDetailsSheet.tsx            right side panel — full details
  AvailabilityTab.tsx                calendar + day panel layout
  AvailabilityDayPanel.tsx           slot list + add form
```

`TeacherCalendarAvailability.tsx` stays — `AvailabilityTab` composes it with the new day panel.

`CreatePrivateLessonModal.tsx` stays as-is (already handles both create and edit).

## Out of scope

- Recurring weekly availability templates (considered, deferred — not the main feature of the community).
- Week-grid drag-to-create availability UI.
- Any backend / schema / API changes.
- Booking actions beyond Join / Contact / Cancel (already covered today).

## Acceptance criteria

- Opening "Manage Lessons" from the private-lessons page opens the redesigned modal.
- Lessons tab: cards render in 1/2/3 columns by viewport; click card or "⋯ Edit" opens `CreatePrivateLessonModal`; "+ New lesson" tile creates one.
- Bookings tab: bookings are grouped by Today / This week / Upcoming / Past / Canceled; empty sections hidden; row Join button visible only when within the join window; clicking a row opens the details sheet.
- Availability tab: month calendar on left, day panel on right (stacked on mobile); selecting a day shows its slots and an inline add form; no dialog opens to add a slot.
- All times throughout the modal are formatted in the viewer's saved timezone (uses the existing `useUserTimezone` hook).
- `PrivateLessonManagementModal.tsx` no longer contains the bulk of the rendering — it delegates to the three tab components.
