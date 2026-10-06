# Full codebase review — 2026-10-01

- **Scope:** `main` at `d15820c`, the code currently running on dance-hub.io.
- **Excluded:** lockfiles, `docs/`, `supabase/migrations/` (read only to check constraints), `__tests__`, `e2e` and `scripts`.
- **Method:** the codebase was split into 8 areas, each reviewed in full by its own reviewer. Every finding was then checked against the code by reading the caller, the callee and any guard elsewhere. Where a finding depends on library behaviour, it was checked against the installed `node_modules` (Next 16.2.5, better-auth 1.4.12, stripe 17.5.0, postgres 3.4.9, resend 6.7.0).
- **Nothing touched:** no application code was changed, and nothing was run against production, a database, Stripe, Resend or Mux.

Two findings were reproduced locally:

- **C1 (admin pages):** reproduced on a throwaway Next 16.2.5 app built from this repo's `node_modules`, using the same layout and page pattern. Details are in C1.
- **H2 (account linking):** the vulnerable code path was read in the installed better-auth source.

**Tests:** `bun install && bun run test` gives 55 suites passed, 1 skipped, 7 failed (347 tests passed, 3 failed, 23 skipped). All 7 failures are the ones expected without env:

- 4 suites throw "TEST_DATABASE_URL is required": `auth-database`, `database-views-functions`, `wave5-integration` and `waves1-4-integration`.
- 2 `lib/admin-dashboard` suites (`stats`, `activity-feed`) fail with `TextEncoder is not defined` from `next/cache`.
- `broadcasts/route` accounts for all 3 failing tests.

No other suite fails.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 7 |
| Medium | 36 |
| Low | 63 |
| **Total** | **108** |

### Top 10

| # | Sev | Issue | Where |
|---|---|---|---|
| 1 | Critical | Admin pages check auth only in their layout. Any visitor can read all user emails, any community's member emails, revenue and Stripe ids, with no login (reproduced locally). | `app/admin/layout.tsx:14-21`, `app/[communitySlug]/admin/layout.tsx:14-24`, all admin `page.tsx` |
| 2 | Critical | Stored XSS: any member, or anyone who pre-registers, can post thread HTML that runs as the owner or a platform admin. One possible chain ends in payouts hijacked through `update-iban`. | `components/community/ThreadCardFluid.tsx:198`, `app/api/threads/create/route.ts:41,112` |
| 3 | High | Removing a member, deleting a community or deleting a user never cancels Stripe subscriptions, so people keep being billed with no access. | `app/api/community/[communitySlug]/members/route.ts:81-111`, `app/api/admin/communities/[communityId]/route.ts:36-39`, `app/api/admin/users/[userId]/route.ts:32-54` |
| 4 | High | Account pre-hijack: an attacker registers the victim's email with a password, and the victim's later Google sign-in verifies the attacker's password. | `lib/auth-server.ts:65-68,168-173` |
| 5 | High | `join-paid` cancels a subscription that may already be paid and charges again. The payment modal makes this easy to reach. | `app/api/community/[communitySlug]/join-paid/route.ts:93-98,121-150`, `components/PaymentModal.tsx:260-297,326` |
| 6 | High | The Stripe webhook re-activates members unconditionally, matches events by user instead of subscription, and has no event dedupe, so access drifts from what Stripe says. | `app/api/webhooks/stripe/route.ts:638-646,783-827` |
| 7 | High | The nginx `X-Forwarded-For` config lets anyone skip better-auth's sign-in rate limit, allowing unlimited password guessing. | `deploy.sh:102`, `deploy-preprod.sh:141`, `lib/auth-server.ts:175-178` |
| 8 | High | Broadcast HTML from an owner runs in a platform admin's session on the archive page. This is the known rich-text issue, but worse than described. | `app/[communitySlug]/admin/(with-nav)/emails/[broadcastId]/page.tsx:131` |
| 9 | High | Opening a thread with no comments starts an endless request loop. On the thread page it is an endless `router.refresh()` loop. | `components/ThreadView.tsx:172-194` |
| 10 | Medium | Private-lesson booking trusts the client's slot and time: double bookings, bookings at any time, and blocking slots in other communities. | `app/api/community/[communitySlug]/private-lessons/[lessonId]/book/route.ts:103-128`, `app/api/webhooks/stripe/route.ts:240-277` |

### Needs confirmation against production

These findings depend on schema or environment details that aren't visible in the repo.

- **`UNIQUE (community_id, user_id)` on `community_members`:** none appears in the migrations. Without it, H3 and M4 get worse (duplicate rows).
- **Unique index on `profiles.email`:** M13 only works if it exists.
- **`active_member_count` trigger from migration 20240325:** if it is live, abandoned `pending` checkouts count towards the fee tier.
- **Pre-registration first invoice:** whether Stripe issues an immediate €0 invoice for a subscription with a future `billing_cycle_anchor` and `proration_behavior: 'none'`. If it does, the webhook marks pre-registered members `active` and sends "X is now open!" at sign-up (see M11).
- **`B2_CDN_URL`:** if it is set in prod, that host is not in `images.remotePatterns`.

---

## Critical

### C1. Admin pages are protected only by their layout, so admin data is readable without logging in

- **Files:**
  - Layouts (the only check):
    - `app/admin/layout.tsx:14-21`
    - `app/[communitySlug]/admin/layout.tsx:14-24`
  - Pages that load data with no auth check of their own:
    - `app/admin/page.tsx`
    - `app/admin/users/page.tsx:8`
    - `app/admin/communities/page.tsx:8`
    - `app/admin/courses/page.tsx:8`
    - `app/admin/threads/page.tsx:8`
    - `app/[communitySlug]/admin/(with-nav)/members/page.tsx:16-39`
    - `.../(with-nav)/(dashboard)/page.tsx:34-148`
    - `.../(with-nav)/subscriptions/page.tsx:29`
    - `.../(with-nav)/general/page.tsx:30`
    - `.../(with-nav)/promo-codes/page.tsx:18`
    - `.../(with-nav)/thread-categories/page.tsx:27`
    - `.../(with-nav)/emails/page.tsx:23-28`
    - `.../(with-nav)/emails/[broadcastId]/page.tsx:42-48`
    - `.../(focused)/stripe-onboarding/page.tsx:15`
    - `emails/new/page.tsx` only checks that *a* session exists.
  - Loaders with no checks: `lib/admin-platform/*`, `lib/admin-dashboard/*`.
  - There is no `middleware.ts` or `proxy.ts`.
- **What is wrong:**
  - In the App Router, a layout and its page are rendered as separate RSC segments at the same time.
  - When the layout calls `redirect()`, its own segment errors. The page segment still runs its DB queries and serializes its output, including the props passed to client components such as `UsersTable` and `MembersTable`, into the response.
  - Next.js documents this pitfall: "be cautious when doing checks in Layouts".
- **Reproduction (local only, Next 16.2.5 from this repo):**
  - **Setup:** a layout that does `if (cookie !== 'ok') redirect('/')`, and a page that passes `{ email, stripe: 'acct_123' }` to a client component, under both `app/admin/...` and `app/[slug]/admin/...`.
  - **No cookie, `RSC: 1`:** `curl -H 'RSC: 1' /salsa/admin/members` returns 200. The body has `4:E{"digest":"NEXT_REDIRECT;replace;/salsa;307;"}` and also `5:[... {"members":[{"email":"member@salsa.test","stripe":"acct_123"}]}]`.
  - **No cookie, plain browser-style GET:** the response is a 307 to `/salsa`, but the HTML body still contains the same flight row with the member emails.
  - **Slow page:** a page that waits 1.5 s before returning still leaked, so the leak doesn't depend on which side finishes first.
  - **No special header needed:** the reviewers first described a forged `Next-Router-State-Tree` header that skips the layout. That variant also works, but no special header is needed at all.
- **Failure scenario:** an unauthenticated visitor runs `curl https://dance-hub.io/admin/users` and reads the 307 body. It holds every profile's email, name and `is_admin` flag, plus the communities each user owns or joined.
  - `/admin/communities`: creator emails, revenue and `stripeAccountId`.
  - `/admin/threads`: author emails.
  - `/<any-slug>/admin/members`: that community's member emails.
  - `/<slug>/admin`: revenue and the failed-payment feed.
  - `/<slug>/admin/subscriptions`: Stripe account data.
  - `/<slug>/admin/emails/<id>`: broadcast contents.
  - **Stripe amplification:** each hit on `/admin` also makes uncached Stripe list calls for every connected account. Repeated requests can use up the platform key's Stripe rate limit for every tenant.
- **Fix:**
  1. Call the guard at the top of every admin `page.tsx`, before any data loading. Add page variants to `lib/community-auth.ts` that call `redirect()` or `notFound()`, for example `requirePlatformAdminPage()` and `requireCommunityManagerPage(slug)`.
  2. Better still, make the `lib/admin-platform/*` and `lib/admin-dashboard/*` loaders take a verified session and assert on it, and add `import 'server-only'`.
  3. Keep the layout checks as an extra layer only.
  4. Check every other page that relies on a parent layout for access control.
  5. After fixing, verify that `curl -s https://<host>/admin/users | grep @` returns nothing.

### C2. Stored XSS in thread bodies, written by any member and run as the owner or a platform admin

- **Files:**
  - Sink: `components/community/ThreadCardFluid.tsx:198` (`dangerouslySetInnerHTML={{ __html: content }}`).
  - Source:
    - `app/api/threads/create/route.ts:41,112` stores `content` exactly as received.
    - `app/api/threads/[threadId]/route.ts:33,45` (PATCH) does the same.
  - Flow: `lib/community-data.ts` `getCommunityThreads` → `app/[communitySlug]/page.tsx` → `FeedClient.tsx:751` → `ThreadCardFluid`.
  - CSP: `next.config.js:54` (`script-src 'unsafe-inline' 'unsafe-eval'`).
- **What is wrong:**
  - Nothing in `app/`, `lib/` or `components/` sanitizes HTML. Tiptap only limits what its own editor produces; the API accepts any string.
  - Posting only requires `canViewCommunity(..., { allowPreRegistered: true })` (`threads/create/route.ts:63`). That covers anyone who joins a free community, and anyone who saves a card to pre-register.
  - `<img src=x onerror=...>` runs under the current CSP.
  - This is worse than the known "unsanitized HTML in some rich-text fields": the author does not need to be the owner, and the code runs in the sessions of more privileged users.
- **Failure scenario:**
  1. An attacker joins a free community and POSTs `/api/threads/create` with `content: "<img src=x onerror=...>"`.
  2. The owner opens the feed. The payload runs as the owner.
  3. It reads `stripe_account_id` from the public `GET /api/community/<slug>`.
  4. It POSTs to `/api/stripe/bank-account/<acct>/update-iban`. That route only checks `created_by` (`update-iban/route.ts:24-29`).
  5. On Custom accounts, the route creates the attacker's IBAN as the default and deletes the owner's. Future payouts go to the attacker.
  - If a platform admin opens the feed, the payload can call `/api/admin/*` instead: change user emails, or delete users or communities.
- **Fix:**
  - Sanitize on write in thread create and edit (`sanitize-html` or DOMPurify, with an allowlist matching the editor schema).
  - Render a plain-text preview in `ThreadCardFluid`, since the card is clamped to 3 lines anyway.
  - Clean existing rows with a one-off script.
  - Separately, require re-authentication (password or email OTP) for `update-iban`, and move towards a CSP without `'unsafe-inline'` (see M32).

---

## High

### H1. Removing a member, or deleting a community or user, never cancels their Stripe subscriptions

- **Files:**
  - `app/api/community/[communitySlug]/members/route.ts:81-111` (DELETE)
  - `app/api/admin/communities/[communityId]/route.ts:36-39`, which calls `delete_community()`. That function only deletes rows (`supabase/migrations/20240404_add_delete_community_function.sql`).
  - `app/api/admin/users/[userId]/route.ts:32-54`
- **What is wrong:**
  - None of these routes call Stripe. The member's subscription on the connected account keeps renewing.
  - `invoice.payment_succeeded` updates `community_members` by `(community_id, user_id)`. That matches nothing, and the charge still succeeds.
  - With the row gone, the member can't cancel in the app: `/leave` returns 400 and every `/subscription/*` route returns 404.
  - Deleting a community also cascades `lesson_bookings`, so paid upcoming lessons disappear with no refund. The community's broadcast subscription on the platform account is not cancelled either.
- **Failure scenario:**
  - An owner removes a paying member. The member loses access but is charged every month until they dispute the charge.
  - If they rejoin, `join-paid` finds no row and creates a second subscription, so they are billed twice.
  - A platform admin deletes a community with 40 paying members. All 40 keep being billed, and nothing links those subscriptions back to the community any more.
- **Fix:**
  - Before deleting, load `stripe_subscription_id` and the community's `stripe_account_id`, then call `stripe.subscriptions.cancel(id, { stripeAccount })`. If the cancel fails, don't delete.
  - For a community delete:
    - cancel every member subscription;
    - cancel the broadcast subscription;
    - refund or cancel upcoming bookings, or block the delete while any exist;
    - prefer a soft delete.
  - Do the same in the admin user delete.

### H2. Account pre-hijack through Google sign-in linking

- **Files:**
  - `lib/auth-server.ts:65-68` (email/password with `requireEmailVerification`)
  - `lib/auth-server.ts:117-122` (Google)
  - `lib/auth-server.ts:168-173` (`accountLinking: { enabled: true, trustedProviders: ["google", "email-password"] }`)
  - Behaviour in `node_modules/better-auth/dist/oauth2/link-account.mjs` (`handleOAuthUserInfo`)
- **What is wrong:**
  - Email/password sign-up creates the `user` row and a `credential` account straight away, unverified.
  - A later Google sign-in with the same email finds that user. Google is a trusted provider, so better-auth links the Google account, then runs `updateUser(..., { emailVerified: true })`.
  - The attacker's password stays on the account and now works, because the email is verified.
  - `"email-password"` is not a real provider id (better-auth calls it `credential`), so that entry does nothing.
- **Failure scenario:**
  1. An attacker signs up as `teacher@gmail.com` with a password they choose. The teacher ignores the verification email.
  2. Weeks later the teacher clicks "Continue with Google". This signs them into the same user and verifies it.
  3. The attacker logs in with the password and has the teacher's account: community ownership, Stripe onboarding and payouts, and member data.
  4. Sessions are not revoked on password reset (L27), so the attacker can keep access even after a reset.
- **Fix:**
  - Add a `databaseHooks.account.create` hook. When a non-`credential` provider is linked to a user whose `emailVerified` is false, delete that user's `credential` account and all of its sessions.
  - Alternatively, set `accountLinking.enabled: false` and handle the "account not linked" case in the UI.
  - Remove the `"email-password"` entry.

### H3. `join-paid` cancels a subscription that may already be paid, and the payment UI makes this easy to hit

- **Files:**
  - Server: `app/api/community/[communitySlug]/join-paid/route.ts:93-98, 121-150`
  - Client:
    - `components/PaymentModal.tsx:33-59` (polling has no timeout)
    - `components/PaymentModal.tsx:260-297, 326` (`PromoCodeEntry` stays visible and active during "Processing your membership...")
    - `components/PaymentModal.tsx:354` (the dialog can be closed)
    - `app/[communitySlug]/FeedClient.tsx:330-351` and `components/community/CommunitySidebar.tsx:334-341` (Join has no in-flight guard)
- **What is wrong:**
  - Any row whose `status` is not `active` is treated as leftover. Its subscription is cancelled (Stripe gives no refund) and the row is deleted, based only on the DB state.
  - The DB stays `pending` until `invoice.payment_succeeded` arrives, so a paid but not-yet-webhooked subscription gets cancelled.
  - A double click on Join also runs two requests at once. Each creates its own customer and subscription, and there's no idempotency key.
- **Failure scenario:**
  1. A user pays. The webhook is slow, so the modal keeps spinning.
  2. The user then applies a promo code, or closes the modal and clicks Join again.
  3. Paid subscription A is cancelled, and the community keeps that payment.
  4. Subscription B is created and charged. The user has paid twice for the same month.
  - With a double click instead, the orphaned `incomplete` subscription expires about 23 hours later. Its `customer.subscription.updated` event then marks the paying member `incomplete_expired`, which hides them from the roster (see H4).
- **Fix:**
  - Server:
    - Before cancelling, `stripe.subscriptions.retrieve()` the existing subscription. If it is `active`, `trialing` or `past_due`, reconcile the row and return "already a member". Only cancel `incomplete` subscriptions.
    - Pass an idempotency key keyed on user, community and plan.
  - Client:
    - Hide the promo entry and block closing the modal once `confirmPayment` succeeds.
    - Disable Join while a request is in flight.
    - Stop polling after about 60 seconds with a clear message.

### H4. The Stripe webhook lets membership state drift from Stripe: unconditional re-activation, matching by user rather than subscription, no dedupe

- **Files:** `app/api/webhooks/stripe/route.ts:638-646` (invoice), `:783-827` (subscription updated/deleted), `:240-285` (private-lesson `payment_intent.succeeded`).
- **What is wrong:**
  1. **Unconditional re-activation.** `invoice.payment_succeeded` fetches the subscription and always writes `status = 'active'` next to `subscription_status = <live status>`. A late or replayed invoice event for a subscription that is already cancelled gives `status='active', subscription_status='canceled'`. `toMembershipStatus` grants access on `status === 'active'`, and no later event revokes it.
  2. **Matching by user, not subscription.** Subscription events update the row by `(metadata.community_id, metadata.user_id)` without `AND stripe_subscription_id = <event sub>`. `join-paid` replaces subscriptions under the same row key (re-join, re-applying a promo code, a double click). So a `deleted` or `incomplete_expired` event for the old subscription overwrites the paying member's row.
  3. **No dedupe.** There is no `event.id` dedupe, so every retry re-runs the side effects: emails (M11) and `increment_members_count` / `decrement_members_count`.
  4. **Duplicate booking insert.** A redelivered private-lesson `payment_intent.succeeded` hits the UNIQUE `stripe_payment_intent_id`, returns 500, and Stripe retries for 3 days.
- **Failure scenarios:**
  - **Replay re-grants access.** A renewal's first delivery fails on a transient DB error. The member then cancels and the subscription ends. Stripe's retry arrives later, sets the member `active`, and they have free access for good.
  - **Old subscription deactivates the new one.** A member re-joins. The old subscription's cancellation event is processed after the new invoice's success event, and the member who just paid ends up inactive.
- **Fix:**
  - Derive `status` from the subscription's actual status.
  - Add `AND stripe_subscription_id = ${sub.id}` to every subscription-driven UPDATE.
  - Record processed `event.id`s in a table with a unique key and skip duplicates.
  - Make the booking insert `ON CONFLICT (stripe_payment_intent_id) DO NOTHING` and return 200.

### H5. `X-Forwarded-For` spoofing bypasses better-auth's rate limiting (unlimited sign-in attempts)

- **Files:**
  - `deploy.sh:102` and `deploy-preprod.sh:141`: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
  - `lib/auth-server.ts:175-178`: no `advanced.ipAddress`
  - `node_modules/better-auth/dist/utils/get-request-ip.mjs`
- **What is wrong:**
  - `$proxy_add_x_forwarded_for` appends the real IP after whatever `X-Forwarded-For` the client sent.
  - better-auth takes the *first* entry as the client IP, so the client controls it.
  - A different fake IP on every request gives every request a fresh bucket.
  - A value that isn't a valid IP makes `getIp` return `null` in production, and the request is not rate-limited at all.
- **Failure scenario:** a script sends `X-Forwarded-For: <random>` on each `POST /api/auth/sign-in/email`. That gives unlimited password guessing against any account; the default limit is 3 per 10 seconds on sign-in, sign-up, change-password and change-email. The IP recorded for Stripe ToS acceptance can be forged the same way.
- **Fix:**
  - In nginx, use `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite rather than append), or keep `X-Real-IP`.
  - Set `advanced.ipAddress.ipAddressHeaders: ['x-real-ip']` in better-auth.
  - If a CDN sits in front, use its client-IP header instead.

### H6. Opening a thread with no comments starts an endless request loop

- **Files:**
  - `components/ThreadView.tsx:172-194`: the effect depends on `[thread.id, thread.comments]`.
  - Modal parent: `app/[communitySlug]/FeedClient.tsx:823-832`.
  - Page parent: `ThreadPageClient.tsx:79-82,95`.
- **What is wrong:**
  - When `thread.comments` is empty, the effect fetches `/api/threads/:id/comments` and passes the result to `onThreadUpdate`.
  - The parent stores the new `[]`. That is a new array reference, so the effect runs again, sees length 0 and fetches again, forever.
  - On the thread page, the parent rebuilds the array every render and calls `router.refresh()` on update, so each loop is also a full server re-render.
  - Feed threads always arrive with `comments: []`, so every thread with no comments hits this.
- **Failure scenario:** while a user has a thread with no comments open, their browser sends back-to-back comment GETs. On the thread page it is back-to-back RSC refreshes. This is constant DB and server load from normal use.
- **Fix:**
  - Fetch comments once per `thread.id` (guard with a ref) and depend only on `thread.id`.
  - Don't call `onThreadUpdate` when nothing changed.
  - Memoise the page's thread object.

### H7. Broadcast HTML from an owner runs in a platform admin's session (known issue, worse than described)

- **Files:**
  - Sink: `app/[communitySlug]/admin/(with-nav)/emails/[broadcastId]/page.tsx:131` (`dangerouslySetInnerHTML={{ __html: broadcast.html_content }}`).
  - Stored as received: `app/api/community/[communitySlug]/broadcasts/route.ts:26-65`.
  - Platform admins can open any community's admin area: `app/[communitySlug]/admin/layout.tsx:22-24`.
- **What is wrong:**
  - The known issue is owner HTML going to members' inboxes.
  - Here the same HTML runs on our own origin, in the session of a *platform admin* who opens the archive page, under a CSP that allows `'unsafe-inline'`.
- **Failure scenario:**
  1. An owner on a broadcast-enabled community POSTs raw HTML containing `<img onerror=...>`.
  2. They ask support to look at "my failed broadcast".
  3. The admin opens it. The payload calls `PATCH /api/admin/users/<id>` to change a target account's email.
  4. A password reset then takes over that account.
- **Fix:** sanitize broadcast HTML on write and render it in a sandboxed `<iframe srcdoc sandbox>` on the archive page, and fix C2's CSP.

---

## Medium

### M1. Open redirect after sign-in and email verification

- **Files:**
  - `app/HomePageClient.tsx:1081` reads `?redirect=` unvalidated.
  - `components/auth/AuthModal.tsx:46` saves it to `localStorage.auth_redirect_url`.
  - `components/auth/AuthModal.tsx:101-103` calls `router.push(redirectUrl)` after email/password sign-in.
  - `app/auth/verify-email/page.tsx:47-57` and `app/auth/verify-signup/page.tsx:42-53` `router.push` the stored value.
- **What is wrong:** there is no same-origin check, and Next 16's `router.push` does a full external navigation for absolute URLs. Google sign-in is not affected because better-auth checks its callback URL against trusted origins.
- **Failure scenario:** a phishing link `https://dance-hub.io/?auth=signup&redirect=https://evil.example/login` sends the victim to the attacker's page right after a real login or email verification.
- **Fix:** add one helper that accepts only values starting with a single `/` (not `//` or `/\`), and apply it wherever the value is read or stored.

### M2. A pre-registered user can call `/leave` or `/reactivate` to get member access before the community opens

- **Files:**
  - `app/api/community/[communitySlug]/leave/route.ts:90-119`
  - `app/api/community/[communitySlug]/reactivate/route.ts:99-103`
  - `lib/community-data.ts:394-398`
- **What is wrong:**
  - Pre-registration subscriptions are anchored to the opening date, so their current period ends on that date.
  - `/leave` never checks `member.status`. It writes `subscription_status='canceling'` with the opening date as the end date.
  - `toMembershipStatus` then treats the row as being in grace, so `isMember` is true even though `status` is `pre_registered`.
  - `/reactivate` afterwards sets `status='active'`.
- **Failure scenario:** a user pre-registers (nothing is charged), then POSTs `/leave`. They can open the classroom and course API until the opening date, and the subscription ends without ever invoicing. If they reactivate instead, they become `active` early.
- **Fix:**
  - In `/leave`, branch on status: for pre-registered rows, run the cancel-pre-registration logic; only `active` rows get grace.
  - In `toMembershipStatus`, grant grace only when `status === 'active'`.
  - In `/reactivate`, refuse rows that are not `active`.

### M3. Private-lesson booking trusts the client's slot and time, and nothing reserves the slot

- **Files:**
  - `app/api/community/[communitySlug]/private-lessons/[lessonId]/book/route.ts:103-128`
  - `app/api/webhooks/stripe/route.ts:240-277`
  - `app/api/community/[communitySlug]/teacher-availability/route.ts:77-80` (and the copies at 96-99, 114-117, 132-135)
  - `components/LessonBookingModal.tsx:161-168`
- **What is wrong:**
  - `availability_slot_id` and `scheduled_at` go from the request body into PaymentIntent metadata, then into `lesson_bookings`, with no check of existence, ownership, community, active state, whether the slot is free, or whether the time matches the slot.
  - There is no unique constraint on the slot.
  - The availability query marks slots as booked by `availability_slot_id` alone, across communities.
- **Failure scenarios:**
  - Two students pay for the same slot, and the teacher is double-booked.
  - A student books an arbitrary time.
  - An attacker pays for a €0.50 lesson in their own community, passing a victim teacher's slot ids (which are public), and blocks the victim's calendar.
- **Fix:**
  - In `book`, load the slot scoped to the community, teacher and active state, derive `scheduled_at` from it, and reject the request if the slot is already booked.
  - Add a partial unique index on `lesson_bookings(availability_slot_id) WHERE lesson_status <> 'canceled'`.
  - In the webhook, catch the unique violation and refund automatically on `event.account`.
  - Join availability on `community_id` too.

### M4. Opening-date lock is enforced only in the UI, and date or status changes never reach pre-registration subscriptions

- **Files:**
  - `app/api/community/[communitySlug]/update/route.ts:77-90` writes `status` and `opening_date` straight from the body.
  - `components/admin/GeneralSettingsForm.tsx:132-155,343-394`
  - `app/[communitySlug]/FeedClient.tsx:649,664-666`
- **What is wrong:**
  - `can_change_opening_date` only disables the input.
  - Each pre-registered member's subscription keeps the `billing_cycle_anchor` from when they signed up.
  - Switching the community to Active saves `opening_date: null`.
- **Failure scenarios:**
  - **Opening postponed:** members are charged on the old date, and the webhook marks them `active` while the community is still in pre-registration.
  - **Switched to Active early:** pre-registered members see a blank page (`return null`) until they are charged.
  - **Lock bypassed:** a direct PUT changes a locked date.
- **Fix:**
  - Enforce the lock on the server.
  - When pre-registrations exist, either reject date and status changes or update every subscription's anchor (or `trial_end`) and notify the members.
  - Allow-list status transitions.

### M5. Upgrading to yearly keeps a monthly-only promo discount

- **File:** `app/api/community/[communitySlug]/subscription/upgrade-yearly/route.ts:113-128`
- **What is wrong:** `join-paid` enforces `applies_to_plan`, but the upgrade only swaps the price and keeps `sub.discounts`.
- **Failure scenario:**
  1. The owner creates a code for 50% off for 3 months, monthly plan only.
  2. A member joins monthly with that code.
  3. The member upgrades to yearly and gets 50% off the whole yearly invoice.
- **Fix:** look up the mirror row's `applies_to_plan`. If it doesn't include yearly, pass `discounts: []` to the update and to the preview, or block the upgrade.

### M6. Course creation doesn't de-duplicate slugs, so a delete or edit can hit the wrong course

- **Files:**
  - `app/api/community/[communitySlug]/courses/route.ts:39,67-88`
  - `lib/utils.ts:19-26` (`slugify` drops non-ASCII characters, so a title with no Latin letters gives `''`)
  - All `courses/[courseSlug]/*` routes resolve the course with `queryOne ... WHERE slug`.
- **What is wrong:** PUT has a `-2`, `-3` collision loop but POST doesn't, and no `UNIQUE (community_id, slug)` constraint is visible in the repo.
- **Failure scenario:** "Salsa: Level 1" and "Salsa Level 1" get the same slug. Deleting the new, empty one can resolve the older course, which then loses its chapters, lessons, completions and Mux videos (`[courseSlug]/route.ts:352-387`).
- **Fix:** reuse the collision loop in POST, fall back to a short id when the slug is empty, and add the unique constraint.

### M7. Promo-code validation needs no login, has no rate limit, and makes 1-2 Stripe calls per request

- **Files:** `app/api/community/[communitySlug]/promo-codes/validate/route.ts:5-29`, `lib/promo-codes/service.ts:174,209`
- **Failure scenarios:**
  - A script brute-forces common codes across every slug and collects the discounts.
  - The same flood uses up the platform's Stripe rate limit, which Connect requests count against, so checkouts across all tenants fail with 429.
- **Fix:**
  - Require a session.
  - Rate-limit per user or IP and per community.
  - Look the code up in the DB mirror before calling Stripe.

### M8. A promo code can be live on Stripe but invisible to the owner

- **File:** `lib/promo-codes/service.ts:51-94`
- **What is wrong:**
  - The coupon and promotion code are created on Stripe before the DB insert, and nothing undoes them if the insert fails.
  - `UNIQUE (community_id, code)` also counts inactive rows, while Stripe only checks active codes.
- **Failure scenario:**
  1. The owner deactivates `SUMMER` and later recreates it at 50%.
  2. Stripe creates an active promotion code.
  3. The insert violates the unique constraint, and the owner gets an error.
  - The 50% code is now redeemable (validation and `join-paid` accept it), but the owner can't see it or turn it off.
- **Fix:**
  - Check case-insensitively against existing rows before calling Stripe.
  - If the insert fails, deactivate the promotion code and delete the coupon.

### M9. Broadcast-tier billing drifts from Stripe

- **Files:**
  - `lib/broadcasts/billing.ts:24-90,100-114`
  - `app/api/community/[communitySlug]/broadcasts/subscription/route.ts:7-18`
  - `components/emails/UpgradeDialog.tsx:131-162`
  - `app/api/webhooks/stripe/route.ts:66-106`
- **What is wrong:**
  - **A new subscription every time.** Each time the dialog opens, a new €10/month subscription is created, with no reuse of an existing `incomplete` or `past_due` one and no idempotency key. The row is upserted by community, overwriting the subscription id.
  - **Wrong payment intent.** The client secret is the customer's newest PaymentIntent, not this subscription's.
  - **Stale events win.** Webhook events from stale subscriptions overwrite the live row.
  - **Webhook 500s.** `incomplete_expired`, `unpaid` and `trialing` break the 4-value CHECK constraint, so the webhook returns 500 and Stripe retries for days.
  - **Period end always NULL.** `current_period_end` is read from the subscription, which no longer has it in API version Clover.
- **Failure scenario:**
  1. The owner's first subscription goes `past_due`.
  2. They upgrade again and pay a second one.
  3. Dunning later cancels the first. Its event rewrites the row to `canceled`.
  4. The community drops to the free tier while the second subscription keeps billing, and in-app cancel returns 404.
- **Fix:**
  - Reuse or cancel the existing subscription before creating one, with an idempotency key.
  - Use `latest_invoice.confirmation_secret`.
  - Ignore events whose subscription id doesn't match the stored one, unless they are `active`.
  - Map statuses onto the CHECK set.
  - Read the period end from `items.data[0]`.
  - Return 200 early for broadcast-purpose events the member handler doesn't own.

### M10. The broadcast sender ignores Resend errors, so the composer reports success

- **Files:** `lib/broadcasts/sender.ts:93-124` (the From header is built at `:105`), `components/emails/EmailComposer.tsx:69-76`
- **What is wrong:**
  - Resend 6.7 returns `{ data: null, error }` instead of throwing. `sendBatchWithRetry` never checks `result.error`, so its retry and backoff never run and no error message is stored.
  - Batches go out at about 4 per second, which can exceed Resend's default limit.
  - The owner-controlled community name goes into the From header unquoted. A name with a comma or quotes may make every batch fail; this is inferred from the header syntax, not tested.
- **Failure scenario:** a 600-member broadcast: batches 3-6 get 429 and are dropped. The UI says "Published to 600 readers", and the row says `partial_failure` with no reason.
- **Fix:**
  - `if (result.error) throw ...`, and retry on 429 and 5xx.
  - Quote the display name.
  - Record which recipients failed so a resend can target only them.
  - Show partial failure in the composer.

### M11. The webhook sends "Welcome" or "X is now open!" on every billing cycle

- **File:** `app/api/webhooks/stripe/route.ts:561-748` (emails at 669-736, counter at 738-744)
- **What is wrong:**
  - Every `invoice.payment_succeeded` triggers the email. That includes renewals (`billing_reason = subscription_cycle`) and the upgrade-yearly proration invoice (`billing_reason = subscription_update`).
  - It sends `MemberWelcomeEmail`, or `CommunityOpeningEmail` when `metadata.is_pre_registration === 'true'`, which stays on the subscription for its whole life.
  - It also calls `increment_members_count()` every time.
  - The handler also logs the full invoice JSON (L20).
- **Failure scenario:** every paying member gets "Welcome to X!" every month, and every former pre-registered member gets "X is now open!" every month.
- **Fix:**
  - Send the email and increment the counter only when `billing_reason === 'subscription_create'`, or when `UPDATE ... WHERE status <> 'active' RETURNING` shows the member just became active.
  - Send the opening email only when the community actually opens.

### M12. Email changes never reach `profiles.email`

- **File:** `lib/auth-server.ts:158-166`. `changeEmail` is enabled, but no `databaseHooks.user.update` syncs `profiles.email`.
- **What is wrong:** these keep using the old address:
  - broadcast recipients;
  - welcome and opening emails;
  - teacher booking notifications;
  - the owner's member list;
  - `getAllAdminUsers`.
- **Failure scenario:** a teacher moves off a former employer's mailbox. New-booking emails, with student details, keep going to the old mailbox.
- **Fix:** add a `user.update.after` hook that updates `profiles.email` and `email_preferences.email`, or read `"user".email` everywhere.

### M13. The unused `/api/auth/signup` route can move an existing profile to a new, unverified account

- **File:** `app/api/auth/signup/route.ts:37-52` (`INSERT INTO profiles ... ON CONFLICT (email) DO UPDATE SET auth_user_id = <new user>`)
- **What is wrong:** the UI signs up through `authClient.signUp.email`, but this route is still public. Because of M12, `profiles.email` can hold a user's *previous* address.
- **Failure scenario:**
  1. A user changes their email from `old@x` to `new@x`.
  2. An attacker POSTs `/api/auth/signup` with `old@x`.
  3. The user's profile row is re-linked to the attacker's new account. The user loses their name, avatar, email preferences and `profiles.is_admin`.
  4. If the attacker controls `old@x`, they verify the account and inherit the profile.
  - This only applies if `profiles.email` has a unique index in production.
- **Fix:** delete the route. Any server-side signup should upsert on `auth_user_id`.

### M14. `custom-account/create` wipes a community's Stripe account link on any Stripe error

- **File:** `app/api/stripe/custom-account/create/route.ts:48-67`
- **What is wrong:** any error from `stripe.accounts.retrieve(existingId)` sets `stripe_account_id = NULL` and creates a new account; that includes network errors, 429, 5xx and mode mismatch. The wizard sends owners into this path when its own status check fails (`OnboardingWizard.tsx:146-153`).
- **Failure scenario:** during a Stripe blip, a live community is re-pointed to an empty account. Joins fail (the price is missing on the new account), leave and cancel fail with "No such subscription", and payouts and status show the wrong account.
- **Fix:**
  - Clear the link only on `resource_missing` or account-revoked errors, and return 502 for anything else.
  - Save the new id with `WHERE stripe_account_id IS NULL`.

### M15. The LiveKit identity is the user's display name, so a member can repeatedly kick the teacher

- **File:** `app/api/live-classes/[classId]/video-token/route.ts:59-63,140-142`
- **What is wrong:**
  - `identity = display_name || full_name || email prefix`. None of these is unique.
  - LiveKit disconnects the existing participant when someone joins with the same identity.
  - `components/LiveKitClassRoom.tsx:339-352` has no `onDisconnected` handling, so the kicked user is left on a frozen screen.
- **Failure scenario:** a member clears their display name and sets their full name to the teacher's display name. Each time they join, the teacher is disconnected. Two members called "Anna" knock each other out.
- **Fix:** use `session.user.id` as the identity and pass the display name as `name`; this needs Stream-Hub to accept a separate name field. Add a Rejoin state on disconnect.

### M16. Live-class moderation is client-side only

- **Files:**
  - `components/LiveKitClassRoom.tsx:85,104,107-121`
  - `components/LiveKitChat.tsx:83-89`
  - `components/LiveKitControlBar.tsx:95`
- **What is wrong:**
  - Students accept `hand-approved`, `hand-denied` and `hand-revoked` data messages from any sender.
  - The chat sender name comes from the message payload.
  - After a student is approved, the entry is removed, so Revoke can't be reached.
  - The control bar sends `sessionId`, but the handler expects `participantIdentity`.
  - Student tokens already allow publishing.
- **Failure scenario:** a student mutes everyone, impersonates the teacher in chat, or gets approved and then can't be silenced.
- **Fix:**
  - Check the sender's identity on each message.
  - Take display names from `msg.from`.
  - Give students subscribe-only tokens, and grant or revoke publishing on the server.

### M17. The Stripe onboarding wizard keeps full bank and personal data in localStorage and receives it back from the API (known bank-data issue, worse than described)

- **Files:**
  - `components/stripe-onboarding/OnboardingWizard.tsx:164-195,318`
  - `app/api/stripe/custom-account/[accountId]/status/route.ts:123-131`
- **What is wrong:**
  - The whole wizard state is saved in plaintext to `localStorage["stripe-onboarding-<communityId>"]`: full account and routing number or IBAN, date of birth, SSN last 4, home address and phone.
  - It is removed only when the wizard finishes successfully, never on sign-out.
  - The status API also sends the stored bank number, date of birth and SSN last 4 back to the browser on every wizard load.
  - The save runs one step behind because of a stale closure, so a reload puts the user back on a step they already finished.
- **Failure scenario:** on a shared computer, or through any XSS such as C2, the owner's full bank and identity data can be read.
- **Fix:**
  - Don't persist sensitive fields client-side; keep only the step number.
  - Don't return stored PII from the status route.
  - Better still, tokenize with Stripe.js (`stripe.createToken('bank_account' | 'person')`) so the raw data never reaches our server.

### M18. The verification step shows "Verification Complete! ... ready to accept payments" for accounts that are not verified

- **Files:**
  - `components/stripe-onboarding/steps/VerificationStep.tsx:59-101,178,199-208`
  - `components/stripe-onboarding/OnboardingWizard.tsx:294-328`
- **What is wrong:**
  - The component reads `chargesEnabled` and `payoutsEnabled`, but the route returns `charges_enabled` and `payouts_enabled`. It also reads `pendingVerification`, which the route never returns.
  - `handleFinish` waits for a `requiresVerification` field that doesn't exist, so `/verify` is never called. It never checks `res.ok` either.
  - When requirements are due, the user is stuck: "Complete Setup" is disabled and there is no Refresh button.
  - A missing `accountId` leaves the spinner running forever.
- **Failure scenario:** an owner whose account is still under review, or rejected, is told they are ready to take payments.
- **Fix:** use the route's field names, show the real `requirements`, call `/verify` and check its response, and add a Refresh button.

### M19. Re-submitting the bank step leaves payouts going to the old account

- **Files:** `components/stripe-onboarding/steps/BankAccountStep.tsx:153-214`, `app/api/stripe/custom-account/[accountId]/update/route.ts:151-201`
- **What is wrong:** each Continue adds another external account without `default_for_currency: true` and never removes the old one.
- **Failure scenario:** an owner corrects a mistyped account number, but payouts still go to the first, wrong account.
- **Fix:** set the new account as default and delete the previous one, as `update-iban` already does.

### M20. Every non-US country gets an IBAN field and EUR

- **File:** `components/stripe-onboarding/steps/BankAccountStep.tsx:46-67,179-186`
- **What is wrong:**
  - CA, AU, JP, SG, HK, MX, BR, MY, NZ and TH don't use IBANs, so those owners can't get past step 3.
  - Non-euro IBAN countries (CH, NO, SE, DK, PL, CZ, HU, RO) get EUR instead of their own currency.
  - The form takes its country from the personal address, while the Stripe account was created with the business address country.
- **Fix:** derive the bank fields and currency from the account country, using Stripe's per-country requirements.

### M21. Company onboarding can't complete: the name is dropped and no representative is created

- **File:** `app/api/stripe/custom-account/[accountId]/update/route.ts:99-131`, called from `components/stripe-onboarding/steps/BusinessInfoStep.tsx:163-193`
- **What is wrong:**
  - The update is built with two spreads under the same computed key (`individual` or `company`). The second spread (the address) overwrites the first (the name), so `company.name` never reaches Stripe.
  - The business phone is ignored.
  - Later steps write to `individual.*`, and nothing creates the representative that company accounts need.
  - `tos_acceptance.date` and `user_agent` are taken from the request body.
- **Fix:**
  - Merge into one object per entity.
  - Create a `person` with `relationship.representative` for companies.
  - Use the server's time and the request's `User-Agent` header.

### M22. The teacher's cancel dialog shows the wrong refund

- **File:** `components/private-lessons/manage/BookingsTab.tsx:29-43,189-203`
- **What is wrong:** the lesson-bookings route returns `SELECT *` from a view that has no `viewer_role` column, so the dialog uses the student refund policy and wording.
- **Failure scenario:** the dialog tells the teacher "No refund will be issued", but the cancel route always refunds 100% when the teacher cancels.
- **Fix:** have the teacher dialog use the teacher policy; the server always refunds in full for teacher cancellations.

### M23. Deleting a lesson wipes its booking history, although the dialog says "Past bookings stay intact"

- **File:** `components/private-lessons/manage/LessonsTab.tsx:162`. The DELETE route hard-deletes, and `lesson_bookings` has an `ON DELETE CASCADE` foreign key (`20250103_create_private_lessons_tables.sql:28`).
- **What is wrong:** every completed, cancelled and refunded booking for the lesson is deleted along with its payment fields.
- **Failure scenario:** a teacher deletes an old lesson and loses all of its booking and payment records.
- **Fix:** soft-delete the lesson (`is_active = false`), or block the delete while bookings exist.

### M24. `CommunitySidebar` crashes the whole feed when `/upcoming-classes` returns an error

- **File:** `components/community/CommunitySidebar.tsx:52,180,187`
- **What is wrong:**
  - The fetcher never checks `res.ok`, so an `{ error }` object becomes the data, and `.map` throws during render.
  - There is no `error.tsx` or `global-error.tsx` anywhere in `app/`.
- **Failure scenario:** after any transient 500, or a 404 once the owner renames the slug, every open feed tab crashes to "Application error" within 30 seconds (the sidebar polls every 30 seconds).
- **Fix:** throw when `!res.ok`, guard with `Array.isArray`, and add `app/[communitySlug]/error.tsx`.

### M25. The platform admin Users page passes the wrong user id: Delete reports success but deletes nothing

- **Files:**
  - `components/admin/platform/UsersTable.tsx:99` passes `profiles.id` instead of `authUserId`.
  - `app/api/admin/users/[userId]/route.ts:32-54,89-98`
  - `components/admin/edit-user-modal.tsx:60,116-126`
- **What is wrong:**
  - Delete matches no rows and still returns `{ success: true }`.
  - Edit gets a 404 from `/api/profile`.
  - The PATCH handler ignores `addToCommunity` and passes `undefined` values to postgres.js, which rejects them with a 500. The community PATCH has the same problem when `description` is omitted.
- **Failure scenario:** an admin "deletes" an abusive user, or handles a GDPR erasure request. The toast says success, but the user can still log in.
- **Fix:**
  - Pass `authUserId`.
  - Return 404 when nothing was deleted.
  - Implement `addToCommunity` or remove it.
  - Use `COALESCE(${x ?? null}, col)` for optional fields.
  - See H1 for cancelling Stripe subscriptions on delete.

### M26. Private-lesson payment reports a "processing" payment as failed

- **File:** `components/PrivateLessonPaymentModal.tsx:42,47-54`
- **What is wrong:**
  - Any status other than `succeeded` shows "Payment was not completed".
  - The PaymentIntent allows automatic payment methods, including delayed ones such as SEPA.
  - `return_url` is `/`.
- **Failure scenario:** a SEPA payment looks failed, so the user pays again by card. The first payment succeeds later, giving two bookings and a double charge.
- **Fix:** treat `processing` as pending, or restrict to `payment_method_types: ['card']`, and give redirects a proper return page.

### M27. The private-lesson editor loses data and accepts invalid member prices

- **Files:**
  - `components/CreatePrivateLessonModal.tsx:111,230-270,355-362`
  - `app/api/community/[communitySlug]/private-lessons/[lessonId]/route.ts:125-151`
  - `app/api/community/[communitySlug]/private-lessons/route.ts:134,147-171`
- **What is wrong:**
  - `member_price: null` goes through `COALESCE`, so the old member price can't be removed.
  - Requirements and max bookings per month are never saved, and the monthly limit is never enforced.
  - The member price can be negative or above the regular price when it is sent alone. A negative value makes `book` call Stripe with a negative amount, which 500s.
  - Price labels say "$" while charges are in EUR.
- **Failure scenario:** a teacher removes the member discount, but members keep paying the discounted price.
- **Fix:**
  - Tell an absent field apart from an explicit null.
  - Save the missing columns.
  - Require `0 <= member_price <= regular_price`.
  - Label prices in €.

### M28. The calendar hides classes near the week boundary

- **Files:**
  - `components/WeekCalendar.tsx:57,91-107`
  - `app/api/community/[communitySlug]/live-classes/route.ts:69-70`
  - `lib/community-data.ts:88-89`
  - `app/[communitySlug]/calendar/page.tsx:27-34`
- **What is wrong:**
  - The client sends local `yyyy-MM-dd` dates, and the server treats them as UTC.
  - The server works out the initial week in UTC, and the client skips its first fetch.
- **Failure scenario:** for viewers in New York, a Saturday 20:00 class never appears in any week. On Saturday evening in the US, or early Sunday in Europe, the current week looks empty.
- **Fix:** send UTC instants, and don't skip the first client fetch.

### M29. The booking slot picker shows the wrong days to students in another timezone

- **Files:** `components/LessonBookingModal.tsx:94`, `components/WeekSlotPicker.tsx:44,91,138-141,187-198`
- **What is wrong:** slots are fetched by UTC date and grouped by the teacher's local date, but times are shown in the student's timezone.
- **Failure scenario:**
  - A Paris student sees a New York Monday 20:00 slot as "Mon 2:00 AM", when it is really Tuesday.
  - US students lose same-evening slots after about 17:00.
  - Some future slots are never shown.
- **Fix:** group and label slots by their actual instant in the student's timezone.

### M30. The video lesson page spins forever for signed-out users

- **File:** `components/VideoSessionPage.tsx:51,57-60,154-160`
- **What is wrong:** this page is the target of the booking-confirmation email link (`webhooks/stripe/route.ts:326`), but it waits for a user that never arrives when signed out.
- **Failure scenario:** a student clicks the email link while signed out and sees an endless spinner instead of a sign-in prompt.
- **Fix:** use the auth `loading` flag and show a sign-in prompt.

### M31. Advertised platform fees don't match the fees charged

- **Files:**
  - `app/HomePageClient.tsx:205,348,617,740` promises "0% platform fees for the first 30 days" and "8% under 50 members, 6% to 100, 4% above".
  - `app/api/community/[communitySlug]/private-lessons/[lessonId]/book/route.ts:111,117` charges a fixed 5% on private lessons, including during the first 30 days and for communities over 100 members.
  - `join-paid/route.ts:76`, `join-pre-registration/route.ts:109` and `webhooks/stripe/route.ts:517,614` use `<= 50`, so a community with exactly 50 members pays 8%.
  - The Terms point to a pricing page that doesn't exist.
- **Fix:** apply the promotional and tier rules to private lessons too (or state the 5% clearly), and line up the tier boundaries with the copy.

### M32. Missing clickjacking protection and HSTS, and a weak CSP

- **File:** `next.config.js:45-67`
- **What is wrong:**
  - There is no `frame-ancestors` or `X-Frame-Options`, so payment and settings pages can be framed.
  - There is no HSTS, no `X-Content-Type-Options: nosniff` and no `Permissions-Policy`.
  - `X-Powered-By` is still sent.
  - `script-src` allows `'unsafe-inline'`, `'unsafe-eval'` and `https://unpkg.com`. unpkg is unused and a known CSP bypass.
  - `object-src`, `base-uri` and `form-action` are not set.
- **Fix:**
  - Add `frame-ancestors 'none'` (or `'self'`), HSTS, `nosniff`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`.
  - Drop unpkg and the vercel.live hosts.
  - Set `poweredByHeader: false`.
  - Plan a nonce-based CSP to remove `'unsafe-inline'`.

### M33. The image optimizer fetches images from any tenant on its allowed hosts

- **File:** `next.config.js:8-34`
- **What is wrong:**
  - The patterns `**.backblazeb2.com/**`, `**.supabase.co/storage/v1/object/public/**` and `**.googleusercontent.com` match any account on those services.
  - Next follows up to 3 redirects for remote images.
  - The disk cache defaults to 50% of free disk, on a box that also runs preprod.
- **Failure scenario:** anyone can use `/_next/image` to fetch and resize arbitrary images from other people's buckets on those hosts, using our CPU and disk.
- **Fix:** pin the exact bucket hostnames and paths, and set `images.maximumDiskCacheSize`.

### M34. `stripe-mode.sh` doesn't actually switch preprod and prints part of the live secret key

- **File:** `stripe-mode.sh:18-45`
- **What is wrong:**
  - Preprod's `.env.local` is only synced by `deploy-preprod.sh`, so after `pm2 restart` preprod comes back with its old keys.
  - The status check reads prod's key because `$DIR` is the prod checkout.
  - `head -c 35` prints 8 characters of the live secret key to the terminal.
- **Failure scenario:** an operator believes preprod is in test mode while it still charges real cards.
- **Fix:** write the preprod env file directly, check the preprod process's own env, and print only the key prefix (`sk_live` or `sk_test`).

### M35. The prod nginx template is HTTP-only and has no body-size limit

- **File:** `deploy.sh:85-113`
- **What is wrong:**
  - Re-running `deploy.sh full` overwrites the certbot TLS block, which takes HTTPS down.
  - With no `client_max_body_size`, nginx's 1 MB default rejects uploads the app accepts: 5 MB images, 10 MB documents and 100 MB audio. Preprod sets `100m`.
- **Fix:** template the TLS server block, or include certbot's snippets, and set `client_max_body_size`.

### M36. Deploys rebuild in the directory production serves from, with no rollback

- **Files:** `deploy.sh:35-51,65-78`, `deploy-preprod.sh:38-44`
- **What is wrong:**
  - `next build` deletes `.next` while pm2 is serving from it.
  - `bun install` rewrites `node_modules` under the live process.
  - `git pull` runs without checking the branch or a clean tree.
  - `cmd_full` uses `npm install` with no lockfile, so it ignores `bun.lock`.
- **Failure scenario:**
  - Every deploy causes chunk 404s and 500s while it builds.
  - A failed build leaves `.next` empty, so the next pm2 restart cannot start the app, and there is no previous build to roll back to.
- **Fix:**
  - Build into a new release directory or worktree, switch a symlink only after `next build` succeeds, and keep the previous release.
  - Use `bun install --frozen-lockfile`.

---

## Low

Each entry gives the file, what is wrong and the impact, then the fix (→).

### API: `app/api/community/**`

- **L1. Course notify has no limits.** `courses/[courseSlug]/notify/route.ts:46-77`
  - No broadcast quota, no protection against repeat sends, no published check.
  - A double click emails everyone twice. A free-tier owner gets unlimited unpaid broadcasts from the shared sender.
  - → Require `is_public`, record `notified_at`, and count the send against the quota.
- **L2. Old rows block joining.** `join/route.ts:59-72`, `join-pre-registration/route.ts:87-99`
  - Any existing row (`inactive`, `pending`, `incomplete_expired`) blocks free join and pre-registration forever with "already a member".
  - → Upsert over rows that are not `active`.
- **L3. `cancel-pre-registration` doesn't cancel the subscription explicitly.** `cancel-pre-registration/route.ts:44-118`
  - It relies on `customers.del`, swallows that error, and deletes the row anyway, so the user can be charged at opening with no row.
  - → `subscriptions.cancel`, and delete the row only on success.
- **L4. Pre-registration subscriptions have no fee or idempotency.** `confirm-pre-registration/route.ts:93-134`
  - No `application_fee_percent` (the fee depends on the `invoice.created` webhook editing the invoice in time), no idempotency key, and the row is inserted only after the subscription is created.
  - → Set the fee at creation, use `idempotencyKey: prereg-${setupIntentId}`, and insert with `ON CONFLICT DO NOTHING` first.
- **L5. Chapter delete leaves Mux assets behind.** `courses/[courseSlug]/chapters/[chapterId]/route.ts:97-118`
  - Mux assets and audio tracks are orphaned, and the two DELETEs aren't in a transaction.
  - → Reuse the course-delete cleanup inside `sql.begin`.
- **L6. Lesson-completion toggle ignores its URL scope.** `.../lessons/[lessonId]/completion/route.ts:12-50`
  - It ignores the community, course and chapter in the URL and doesn't check membership, which makes it a lesson-id existence oracle.
  - → Use `findScopedLesson` and `requireCommunityViewer`.
- **L7. Slugs aren't normalized or checked on rename.** `update/route.ts:51-74,84` and `components/admin/GeneralSettingsForm.tsx:165,207`
  - Unlike create, the update route doesn't normalize the slug or check reserved words.
  - `Salsa-Paris` can sit next to `salsa-paris`.
  - Renaming to "Dashboard" or "Discovery" makes the community unreachable, and the post-save redirect lands in `/admin/...`.
  - → Share the slug normalizer and reserved list between create and update.
- **L8. Back-to-back availability slots are rejected.** `teacher-availability/route.ts:248-256`
  - The overlap check compares `"HH:MM"` strings with `"HH:MM:SS"`.
  - → Compare in minutes.
- **L9. Redundant `members_count` calls can corrupt the row.** `join/route.ts:99-115`, `leave/route.ts:155-189`
  - The increment and decrement duplicate the trigger. When they fail, the "rollback" deletes the new membership, or re-inserts it with columns missing.
  - → Remove both the calls and the compensating writes.
- **L10. Course image upload has no type check.** `courses/route.ts:46-56`, `courses/[courseSlug]/route.ts:201-206`
  - It stores the client's Content-Type and extension with no allow-list or size cap. An `.html` file is served from the CDN.
  - → Allow only images and derive the extension from the type.

### API: the rest of `app/api/**`

- **L11. Custom auth routes skip better-auth's limiter.** `app/api/auth/{reset-password,signup,verify-*,change-email}`
  - They call `auth.api.*` server-side, so better-auth's rate limiter and origin check don't apply.
  - `reset-password` sends unlimited reset emails to any address, and it shadows better-auth's own `POST /api/auth/reset-password`.
  - Its `redirectTo` becomes `"undefined/..."` when `NEXT_PUBLIC_SITE_URL` is unset.
  - Nothing in the UI calls signup, reset-password or verify-email-change.
  - → Delete the unused routes and rate-limit the rest.
- **L12. Replay-lesson webhooks aren't idempotent.** `webhooks/stream-hub/route.ts:61-136`, `webhooks/mux/route.ts:98-173`
  - Every delivery inserts a lesson, so duplicate lessons appear. Course and chapter creation is check-then-insert.
  - → Claim the row with `UPDATE ... WHERE lesson_id IS NULL RETURNING`, and add unique constraints.
- **L13. Stripe's real error message never reaches the user.** `error.type === 'StripeError'` is never true (stripe-node sets subclass names).
  - Found in `update-iban/route.ts:117`, `account-status/[accountId]/route.ts:39`, `custom-account/create/route.ts:142`, and `custom-account/[accountId]/{status:158, verify:105, update:282, upload-document:245}`.
  - Every Stripe error becomes a generic 500; an invalid IBAN shows "Failed to update bank account".
  - → `error instanceof Stripe.errors.StripeError`.
- **L14. A booking cancel can get stuck.** `bookings/[bookingId]/cancel/route.ts:127-159`
  - The refund has no idempotency key, and the DB update after it isn't in a try/catch. If the update fails, the student is refunded but the booking stays `scheduled`, and every retry returns 502.
  - → `idempotencyKey: cancel-${bookingId}`, and treat `charge_already_refunded` as success.
- **L15. `/api/upload` trusts the client.** `upload/route.ts:19,29-34,48` and `lib/storage.ts:136-149`
  - It trusts the client's `image/*` type, so SVG with script is served from the CDN. The client also picks the storage folder.
  - → Use an allow-list without SVG, sniff the file's bytes, and allow-list folders.
- **L16. The admin subscriptions dashboard is fragile.** `admin/subscriptions/route.ts:230-264`
  - One bad connected account fails the whole page (`Promise.all`), `limit:100` has no pagination, and yearly prices are counted as monthly.
  - → `allSettled`, auto-pagination, and divide yearly amounts by 12.
- **L17. Admin course delete runs in the wrong order.** `admin/courses/[courseId]/route.ts:69-106`
  - It deletes Mux assets before the DB rows and swallows DB errors, so the course can be left pointing at videos that no longer exist.
  - → Delete the rows in a transaction first, then the assets.
- **L18. Unsubscribe works on a plain GET.** `email/unsubscribe/route.ts:46-124`
  - Mail scanners that pre-fetch links unsubscribe users.
  - → Show a confirmation page that POSTs, and support RFC 8058 `List-Unsubscribe-Post`.
- **L19. Shared secrets are compared unsafely.** `cron/live-class-reminders/route.ts:85`, `cron/process-community-openings/route.ts:34`, `webhooks/stream-hub/route.ts:36`
  - Plain `!==` comparisons. The Stream-Hub callback accepts the same API key DanceHub sends outbound, and trusts the asset and room ids in the payload.
  - → `timingSafeEqual`, and a dedicated HMAC secret for the callback.
- **L20. The webhook logs PII.** `webhooks/stripe/route.ts:564` logs the whole invoice JSON, including customer email, name and address.
  - → Log ids only.
- **L21. Reminder emails ignore preferences and timezone.** `cron/live-class-reminders/route.ts:137-143`
  - It ignores `email_preferences` (lesson reminders, unsubscribe-all) and formats times in the server's timezone, so everyone sees UTC.
  - → Filter by preferences and format in each recipient's profile timezone.

### `lib/**`

- **L22. The broadcast quota can be exceeded.** `lib/broadcasts/quota.ts:52-61`
  - The count and insert aren't atomic, so parallel sends exceed the free quota.
  - The paid tier is advertised as "Unlimited" but capped at 200, and hitting the cap shows a raw `soft_cap_reached` toast.
  - → Use an advisory lock per community, and fix the copy.
- **L23. Opt-outs are matched by email.** `lib/broadcasts/recipients.ts:44` joins opt-outs on `email` instead of `user_id`.
  - After an email edit, an opted-out member receives broadcasts again.
  - → Join on `user_id`.
- **L24. Whole community rows go to the client.** `lib/community-data.ts:33-38` (`SELECT *`), spread into client components in `app/[communitySlug]/page.tsx:62-80` and `classroom/[courseSlug]/page.tsx:49`
  - Members receive the fee terms, Stripe price and product ids, and the VIP flag.
  - → Select explicit columns and pass a DTO.
- **L25. The end of the grace period isn't enforced.** `lib/community-data.ts:394-398`
  - `status` stays `active` during grace, so access ends only when the webhook arrives. One lost delivery means indefinite access.
  - → Also check `current_period_end <= now`, and run a daily reconcile job.
- **L26. Platform admin has two sources of truth.** The `/admin` layout uses `user.isAdmin` (`app/admin/layout.tsx:19`), while the APIs use `profiles.is_admin` (`lib/community-data.ts:410-415`).
  - Revoking one flag leaves the other in place.
  - → Use one source and delete the dead `requireAdmin` in `lib/auth-session.ts`.
- **L27. Auth hardening gaps.**
  - `lib/auth-server.ts:41-53`: `http://localhost:3000` is trusted in production, as both a CSRF origin and a callback target.
  - Sessions aren't revoked on password reset (`revokeSessionsOnPasswordReset` is unset).
  - Email change needs no confirmation from the old address and no re-authentication.
  - `app/auth/reset-password` enforces at least 6 characters, while better-auth requires 8.
  - → Fix each of these.
- **L28. Request path segments aren't encoded.** `lib/mux.ts:178,192,211,244,256` and `lib/stream-hub.ts:48-88` interpolate ids into paths without encoding.
  - Defense in depth only; no live exploit was found.
  - → `encodeURIComponent` each segment.
- **L29. The public playback-status lookup is uncached.** `lib/mux-playback-status.ts:11-44`
  - Each request scans every community's `about_page` and makes Mux API calls. Scripted polling uses up the Mux and DB budget.
  - → Cache terminal states and rate-limit by IP.
- **L30. Bulk email sending fires everything at once.** `lib/resend/email-service.ts:83-94` (`sendBulkEmails`)
  - Unbounded concurrency, and the results are ignored, so reminders are marked sent even when they failed.
  - → Use the batch API in chunks of 100, and return failure counts.
- **L31. The admin-platform loaders call Stripe uncached.** `lib/admin-platform/revenue.ts:76-203`, `communities.ts:113-158`, `activity-feed.ts:122-161`
  - Every render makes uncached, unbounded Stripe calls, and results are truncated at 1000 or 5000. With C1, an outsider can trigger this.
  - → Use `unstable_cache` per account and month, and bound concurrency.

### Components: `components/admin/**`, `components/community/**`

- **L32. `ManageSubscriptionModal.tsx` shows wrong billing information.**
  - `:366-371` shows the list price, not the discounted next charge.
  - `:290-291` reports a failed card retry (including `authentication_required`) as success.
  - `:320-323` shows a declined upgrade as "your bank needs to confirm".
  - "Manage" appears for members with no subscription (`CommunitySidebar.tsx:316-323`).
  - → Use `invoices.createPreview`, show `retryError`, and branch on the PaymentIntent status.
- **L33. `GeneralSettingsForm.tsx` hides errors and mangles URLs.**
  - `:186-218` replaces the server's error (e.g. "URL already exists") with a generic one.
  - `:107-109` prepends `https://` on every keystroke, producing `https://https://...`.
  - → Show `error.message`, and normalize on blur.
- **L34. Promo expiry is a day early.** `PromoCodesManager.tsx:147`
  - Expiry is set to UTC midnight at the *start* of the chosen day, so the code stops working on the advertised last day.
  - → Use the end of the day in the owner's timezone.
- **L35. The last category can't be deleted.** `ThreadCategoriesEditor.tsx:170-177`
  - Save disappears when the list is empty, so deleting the last category can't be saved.
  - → Always show Save once the list has changed.
- **L36. Edit can save another community's values.** `edit-community-button.tsx:35-37` with `AdminDataTable.tsx:141,175`
  - Form state is copied once and rows are keyed by index. After the list shifts, Edit can save another community's name and slug.
  - → `getRowId: row => row.id`, and reset state when the dialog opens.
- **L37. Banner reposition resets the framing.** `BannerRepositionModal.tsx:118-125` and `BannerCropper.tsx:31-37`
  - The saved focal point is ignored (saving resets it to centre), and the preview's `object-position` maths doesn't match the real banner.
  - → Pass the initial crop and convert the maths correctly.
- **L38. Membership saves create new Stripe Prices.** `SubscriptionsEditor.tsx:674-679`
  - No in-flight guard, and every save creates new Stripe Prices (and a Product on the first double click).
  - Bank name always shows "N/A" (`:841-843`).
  - → Disable the button while saving, create a Price only when the amount changes, and return `bank_name`.
- **L39. Platform admins are rejected by owner-only routes.** `payouts/schedule:95`, `promo-codes:24`, `promo-codes/[id]:85`, `update-image:159`, `update-image-position:226`, `update-iban:24-29`
  - These compare `created_by` only, while the admin UI is shown to platform admins, who then get "Forbidden".
  - → Use `requireCommunityManager`, or hide the controls.

### Components: other subfolders

- **L40. Onboarding wizard rough edges.** `components/stripe-onboarding/OnboardingWizard.tsx`
  - An outdated `accountId` restored from localStorage is never cleared, so every step returns 404.
  - Every time the tab regains focus, the wizard repeats the Stripe call and the "Loaded existing Stripe account" toast.
  - `DocumentUploadStep.tsx:29-39` only uploads the front of the ID document.
  - `BusinessInfoStep` logs business data to the console.
  - The "Testing: Stripe test IBAN" hint is shown in production.
- **L41. Sign-up reveals registered emails.** `components/auth/AuthModal.tsx:105-118`
  - "User already exists. Use another email." lets anyone check whether an email is registered.
  - → Use a neutral message.
- **L42. Failed requests look like empty data.** `components/private-lessons/manage/{BookingsTab,LessonsTab,AvailabilityTab}`
  - Failed requests render as "no data", and `EmailPreferencesCard` stays on "Loading…" forever after an error.
  - → Show error states.
- **L43. `AvailabilityDayPanel` drops input early.** It clears the inputs before the server answers, and never shows which timezone the times are in.

### Components: root `components/*.tsx`

- **L44. The calendar mixes timezones.** `WeekCalendar.tsx:71-89,133-161`, `WeekCalendarDay.tsx:61,135`, `LiveClassModal.tsx:78-79`
  - It mixes the browser timezone with the saved profile timezone. When they differ, classes can be hidden and the pre-filled time is wrong.
- **L45. Thread state goes stale.**
  - `Editor.tsx:127-191` ignores later `content` changes, so an edited thread looks stale until reload.
  - Replies send `comments_count`, but the feed uses `commentsCount` (`ThreadView.tsx:431-434`), so the count goes stale.
- **L46. Join windows are enforced only on the client.**
  - The booking video token checks payment only (`bookings/[bookingId]/video-token/route.ts:56-58`).
  - A cancellation without a refund keeps `payment_status='succeeded'` (`cancel/route.ts:148`).
  - The live-class token ignores cancelled and ended classes (`:79-90`).
  - Impact is limited to joining empty rooms.
- **L47. The schedule is public.** The calendar is labelled members-only in the nav (`CommunityNavbar.tsx:29`), but `calendar/page.tsx`, `GET /live-classes` and `/live-class/[classId]` are public, so logged-out visitors can read the class schedule.
- **L48. `TimezoneSync` overrides UTC.** `TimezoneSync.tsx:24-27` overwrites an explicit "UTC" choice on every page load (it only writes the user's own profile).
- **L49. Signed-out visitors see no availability.** `LessonBookingModal.tsx:76-87` shows signed-out visitors "No availability" and doesn't refetch after sign-in.
- **L50. The cancel-lesson guard never applies.** `CancelLessonModal.tsx:104-112`: the Radix Action closes the dialog immediately, so the submitting state and double-submit guard never take effect.
- **L51. Likes aren't rolled back on network errors.** `Comment.tsx:70-105` and `ThreadCardFluid.tsx:239-268` revert an optimistic like only on `!res.ok`, not on network or session errors.
  - → Move the revert into `catch`.
- **L52. Course modals crash and leak.**
  - `CreateCourseModal.tsx:47-55` crashes when react-dropzone rejects a file.
  - Preview object URLs leak (`:147`, `EditCourseModal.tsx:55`).
  - `EditCourseModal.tsx:42-49` keeps discarded edits after Cancel.
- **L53. `VideoUpload.tsx` can start parallel uploads.** A drop during an upload starts a second upload (`:173-183`), the XHR is never aborted on unmount (`:28-32`), and `cancelUpload` is unused.
- **L54. The tour polls forever.** `NextStepWrapper.tsx:71-84` polls with no cap when a tour target is missing.
- **L55. Calendar controls the API rejects.** `calendar/page.tsx:50` shows schedule and edit controls to site admins, but the API rejects them (UI only).

### Marketing, config and infrastructure

- **L56. The broadcast composer can double-send.** `components/emails/EmailComposer.tsx`
  - Publish re-enables before navigation finishes and has no idempotency key, so a second click sends to everyone again.
  - Failed image uploads in `EmailEditor` throw an unhandled rejection with no toast.
- **L57. Features advertised but not built.** Custom subdomains, member/content export and local-currency pricing are advertised but don't exist (everything is EUR).
  - `/landing-alt` carries these claims, is unlinked, and can be indexed by search engines.
- **L58. The privacy policy is incomplete.** `app/privacy`
  - It omits Mux, Resend, Backblaze B2, LiveKit and Vercel Analytics, and doesn't identify the data controller as GDPR Art. 13 requires.
- **L59. The `Dockerfile` is broken and insecure.**
  - `npm ci` with no lockfile, Node 18 while Next 16 needs 20.9+, and no `output: 'standalone'`.
  - It runs as root.
  - `.dockerignore` doesn't exclude `.env.local` or `.env.preprod*`.
- **L60. Tokens committed in load tests.**
  - `load-tests/stress-test.js:26` has an expired Supabase user JWT containing the founder's email, name and Google ID.
  - `load-tests/threads.js:20` has the Supabase anon key.
  - → Remove them, and consider purging them from history.
- **L61. Vercel leftovers.** Vercel Analytics on the self-hosted deploy requests `/_vercel/insights/script.js`, which 404s on every page view, and `vercel.json` is unused.

### Cross-cutting

- **L62. Hydration mismatches.** `'use client'` components render time- or locale-dependent output during SSR, where the server is UTC and en-US.
  - Affected:
    - `MembersTable.tsx:115,131`
    - the platform tables (`UsersTable.tsx:87`, `CommunitiesTable.tsx:132`, `CoursesTable.tsx:123`, `ThreadsTable.tsx:128`)
    - `ThreadCardFluid.tsx:185`
    - `GeneralSettingsForm.tsx:350-378`
    - `WeekCalendar.tsx:52,259,286-310`
    - `LiveClassVideoPage.tsx:229`
    - `PreRegistrationComingSoon.tsx:89,122,174`
  - React 19 reports hydration errors and client-renders the root. The "today" highlight and past-slot shading can stay wrong.
  - → Use the existing `components/ui/local-date.tsx`, or format after mount.
- **L63. Dead code.**
  - Components and files:
    - `components/StripeRequirementsAlert.tsx`
    - `components/admin/community-actions.tsx` (empty)
    - `components/admin/course-filters.tsx`, `components/admin/thread-filters.tsx`
    - `components/stripe-onboarding/ProgressIndicator.tsx`, `components/stripe-onboarding/CompletionSummary.tsx`
  - Routes:
    - `app/api/bookings/[bookingId]/track-session`
    - the unused auth routes (L11)
  - Webhook branches:
    - `paymentIntent.invoice` (removed in API 2025-03-31.basil), `webhooks/stripe/route.ts:426-464`
    - the Checkout handler, `:66-84,882-885`
  - lib exports:
    - `lib/auth-session.ts` `getUser`, `requireAuth`, `requireAdmin`
    - `lib/storage.ts` `listFiles`, `getSignedUploadUrl`
    - `lib/mux.ts` `createAssetFromUrl(s)`
    - `lib/stream-hub.ts` `deleteRoom`, `getRecordingStatus`
    - `DISPLAY_NAME_PLACEHOLDER` in `lib/broadcasts/sender.ts`
    - 4 unused email templates
  - Other:
    - `communities.members_count`, which no code reads
    - the bank-account return URLs pointing to `/community/settings`, which 404s
    - the no-op Settings button in `LiveKitControlBar.tsx:209-218`
    - 5 unreferenced files in `public/`

---

## Known issues: status

| Known issue | Status |
|---|---|
| Unsanitized HTML in some rich-text fields | **Worse than described.** Thread bodies are writable by any member, not only owners (C2). Broadcast HTML runs in platform admins' sessions on our origin (H7). The CSP allows inline handlers. |
| Raw bank data stored in the DB | **Worse than described.** The onboarding wizard also keeps full account numbers, date of birth and SSN last 4 in localStorage, and the status API sends them back to the browser (M17). |
| Public Mux playback IDs; forgeable asset ownership on uploads | Nothing worse found. `assetBelongsToCommunity` uses exact matching. |
| Member count and avatar lag after leaving with a grace period | Not re-reported. L25 is a separate issue: grace end isn't enforced locally. |
| Leave falls back to `new Date()` when Stripe has no `current_period_end` | Not re-reported. |

## Checked, no issue (highlights)

- **SQL:** no `sql.unsafe` and no string-built SQL anywhere. jsonb is written with `sql.json` (the `no-jsonb-double-encode` test passes). Every dynamic route and page awaits `params` and `searchParams`.
- **Identity:** no API route takes the acting user from the request body. Nested resources are scoped correctly: chapter → course → community, `findScopedLesson`, promo `loadOwnedPromo`, members DELETE by community, and a reply's parent must belong to the same thread.
- **Stripe accounts:** Connect calls in membership, subscription, promo and payout routes pass `{ stripeAccount }`. Broadcast billing correctly uses the platform account. Prices and amounts always come from the DB.
- **Stripe account routes:** `requireStripeAccountManager` is used on account-status, bank-account, create-update-link and custom-account/*. `create-update-link` ignores the client's return URL.
- **Webhooks:**
  - Stripe: raw body via `request.text()`, platform secret then Connect secret, 400 on failure.
  - Mux: HMAC with timestamp tolerance and `timingSafeEqual`.
  - Cron routes fail closed without `CRON_SECRET`.
  - Test routes are disabled in production.
- **Admin API routes:** every `app/api/admin/*` route checks `profiles.is_admin`. The problem in C1 is with the *pages*, not the API.
- **Bookings and threads:**
  - Booking and video-token routes require the student or the owner.
  - Refunds go to the correct connected account, and a double cancel can't refund twice.
  - Thread edit and delete are limited to the author or owner, pin to the owner, and likes are atomic.
- **Personal data and secrets:**
  - The members roster returns emails only to managers.
  - Email templates are auto-escaped.
  - No `NEXT_PUBLIC_*` variable holds a secret.
  - No live Stripe, Resend, Mux, database or auth secret is committed.
  - Deploy scripts use `set -euo pipefail`, and migrations don't run automatically.
- **Other:** timezone and DST handling in `lib/timezone.ts` and `slot-grouping.ts` is correct. React 19 neutralizes `javascript:` hrefs in owner-supplied links.

## Not covered

- Stream-Hub (external service) behaviour.
- The production DB schema beyond what the migrations show (see "Needs confirmation against production").
- Live Stripe account configuration.
- Load and performance testing.
