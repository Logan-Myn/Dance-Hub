# Redesign phase 4: Calendar

Date: 2026-10-07 (built while Logan was away; decisions below are mine, for his review)
Program: docs/superpowers/specs/2026-10-04-community-redesign-program-design.md
Target: https://claude.ai/artifact/HpbBgprGSBJZptQjdBuHC7 (copy: /home/debian/apps/redesign-prototypes/calendar.html)
Branch: `redesign/phase-4-calendar` (stacked on phase 3)

## Built
- Header ("Calendar", owner "Schedule class"), Next up card (next class or the viewer's private lesson: date tile, when-line with the other zone, Starts in / Started N min ago, Recorded, Paid €X; Join / Start / Go to your class when open, Manage lesson, Class details for the owner, Add to calendar (.ics), Details).
- Toolbar: previous / Today / next with the range ("27 Sep to 3 Oct 2026"), Week / List switch. Phones start on List.
- Filter chips: Everything / Live classes / My private lessons (owner: Private lessons), with upcoming counts. Hidden when private lessons are off.
- Time zone line: "Times in your time zone (Tallinn), same as class time", or a Yours / Class time switch when the owner's zone differs.
- Week grid: only the busy hours (one hour either side, at least six rows), "Show the full day", events placed by minute and length, overlaps side by side, short layout, Live / Canceled / Replay tags, today and past shading, now line, "Nothing scheduled this week. See next week". Owners hover a "+ 19:30" ghost and click to schedule there. Phones: day strip with dots and one day column.
- List: grouped by Today / Tomorrow / weekday, time and length, pills, Join / Start / Watch; "Show past classes and replays" (two weeks back).
- Details dialog: Live class / Private lesson, state, Weekly series, times in both zones, canceled note, description, with whom, recorded or not; Join / Watch the replay / Manage lesson / Add to calendar; owner Edit, Repeat next week, Cancel class (inline confirm), Restore class.
- Schedule / Edit dialog: name (inline error), what you'll cover, date, start time (15 min steps), length, Repeat (does not repeat / 4 / 6 / 12 weeks, create only), Record switch (on by default, editable later), past times refused, overlap errors with the other class's time in the viewer's zone. Success: "Scheduled 6 classes, every Sunday at 19:00" and the view jumps to that week.
- Keyboard: ← → weeks, T today.

## Data and API
- Migration `2026-10-07_live_class_series.sql`: `live_classes.series_id uuid` (+ index). The calendar reads `live_classes` directly, so the details view doesn't need rebuilding.
- `POST /live-classes` accepts `repeat_weeks` (2 to 12) + `time_zone`: every date is built on the teacher's wall clock (DST-safe), overlap-checked and inserted in one transaction with one series id. Single classes still create their video room right away; series rooms are created on join. Past start times are refused.
- `PUT /live-classes/[id]`: status must be one of scheduled / live / ended / cancelled; restoring a canceled class re-checks overlaps; moving a class clears `reminder_sent_at` so the reminder goes out again. Overlap errors return `conflict_at` (ISO) instead of a server-formatted time.
- `video-token`: canceled classes can't be joined (they now stay visible).
- `GET /api/community/[slug]/calendar?start&end` (members only): classes plus the viewer's own paid private lessons (as student, or as teacher/owner), replay lesson and watched state. No contact details or notes. The old `GET /live-classes` is now members only too.
- Calendar page is members only (owner and site admins too), like the Calendar tab. Owner tools only for the owner (the API only lets the owner schedule).

## Decisions made while building
- A saved time zone of `UTC` counts as "not chosen" (it's the column default): viewers fall back to the browser's zone, and the class-time switch only shows when the owner chose a zone.
- 24-hour times. Weeks start on Monday (changed from Sunday after Logan's review, 2026-10-05).
- Drag to move a class: not in the prototype, not built.
- Repeat next week copies the class one week later on the same wall clock.
- The owner's "N reminders set", "N attended", Remind me, Notify me, email toggles and the subscribe feed are not built (reminders and the .ics feed are later projects; attendance isn't recorded).
- Cancel notes aren't stored; the details say "Canceled by {teacher}".
- Repeat defaults to "Does not repeat" (the prototype said 6 weeks): a quick schedule must not create six classes that take six cancels to undo.
- Lengths 15 to 240 minutes (the old modal allowed workshops up to 4 hours).
- ← → and T only act when focus is on the page body or the calendar grid.

## Release note
Apply `supabase/migrations/2026-10-07_live_class_series.sql` on prod BEFORE deploying: the calendar loader reads `series_id`.
