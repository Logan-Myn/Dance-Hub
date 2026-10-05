# Redesign phase 5: Private lessons

Date: 2026-10-08 (built while Logan was away; decisions below are mine, for his review)
Program: docs/superpowers/specs/2026-10-04-community-redesign-program-design.md
Target: https://claude.ai/artifact/4oAqavgWj1DUjbM9BPFXfT (copy: /home/debian/apps/redesign-prototypes/private-lessons.html)
Branch: `redesign/phase-5-private-lessons` (stacked on phase 4)

## Built
- Head: "Private lessons", the teacher (avatar, "One on one with {teacher}"), "Times in your time zone".
- Non-member callout "Members pay less" (cheapest member price vs regular, membership price) with a link to the About page.
- Your lessons (members and visitors who booked): each upcoming lesson as a card (date tile, when with the teacher's time when zones differ, Starts in / Room open, Paid €X), Join lesson when the room is open (15 min before), Add to calendar (.ics), Cancel with an inline confirm that states the refund the cancel route will give ("To change the time, cancel and book again"). Past lessons list with the teacher's notes behind a disclosure.
- Lesson type cards: length, where, cancellation policy (from the lesson, not a fixed 24h), requirements, monthly limit, "Next free: Sat 18 Oct, 19:00. N open in the next two weeks" or "No open times right now", price (member price and the regular one struck through, "You save €X"), Book a time.
- Booking dialog in three steps: Time (30-day day strip with open counts, Morning / Afternoon / Evening times in the viewer's zone), Details (name, email, what to work on with suggestion chips, optional phone), Payment (summary, policy line, the existing payment form inline). "That time was just booked" sends the member back to Time with the slot removed ("Nothing was charged"). Success: "You're all set" or "Your payment is processing".
- Owner: "Open times" (the existing per-date editor in the new dialog) and "Add lesson type" (id `#manage-private-lessons` kept for the tour; its text updated), warnings when payouts aren't set up or there are no open times, Bookings with Upcoming / Past / Canceled, a booking dialog (contact, message, notes for the student, Join, cancel with full refund), lesson cards with Upcoming / This month / Paid this month and Hide / Show, Edit.
- No open times for members: a plain line plus "Ask in the community".

## Data and API
- `lib/private-lessons/data.ts`: open slots on the server for every viewer (visitors see times too; picking one asks them to sign in), the viewer's bookings, the owner's bookings.
- `PATCH /api/bookings/[id]` (owner only): teacher notes. Students see them under past lessons.
- `GET /api/bookings/[id]/ics` (student or owner): the lesson as a calendar file.
- `lib/private-lessons/policy.ts` (tested): policy text, refund preview, can-cancel. Fixes the old wording that called a 0-hour cutoff "non-refundable" while the route refunds until the start.

## Payment flow: unchanged
`/book` request and response, the fee, the PaymentIntent, `confirmPayment` with `redirect: 'if_required'` and the return URL, the succeeded / processing handling and messages, the webhook and its refund on a lost race. The form (`PrivateLessonPaymentForm`) is the same component, restyled and shown inline (`LessonPaymentInline`); its tests still pass. The Pay button shows the price the server returned.

## Decisions made while building
- Recording links aren't shown: private lesson rooms are never recorded, so the columns are always empty.
- Weekly hours, "Tell me when times open" and reschedule are later feature projects; the page doesn't show buttons for them.
- Every upcoming lesson gets a card (the prototype showed one).
- The phone field stays, optional (the old form had it).
- The create / edit lesson dialog and the per-date open-times editor are reused as they are (old look inside the new dialog for open times); restyling them belongs with the Admin phase.
- Stats say "Paid this month" (the platform fee isn't stored per booking).
- The calendar's "Manage lesson" now opens this page for students too.
- Owners remove a lesson type from its card (inline confirm, same soft delete as before). The old management modal and its tabs are gone; open times keep the per-date editor.
- `/book` 409s for a taken slot carry `code: "slot_taken"` (no change to how payments work); other refusals (monthly limit, hidden lesson) show the server's message.
- A time paid for during the visit stays hidden until the booking is recorded, so it can't be paid twice by mistake.
- In-person lessons don't show "Join lesson".
- After Logan's review (2026-10-05): past lessons show the 3 most recent, then "Show all N past lessons", under a "Past lessons" heading when there are upcoming ones too.
