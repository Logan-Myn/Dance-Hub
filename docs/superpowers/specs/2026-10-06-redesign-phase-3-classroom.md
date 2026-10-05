# Redesign phase 3: Classroom

Date: 2026-10-06 (built while Logan was away; decisions below are mine, for his review)
Program: docs/superpowers/specs/2026-10-04-community-redesign-program-design.md
Target: https://claude.ai/artifact/TeseEzQXz4FTMtB6PWya5b (copy: /home/debian/apps/redesign-prototypes/classroom.html)
Branch: `redesign/phase-3-classroom` (stacked on phase 2)

## Built

**Course list**
- Header with course and replay counts; owners get "Create course" and a dashed create card.
- Continue card for members: the course in progress (or the newest not started), next lesson, progress, Resume lesson / See all lessons.
- Filter chips: members All / In progress / Not started / Completed; owners All / Drafts. Empty state per filter.
- Course cards: cover, or a drawn cover with the title when there is none (or only the upload placeholder); Private draft badge; chapters and lessons; member progress, Completed, or Not started; owners see "N of M members started, K finished".
- Live class replays row from the `live-class-replays` course: Mux thumbnail, length, Watched / Not watched, date. Titles drop " — Replay". Owners see a note while the replays course is private.
- Empty states (owner and member), loading skeleton (`classroom/loading.tsx`).
- Search lessons ("/" and the top bar): title, course, chapter and notes; "Up next for you" when empty.

**Course page**
- Breadcrumb, header, owner "Course settings" and "Edit content" / "Done editing".
- Lesson index: progress, collapsible chapters with done counts, lesson state circles, Video / Reading / Free preview. Under 1024px it is a "Lessons 4/15" button that opens a bottom sheet.
- Player: Mux's own controls stay (the audio language menu lives there), plus speeds 0.5 to 1.25, 5 second seek, end overlay with Watch again and Complete and continue.
- Mirror (flip the video left to right) was built from the prototype, then removed after Logan's review (2026-10-05): teachers usually teach with their back to the camera, so the video already matches the student's side.
- Lesson header ("{chapter}, lesson 3 of 15"), Mark complete / Completed (replays: Mark as watched / Watched).
- Notes (server-sanitized HTML), "Stuck on this lesson?" box that opens the feed composer with a title, Previous / Up next with Complete and continue, Next lesson, Complete course, Back to Classroom, and a finish card with "Start {next course}".
- Owner editing: drag-and-drop reorder kept (restyled), inline add lesson / add chapter, inline delete confirms (no more window.confirm or the delete modal), notes editor, add / replace video, audio languages, Free preview switch and Copy preview link.
- Course settings dialog restyled: name, description, cover, Private draft / Published, delete with an inline confirm.
- `?lesson=<id>` opens a lesson (search, continue card, preview links, refresh).

**Free preview**
- Migration `2026-10-06_lesson_preview.sql`: `lessons.is_preview boolean NOT NULL DEFAULT false`; the lesson PUT accepts `isPreview`.
- Visitors (signed out or not members) can open a published course that has at least one preview lesson. They see the outline; other lessons show a lock and "Join to watch every lesson" (link to About, where joining already works). The server strips notes and video ids from every non-preview lesson before sending the page (`redactForPreview`, tested). The classroom list stays members-only; the replays course never previews.

**Fixes found on the way**
- Lesson completion route: members only, the lesson must belong to the community, and `{ completed }` sets the state (a double click could un-complete before). Tested.
- The replays course keeps its slug when renamed (recordings find it by slug).
- The feed's "Continue learning" card no longer picks the replays course.
- While a video uploads, anything that would unmount the uploader is blocked with a toast: other lessons, adding a lesson, Done editing, Cancel, search picks and in-app links; reloading asks first.

## Release note
Apply `supabase/migrations/2026-10-06_lesson_preview.sql` on prod BEFORE deploying: the lesson PUT writes `is_preview`, so without the column every lesson save (including attaching an uploaded video) fails.

## Decisions made while building
- Anyone can watch free preview lessons, signed in or not.
- New courses still start as a private draft; publishing from Course settings keeps the existing "notify members" step.
- Drag-and-drop reorder kept instead of the prototype's arrow buttons (works today, less risk). Moving a lesson to another chapter stays out (the route doesn't support it).
- No lesson durations or "about X min left" (no stored durations); lessons say Video or Reading.
- No "New" course badge (no publish date stored).
- Speed lives in Mux's own menu rather than a custom control bar, to keep audio languages and captions working.
- Partial-watch bars on replays are out (no watch-position tracking).

## Not in this phase
Lesson durations, partial watch progress, moving lessons across chapters, "Share a clip" on the finish card, About page links to previews (Phase 6).
