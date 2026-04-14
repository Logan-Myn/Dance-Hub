# Community Broadcasts — Design Spec

**Date:** 2026-04-14
**Status:** Draft — awaiting user review
**Author:** Brainstormed with Claude

## Summary

Let community owners send rich-text emails (broadcasts) to all active members of their community, using the existing Resend integration. Owners get 10 free broadcasts per calendar month. Beyond that, a €10/month per-community Stripe subscription unlocks unlimited sending (with a 200/month anti-abuse soft cap). A platform-admin "VIP" flag per community bypasses quota and billing entirely.

## Goals

- Give community owners a first-party way to reach their members (replaces the need for external tools like Mailchimp).
- Keep the UX simple: compose → send, no scheduling, no segmentation, no analytics in v1.
- Turn email into a revenue line via the €10/month tier.
- Build on existing infrastructure: Resend, Tiptap, B2 storage, Stripe, the existing email preferences system.

## Non-goals (v1)

- Scheduling broadcasts for later.
- Recipient segmentation beyond "all active members".
- One-to-one teacher→student messaging.
- Attachments (PDFs, files). Inline images only.
- In-app open/click analytics (Resend dashboard covers this).
- Drafts auto-save.
- A/B testing.
- Resend-to-failures action.
- Per-recipient delivery status table (`email_broadcast_recipients`).

---

## User stories

**As a community owner:**
- I can open an "Admin" section of my community, click "Emails", and compose a rich-text email with headings, lists, links, and inline images.
- I can send that email as a single broadcast to all currently active members of my community.
- I can see how many of my 10 free broadcasts I've used this month, and upgrade to the €10/month unlimited tier when I run out.
- I can view a history of broadcasts I've sent, with status (sent / partial failure / failed) and recipient count.
- I can send a test broadcast to myself before sending to members.

**As a community member:**
- I receive broadcasts in my email inbox with the community's name as the sender.
- I can unsubscribe from teacher broadcasts specifically, without unsubscribing from booking receipts or other transactional emails.

**As a platform admin (the dance-hub operator):**
- I can mark a community as VIP, giving it unlimited free broadcasts.
- VIP status is visible to the community owner as a badge.
- I can monitor broadcast volume per community (via SQL query, no dashboard in v1).

## Success criteria

- An owner can compose and send a broadcast end-to-end in under 2 minutes.
- Quota counter decrements correctly and resets on the 1st of the month.
- Stripe upgrade flow successfully converts a quota-exhausted owner to paid.
- Members who opted out of `teacher_broadcast` don't receive broadcasts.
- Broadcasts arrive in member inboxes within ~30 seconds of send.

---

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Who sends | Community owner only (`community.created_by`) |
| Recipients | All currently-active members of the community |
| Sending mode | Broadcast only (one email → many recipients). No one-to-one. |
| Quota unit | 1 broadcast = 1 quota unit (regardless of recipient count) |
| Free tier | 10 broadcasts / calendar month, resets on the 1st |
| Paid tier | €10 / month per community, unlimited with a 200/month soft cap |
| VIP | Per-community flag, admin-only toggle, bypasses quota + billing, visible badge |
| Editor | Tiptap (same stack as threads), new `EmailEditor` variant with email-appropriate toolbar |
| Images | Inline images only, uploaded to Backblaze B2 via existing `lib/storage*` |
| Unsubscribe | New `teacher_broadcast` preference key in the existing email preferences system |
| Sender identity | From: `{Community name} <community@dance-hub.io>`, Reply-To: owner's email |
| Billing | Stripe platform subscription (not Stripe Connect) |
| Send mechanism | Resend Batch API, chunks of 100, 250ms throttle to stay under 5 req/sec |
| Scheduling | Send now only. No scheduled send in v1. |
| Entry point | New owner-only "Admin" tab in community navbar → `/[communitySlug]/admin/emails` |
| Billing gate for quota | Active subscription OR VIP OR under 10/month |

---

## Data model

### New table: `email_broadcasts`

Audit trail + source of truth for quota counting.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `community_id` | uuid FK → communities | ON DELETE CASCADE |
| `sender_user_id` | uuid FK → profiles | Owner at time of send |
| `subject` | text NOT NULL | |
| `html_content` | text NOT NULL | Final HTML as sent (wrapped in `base-layout.tsx`) |
| `editor_json` | jsonb NOT NULL | Tiptap doc — enables duplicate/re-edit later |
| `preview_text` | text | Email preheader, optional |
| `recipient_count` | int NOT NULL | Number of recipients at send time |
| `status` | text NOT NULL | `pending` / `sending` / `sent` / `partial_failure` / `failed` |
| `resend_batch_ids` | text[] | Resend IDs for debugging |
| `error_message` | text | Populated on failure |
| `sent_at` | timestamptz | Null until send completes |
| `created_at` | timestamptz NOT NULL default now() | Used for monthly quota counting |

**Indexes:**
- `(community_id, created_at DESC)` — quota queries + history list

### New table: `community_broadcast_subscriptions`

Stripe subscription state for the €10/month unlimited tier, per community.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `community_id` | uuid FK → communities UNIQUE | One subscription per community |
| `stripe_customer_id` | text NOT NULL | |
| `stripe_subscription_id` | text NOT NULL | |
| `status` | text NOT NULL | `active` / `past_due` / `canceled` / `incomplete` |
| `current_period_end` | timestamptz | |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | |

**Indexes:**
- `(stripe_subscription_id)` — webhook lookups

### New column on `communities`

- `is_broadcast_vip` boolean NOT NULL default false — admin toggle; bypasses quota + billing.

### New email preference key

Add `teacher_broadcast` to the existing preferences system (used by `lib/resend/check-preferences.ts`). **Default: opted-in** — members expect community newsletters when they join a community.

### Quota calculation

No counter table — compute on the fly:

```sql
SELECT count(*) FROM email_broadcasts
WHERE community_id = :id
  AND created_at >= date_trunc('month', now())
  AND status IN ('sent', 'sending', 'partial_failure');
```

Always consistent, no drift, cheap with the `(community_id, created_at)` index.

---

## Architecture

### Module layout

```
app/
  [communitySlug]/
    admin/
      layout.tsx                 # owner-only gate, admin sub-nav
      page.tsx                   # redirects to ./emails for v1
      emails/
        page.tsx                 # list of past broadcasts + "New broadcast" button
        new/page.tsx             # composer
        [broadcastId]/page.tsx   # view a past broadcast (read-only)
  api/
    communities/[communityId]/
      broadcasts/
        route.ts                 # POST (send), GET (list)
        [broadcastId]/route.ts   # GET one
        quota/route.ts           # GET current quota + billing state
        subscription/route.ts    # POST (checkout session), DELETE (cancel)
    webhooks/stripe/route.ts     # extend to handle broadcast subscription events

components/
  admin/
    AdminNav.tsx                 # sub-nav inside /admin
  emails/
    EmailComposer.tsx            # top-level compose UI
    EmailEditor.tsx              # Tiptap variant for email
    QuotaBadge.tsx               # "3 of 10 used" / "VIP" / "Unlimited"
    UpgradeDialog.tsx            # Stripe checkout flow when quota exhausted
    BroadcastHistoryList.tsx

lib/
  broadcasts/
    quota.ts                     # getQuota(), checkCanSend() — the gate
    sender.ts                    # runBroadcast() — batch send orchestration
    recipients.ts                # getActiveRecipientsForCommunity()
    billing.ts                   # Stripe checkout + subscription helpers
  resend/
    templates/marketing/
      broadcast.tsx              # React Email template wrapping editor HTML
```

### Send flow (happy path)

```
Owner clicks "Send now"
  ↓
POST /api/communities/:id/broadcasts
  ↓
Auth: requester must be community owner (community.created_by)
  ↓
checkCanSend(communityId):
  - If is_broadcast_vip → allow
  - Else if active subscription:
      → allow if < 200/month (soft cap)
      → else 429 with reason: "soft_cap_reached"
  - Else count broadcasts this calendar month (status in sent/sending/partial_failure):
      → allow if < 10
      → else 402 with reason: "quota_exhausted"
  ↓
Insert email_broadcasts row (status: "sending")  ← row counts against quota immediately, prevents race condition
  ↓
Fetch active recipients:
  - members of community with active subscription/membership status
  - opted-in to teacher_broadcast preference
  ↓
If recipients empty → update status to "failed", return 422 "no_recipients"
  ↓
Render final HTML:
  - Wrap editor HTML in base-layout.tsx
  - Per-recipient: inject unsubscribe link + preferences link
  ↓
Chunk recipients into batches of 100
  ↓
For each batch:
  try resend.batch.send([...])  # up to 3 retries with backoff on failure
  wait 250ms  # stay under 5 req/sec
  ↓
Update email_broadcasts:
  status: "sent" | "partial_failure" | "failed"
  resend_batch_ids
  sent_at: now()
  ↓
Return 200 { broadcastId, recipientCount, status }
```

### Stripe subscription flow

```
Owner clicks "Upgrade" in the composer or quota banner
  ↓
POST /api/communities/:id/broadcasts/subscription
  → create Stripe Checkout Session
  → metadata: { communityId, ownerId }
  → success_url: back to composer
  ↓
Redirect owner to Stripe Checkout
  ↓
Stripe webhook: checkout.session.completed
  → insert community_broadcast_subscriptions row with status "active"
  ↓
Ongoing Stripe webhooks:
  - customer.subscription.updated → update status + current_period_end
  - customer.subscription.deleted → status = "canceled"
  - invoice.payment_failed → status = "past_due"
```

`past_due` is treated as free tier (10/month quota applies) with a banner in the UI asking the owner to update payment.

---

## Error handling

| Scenario | Behavior |
|---|---|
| Non-owner calls API | 403 |
| Quota exhausted (free tier) | 402, `reason: "quota_exhausted"` — UI shows upgrade dialog |
| Soft cap hit (paid tier) | 429, `reason: "soft_cap_reached"` — UI asks owner to contact support |
| Empty recipient list | 422, broadcast row marked `status = failed`. Not counted against quota (quota query only counts `sent` / `sending` / `partial_failure`). |
| Resend batch call fails | Up to 3 retries per batch with exponential backoff |
| Some batches fail after retries | Broadcast marked `partial_failure`, `error_message` populated, toast tells owner how many failed. No auto-retry in v1. |
| Stripe subscription past_due | Treat as free tier, show banner in UI |
| Concurrent send at quota edge | Insert-then-count pattern: quota query includes the current row being inserted, so the second request sees N+1 and is rejected |
| Server crashes mid-send | Row left in `sending` state. **Known risk — cleanup cron is a follow-up.** |

---

## UI

### Navigation

New "Admin" tab in the community navbar, rendered only when `community.created_by === currentUserId`:

```
Community | Classroom | Calendar | Private lessons | [Admin]
```

`/admin` redirects to `/admin/emails` in v1. Admin page has a left sidebar for sub-sections so we can add more owner tools later (members management, analytics, etc.).

### `/admin/emails` — list page

- Header: page title + `[+ New email]` button.
- Quota row: `Quota: 3 / 10 this month` with inline `[Upgrade →]` when applicable. Shows `VIP · Unlimited` or `Unlimited (Pro)` instead when relevant.
- Below: list of past broadcasts, most recent first. Each row shows subject, sent date, recipient count, status badge. Clicking opens the broadcast detail.

### `/admin/emails/new` — composer

Two-column layout on desktop (editor left, side panel right), stacked on mobile:

- **Left column:**
  - Subject input (required)
  - Preview text input (optional — shows as preheader in inbox)
  - Toolbar: B, I, H1, H2, bullet list, ordered list, link, image, align left/center/right, clear formatting
  - Tiptap editor area (min height ~400px)
- **Right column (side panel):**
  - Recipient count: "147 active members"
  - Sending from: `{Community name} <community@dance-hub.io>`
  - Reply-to: owner's email
  - Quota status: `3 of 10 used` (or VIP / Unlimited)
  - `[Send test to me]` — sends only to owner, bypasses quota, subject prefixed `[TEST]`
  - `[Send now]` — primary action

### `/admin/emails/[broadcastId]` — detail page

Read-only view: subject, recipient count, sent timestamp, status, rendered HTML preview. No edit/resend/duplicate in v1.

### `EmailEditor` — Tiptap config

Extends the shared Tiptap pattern (`components/Editor.tsx`) with an email-tuned toolbar.

**Included:**
- Bold, italic, underline
- H1, H2
- Bullet + ordered lists
- Links (popover URL input)
- Images: file picker → client-side resize (max 800px wide) → upload to B2 via `lib/storage-client` → insert `<img src="...">` at cursor
- Text alignment (left/center/right) via `@tiptap/extension-text-align`
- Clear formatting

**Deliberately omitted** (cause email-client rendering issues): tables, code blocks, colors, fonts, video embeds.

Editor HTML is wrapped in `base-layout.tsx` at send time so styling is consistent with other marketing emails and members get the dance-hub header/footer + unsubscribe link.

### Upgrade flow

When an owner has used 10/10 broadcasts:
- `[Send now]` is disabled and replaced with `[Upgrade to send →]`.
- Click opens a dialog: "You've sent 10 emails this month. Upgrade to unlimited for €10/month."
- `[Subscribe]` button → Stripe Checkout.
- On return (success), composer reloads with unlimited status. Editor content is preserved in local storage across the redirect.

### VIP badge

Green pill: `VIP · Unlimited`. Non-dismissible, shown on the list page quota row.

### Loading / error states

- Send button while sending: `Sending... (batch 2/3)`.
- On failure: toast with error message, composer state preserved.
- On partial failure: toast "Sent to 145 of 147 members. 2 failed delivery." linked to broadcast detail.

---

## Testing strategy

### Unit tests (Jest)

- `lib/broadcasts/quota.ts`: `getQuota()` and `checkCanSend()` across all states (free under limit, free at limit, paid active, paid past_due, VIP). Cover calendar-month boundary (Mar 31 broadcast doesn't count toward April).
- `lib/broadcasts/recipients.ts`: filters cancelled members, opt-outs, members of other communities. Returns empty list gracefully.
- `lib/broadcasts/billing.ts`: checkout session creation, subscription state transitions from fake Stripe webhook events.

### API tests (Jest, `test:api`)

- POST happy path.
- Non-owner → 403.
- Quota exhausted → 402 with correct reason.
- Concurrent sends at quota edge — only one succeeds.
- Resend batch failure → partial_failure status.
- Empty recipient list → 422, quota not consumed.
- Stripe webhook: `checkout.session.completed` creates subscription row; `customer.subscription.deleted` marks it canceled.

### Component tests (Jest, `test:components`)

- `EmailEditor` toolbar actions produce expected Tiptap transactions.
- `QuotaBadge` renders correctly for each state.
- `UpgradeDialog` disabled send → click fires checkout.

### E2E (Playwright) — one smoke test

- Sign in as owner → Admin → Emails → New → compose → send test → assert success toast. Use Resend test addresses (`delivered@resend.dev`, `bounced@resend.dev`).

### Not tested in v1

- Cross-client email rendering (manual QA only for v1).
- Load testing.

### Manual QA before launch

- Plain text, with headings, inline images, links, bold/italic/lists — each in Gmail web, Gmail iOS, Apple Mail, Outlook web.
- Unsubscribe link correctly opts member out of `teacher_broadcast`.
- Send to `bounced@resend.dev` → broadcast marked `partial_failure`.
- Stripe test mode: subscribe → verify unlimited → cancel → verify quota re-applies.
- VIP toggle → verify badge + bypass.

---

## Rollout plan

### Phase 0 — migrations & kill switch
- Ship DB migrations + new email preference key.
- Add env-based kill switch so the feature can be disabled in prod without a rollback.

### Phase 1 — VIP-only soft launch
- Admin tab hidden unless `is_broadcast_vip = true`.
- Mark 1–2 friendly communities as VIP.
- Watch Resend dashboard — free tier is 100 emails/day, a 150-member broadcast is ~50% of daily budget.

### Phase 2 — general availability
- Remove VIP gate. Feature visible for all community owners.
- Announce in-app.
- **Upgrade to Resend Pro ($20/month)** when either: first paying customer converts, or daily volume exceeds ~70 emails/day consistently.

---

## Monitoring

- Log every broadcast send: community_id, recipient_count, status, duration, batch count.
- Ad-hoc SQL: broadcasts per community per month, to watch who approaches the 200/month soft cap.
- Stripe subscription events (existing log stream).
- Resend dashboard for delivery metrics.

---

## Known risks

1. **Resend free-tier daily cap (100/day).** Feature will fail on busy days once owners start using it. Mitigation: upgrade to Resend Pro before GA (Phase 2).
2. **Single send-loop failure.** If the API route crashes mid-send, broadcast row left in `sending` state. Mitigation (follow-up): cleanup cron that marks stuck rows `failed` after N minutes.
3. **Inline images on B2.** If B2 URLs are reorganized later, historical sent emails will have broken images. Mitigation: don't reorganize B2 image paths after sending; consider a dedicated `email-assets/` prefix that's never touched.
4. **€10/month margin vs Resend Pro cost.** Break-even is 2 paying communities. Until then, this feature is an infra-cost expansion.

---

## Future work (not v1)

- Scheduled sends (requires background worker).
- `email_broadcast_recipients` table + Resend webhooks for in-app open/click analytics.
- Re-send to failed recipients.
- Drafts (auto-save + list).
- Duplicate-from-past-broadcast.
- Segmentation (active vs. cancelled, by date joined, by purchase history).
- Size-based pricing tiers (€10 for ≤200 members, €25 for ≤1000, etc.).
- Migrate the community settings modal into the new admin panel.
- Per-community subdomains for sender reputation isolation.

---

## Open questions

- Exact "Admin" tab icon and position order in the navbar — finalize during implementation.
- Exact 200/month soft cap number — revisit after 2–3 months of real data.
- Whether to surface "send to self as test" inside the composer or as a separate menu action — finalize during implementation.
