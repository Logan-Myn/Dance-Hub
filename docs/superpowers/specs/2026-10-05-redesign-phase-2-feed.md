# Redesign phase 2: Community feed

Date: 2026-10-05
Status: approved 2026-10-05 (Teacher badge; .ics instead of Google Calendar)
Program: docs/superpowers/specs/2026-10-04-community-redesign-program-design.md
Target: https://claude.ai/artifact/M5ee8CCteMk1XWyfFDkSWB (ignore "Preview states", dark mode)
Branch / worktree: `redesign/phase-2-feed` in `../dance-hub-redesign-p2`

## Who sees the feed

Unchanged: signed-out visitors and non-members are sent to About (`page.tsx`). Members and the owner get the new feed. Pre-registered members keep the "coming soon" screen. Site admins without a membership are sent to About to join, instead of FeedClient's second join flow, which is deleted.

## What gets built

**Header**
- Cover in a 4:1 frame (max 200px tall), no text on top. Existing focal point and zoom keep working inside the new frame.
- Name, description, links row (Instagram handle from the custom links when there is one) below the cover.
- Members button: facepile + "N members". Opens a popover with up to 8 people, "(you)", the "Teacher" badge, and "See all N members", which opens the full roster in a panel. The owner joins the list (today the route leaves them out).
- Actions: everyone gets "Invite a friend" (copies the About link, toast "Invite link copied"); the owner also gets "Manage community".

**Feed column**
- Composer: collapsed "Share a question or a win…" bar; `N` opens it. Expands inline: "Posting as {name}", topic chooser (owner-only topics shown with a lock for members), title (max 120, inline error), rich-text body, Ctrl+Enter posts, Esc closes, owner keeps the pin switch. After posting: toast "Posted to {topic}", the post is highlighted at the top. No attachment button (no upload path yet).
- Filter bar, always shown, sticky with a shadow once stuck: "All posts", one chip per topic with its color dot and count, Latest / Top switch (Top = likes + 2 × replies). Under 640px the chips become a select.
- Pinned box "Pinned by {owner}" on All posts: every pinned post, newest first, Hide/Show remembered per browser.
- Post card: avatar, name, "Teacher" badge on the owner, "5 h ago" (full date on hover), topic, title, two-line plain-text preview, like with a small pop, replies count, last 3 repliers and "Last reply X ago", or "No replies yet" + "Be the first to answer".
- "New" dot on posts written by someone else since your last visit (see Data).
- States: per-section errors with "Try again" (a failed refresh no longer replaces the whole page), empty community (member and owner versions, owner gets a generic welcome-post starter), empty topic.

**Post dialog**
- 720px, full-screen sheet on phones (replaces sending phones to `/threads/[id]`; that page stays for links). Head: topic, Pinned, Copy link, Close. Like, replies, "Show N earlier replies", "(you)" on your replies, sticky reply bar, Ctrl+Enter sends, toast "Reply posted", focus returns to the card. Keeps today's owner menu (pin, edit, delete), nested replies and reply likes.

**Right rail** (each card hides when its offering is off or it has nothing to show)
- Next class: date tile, "Today at 7:00 PM, 60 min", the teacher's time when zones differ, "Starts in 2 h 10 min", then Join class when live. One "Add to calendar" button: downloads an `.ics` file for that class, so it opens in the member's own calendar app (Apple, Outlook, Google). No Google link, so nobody mistakes it for a video call. "Then Sun 12 Oct: {title}" for the class after.
- Continue learning: the course you last worked on, "Lesson 5 of 9", progress bar.
- Private lessons: cheapest lesson, member price with the regular price struck through, link to the page.
- Your membership: status and "Renews 21 Oct" from local data; Manage menu (change plan and payment method open today's subscription dialog; Leave opens an inline confirm). The canceling + Rejoin state stays.
- Owner tools: post an announcement (opens the composer on the owner-only topic), schedule a class (link to Calendar), copy invite link.
- Links (custom links).
- Under 1080px the rail's next-class and continue-learning cards move above the feed as an "Up next" row; the rest follows the feed.

**Search**
- "Search posts" in the top bar on the feed only (phone: icon in the header), `/` opens it. Searches loaded posts (title, text, author) and members; shows 4 recent posts when empty; highlights matches; arrows, Enter, Esc.

## Data

- **Migration** `community_members.feed_visit_at`, `feed_prev_visit_at` (timestamptz, null). `POST /api/community/[slug]/feed-visit` (members only) runs after the feed mounts: if the last visit is more than 30 minutes old it becomes the previous visit; the last visit becomes now.
- **"New" baseline** at render: the last visit if it's more than 30 minutes old, otherwise the previous visit. No baseline (first visit, site admin without a row) means no dots. Dots stay for the whole session.
- `GET /api/community/[slug]/live-classes/[id]/ics` (members only) returns that one class as `text/calendar` with a download filename. This is not the Phase 8 subscription feed.
- `getCommunityThreads` also returns last reply time and the last 3 repliers.
- Server loaders: owner profile, course progress for the viewer, cheapest private lesson. `upcoming-classes` adds the teacher's time zone and gets a viewer check (it has none today).
- Pure helpers with tests: time ago, `.ics` event builder, Top score, search match, HTML to plain text, new-post rule.

## Not in this phase (no dead buttons)

Remind me, "Add every Sunday class" (.ics), dancers-in-the-room count, clip/photo attachments and thumbnails, timestamp chips and @mentions in replies, "Live class every Sunday" meta line, notifications for new posts (empty-topic copy won't promise one), plan interval and price from billing (shown only when known locally).

## Keep working

- Tour IDs: `#community-header`, `#write-post`, `#thread-categories` (now always rendered, so the step works for owners with no topics), `#member-count` (moves to the members button), `#manage-community-button`.
- Existing behaviour covered by tests: membership state from props and route responses, server error reasons, double-click guards, coming-soon screen, sanitized post HTML (script and literal-markup cases), comments loading once under Strict Mode, edit keeps the server's body.

## Build order (one commit or more each, lean: tests for pure helpers, fix tests that break)

1. Data: migration, feed-visit route, thread query additions, loaders, helpers + tests.
2. FeedClient rewrite: SWR without the state mirrors (clears its 7 lint errors), scoped errors, remove the duplicate join flow, shortcuts.
3. Header and members popover/panel.
4. Feed column: composer, filter bar, pinned box, cards, states.
5. Post dialog.
6. Rail and the responsive "Up next" row.
7. Search.
8. Port tests, lint, build, one review, preprod (incl. tour run), then prod.

## Decisions made while building

- Site admins without a membership stay on the feed (as before) with a "Join from the About page" card instead of being redirected; the feed's own join flow is gone.
- Under 640px the topic chips stay as scrollable chips; only Latest / Top becomes a select (matches the prototype).
- Times use the 24-hour clock ("19:00").
- The owner's header button says "Invite"; members see "Invite a friend".
- The membership card says "Paid membership" without a price: the price a member pays can differ (promo codes, older prices) and only billing knows it.
- Search covers posts; people are found through the author name.
- After Logan's review (2026-10-05): a post's replies start loading when the pointer reaches it (or a finger touches it) and are kept for a minute, so the thread opens with them. While they load, placeholder rows show instead of "No replies yet".
