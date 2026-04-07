# Dance-Hub Runtime Performance Backlog — 2026-04-06

Output of the investigation track from cleanup spec `2026-04-06-cleanup-and-perf-investigation-design.md`. Each row is a discrete fix candidate discovered during Probes A–D. Sorted by impact-per-effort (finalized in Phase 4).

**Status:** FINAL — all four probes completed. Total candidates: 26 (11 from Probe A, 5 each from B/C/D).

**Source:** run on branch `chore/cleanup-and-perf-investigation` after Phases 1–3 cleanup (orphan files deleted, dead deps dropped, config merged).

## Top 5 candidates for the follow-up perf execution spec

**⚠️ This Top 5 was REVISED on 2026-04-07 after Probe B5 (bundle inspection) was completed.** The original plan called for 3 architectural RSC splits (A4/A5/A6 below). The bundle analysis revealed that **most of the projected wins come from 3 small mechanical fixes** (lazy-load PageBuilder section imports, lazy-load NextStepJS, lazy-load TipTap composer) — NOT from the architectural splits. See `2026-04-07-bundle-hotspots-findings.md` for the full analysis.

**New recommended approach:** do "Round A" first — the small mechanical fixes — then measure, then decide if the architectural splits in Round B are still worth doing.

### Round A — 1-2 days, ~284 KB gzip savings
1. **PageBuilder section dynamic-imports** — fix the `/about` page Mux+HLS leak. Single biggest bundle win available. **~284 KB gzip on about page.**
2. **NextStepJS lazy-load** — `~41 KB gzip on /[communitySlug]`.
3. **TipTap lazy-load behind composer focus** — `~60 KB gzip on /[communitySlug]`.

### Round B — only if Round A's measurements suggest it's still worth it
4. **(was A6) Architectural RSC split for `/about`** — marginal incremental gain after Round A fix #1.
5. **(was A4) Architectural RSC split for `/[communitySlug]`** — marginal incremental gain after Round A fixes #2-3.

The architectural rows A4–A11 below are all still valid, just deprioritized below the mechanical fixes in light of the new data.

## Phase 5 candidates (≤ 5-line mechanical fixes from this round)

These meet the strict Phase 5 admission rule (≤ 5 lines, mechanical, reviewable in < 30s, and listed in this backlog). Candidates for immediate execution in Phase 5 of the current cleanup round:

- **B1** — `bun remove motion`. Zero source imports, pure dead dep. One-line change to `package.json`. Definitely qualifies.
- **A1** — Remove `"use client";` from `app/dashboard/layout.tsx`. Needs quick manual confirmation that there's nothing sneaky (like a provider that implicitly needs client), then delete one line. Build will catch any false positive.
- **A3** — Remove `"use client";` from `components/CommunityNavbar.tsx`. Same verification workflow.
- **A2** — Remove `"use client";` from `app/auth/forgot-password/page.tsx`. Same workflow, lower impact (low-traffic page).

**Not trivial enough for Phase 5** (even though they're listed in the backlog):
- All A4–A11 (page splits) — these are architectural refactors, not mechanical fixes. Follow-up spec material.
- C5 and D5 — require DB access and follow-up investigation, not one-line edits.

## Probe findings

## Probe findings

| # | Probe | File / Location | Issue | Proposed Fix | Effort | Impact | Est. Saving |
|---|---|---|---|---|---|---|---|
| A1 | A | `app/dashboard/layout.tsx` | Marked `'use client'` but has no hooks, events, or client-only imports | Remove `'use client'` directive — convert to RSC | S | M | Dashboard shell off client bundle |
| A2 | A | `app/auth/forgot-password/page.tsx` | Marked `'use client'` but has no hooks, events, or client-only imports | Remove `'use client'` directive — convert to RSC | S | L | Low-traffic page |
| A3 | A | `components/CommunityNavbar.tsx` | Marked `'use client'` but has no hooks, events, or client-only imports | Verify manually and remove `'use client'` directive | S | M | Navbar rendered on every community page |
| A4 | A | `app/[communitySlug]/page.tsx` | Full page is `'use client'` with 43 hook usages. Current First Load JS: **411 kB** | Split into server shell (data fetch + static layout) + interactive client island for the navbar/feed | L | H | ~100–200 kB off main community page |
| A5 | A | `app/[communitySlug]/classroom/[courseSlug]/page.tsx` | Client-rendered page. First Load JS: **611 kB** (heaviest route #2) | Split into server shell + client island for the lesson player controls | L | H | Major drop on classroom detail route |
| A6 | A | `app/[communitySlug]/about/page.tsx` | Client-rendered page. First Load JS: **613 kB** (heaviest route #1) | Split — most content is static. Only rich-text editor on description needs client rendering | M | H | ~300+ kB — probably TipTap shipping to a mostly-static page |
| A7 | A | `app/[communitySlug]/classroom/page.tsx` | Client-rendered page. First Load JS: 200 kB | Server-fetch courses, render course grid in RSC, client island only for course-card hover states | M | M | Meaningful cascade wins |
| A8 | A | `app/[communitySlug]/calendar/page.tsx` | Client-rendered page. First Load JS: 187 kB | Split — calendar grid is static, only the week navigator is interactive | M | M | Moderate win |
| A9 | A | `app/[communitySlug]/private-lessons/page.tsx` | Client-rendered page. First Load JS: 218 kB | Split — lesson list can be server-rendered, booking modal stays client | M | M | Moderate win |
| A10 | A | `app/dashboard/page.tsx` | Client-rendered page. First Load JS: 134 kB | Server-fetch user/stats, render in RSC, client island only for action buttons | M | M | Moderate win on dashboard |
| A11 | A | `app/dashboard/settings/page.tsx` | Client-rendered page. First Load JS: 116 kB | Mostly a form — keep client but isolate inside a smaller component, render static headers server-side | M | L | Smaller win |
| B1 | B | `package.json` | `motion@12.23.12` is in dependencies but has ZERO source imports across `app/`, `components/`, `lib/` | `bun remove motion` — trivial Phase 5 candidate | S | M | ~50–100 kB lib + lockfile shrinkage |
| B2 | B | `package.json` — `lucide-react` | Already per-icon imports everywhere (no wildcards found) — nothing to fix | None | — | — | ✅ Already good |
| B3 | B | `package.json` — `date-fns` | All 12 import sites use named imports (`import { format } from 'date-fns'`) which tree-shake correctly in v4 | None | — | — | ✅ Already good |
| B4 | B | `app/admin/*/page.tsx` (5 files) | Import `sql` and `stripe` from server-only libs — confirmed all are RSC (no `'use client'` directive), no client bundle leak | None | — | — | ✅ Server SDK isolation is correct |
| B5 | B | `.next/analyze/client.html` | ✅ **DONE 2026-04-07** — see `2026-04-07-bundle-hotspots-findings.md`. Top finding: `about/page.tsx` LEAKS ~1 MB of mux-player+hls.js because PageBuilder statically imports VideoSection. Single-line `next/dynamic` fix saves ~284 KB gzip on the route. NextStepJS bloats `/[communitySlug]` by 41 KB gzip. TipTap leaks on 3 routes via PageBuilder + composer. Concrete Round A plan with 7 prioritized fixes documented in the findings doc. | n/a — see findings doc | n/a | n/a | Investigation complete |
| C1 | C | `app/api/admin/courses/[courseId]/route.ts:73-83` | `Promise.all(lessons.map(async (lesson) => Video.assets.delete(...)))` — this is an external Mux API fan-out, NOT a DB N+1 | None — appropriate parallelism for external API calls | — | — | ✅ No action |
| C2 | C | `app/api/community/[communitySlug]/courses/[courseSlug]/notify/route.ts:98` | `Promise.allSettled(profiles.map(async (profile) => sendEmail(...)))` — external Resend API fan-out, not DB | None — appropriate parallelism | — | — | ✅ No action |
| C3 | C | `app/api/admin/subscriptions/route.ts:54` | `map(async ({ stripe_account_id }) => ...)` — external Stripe API fan-out | None — appropriate parallelism | — | — | ✅ No action |
| C4 | C | Entire codebase | Uses `sql` tagged templates from `@/lib/db` (Neon), not Supabase query builder. Zero `select('*')` patterns. Query construction is always explicit. | None — already clean | — | — | ✅ Query discipline is good |
| C5 | C | `.next/analyze/` + `supabase/migrations/` (manual follow-up) | Missing-index analysis requires running `EXPLAIN ANALYZE` on the highest-traffic queries against a production-like dataset. Not feasible from grep. | Follow-up: pick top 5 heaviest API routes by traffic, run EXPLAIN on their queries, add CREATE INDEX migrations for any seq scans on large tables | M | H | Depends on specific queries found |
| D1 | D | All `.tsx` files | **Zero raw `<img>` tags** — every image uses `next/image` already | None — already optimal | — | — | ✅ Image discipline is perfect |
| D2 | D | `public/` | Total 152 KB. Biggest file: `Teachers1-2-removebg-preview.png` (108 KB). No files > 500 KB. | None — already small | — | — | ✅ Public assets are tiny |
| D3 | D | `app/layout.tsx` | `next/font` used for Geist, Fraunces, and DM Sans with `display: 'swap'` | None — already optimal | — | — | ✅ Font loading is correct |
| D4 | D | `components/MuxPlayer.tsx`, `sections/VideoSection.tsx`, `app/[communitySlug]/classroom/[courseSlug]/page.tsx` | MuxPlayer is only imported where video is actually displayed — not in layouts or always-rendered shells | None — no leak | — | — | ✅ Good import discipline |
| D5 | D | `next.config.js` `images.remotePatterns` — 5 entries (`**.supabase.co`, `image.mux.com`, `**.googleusercontent.com`, `placehold.co`, `**.backblazeb2.com`) | Cannot determine statically whether any are dead — image URLs come from the database. Manual DB audit needed. | Follow-up: query the DB for distinct image URL hostnames in `communities`, `profiles`, `courses`, `lessons`, `threads` tables. Delete any remotePattern whose hostname has zero DB hits. Likely suspect: `placehold.co` (dev placeholder) | S | L | Cosmetic config cleanup |
