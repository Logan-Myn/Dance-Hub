# Dance-Hub Cleanup & Performance Investigation — Design

- **Date:** 2026-04-06
- **Branch context:** authored on `feature/stream-hub-integration`; cleanup work should land on its own branches.
- **Status:** Design — awaiting user review before plan generation.
- **Approach:** Phased cleanup, lowest-risk first, with measurement bracketing (B + touch of C from brainstorming).

---

## 1. Context

Dance-Hub has been in active development for a long time without a dedicated cleanup or performance pass. A scan of the repo turned up several signals that the codebase is mid-flight on multiple migrations and is carrying meaningful dead weight as a result:

- **Daily.co → LiveKit/Stream-Hub** video migration is essentially complete. Six Daily-flavored video components remain as orphan files (`DailyVideoCall.tsx`, `CustomDailyRoom.tsx`, `SimpleDailyCall.tsx`, `SimpleVideoCall.tsx`, `UltraSimpleDaily.tsx`, `VideoCall.tsx`). The only remaining live reference is a type-only import in `components/LiveClassChat.tsx:7` (`import type { HandRaise, ActiveSpeaker } from "./CustomDailyRoom"`). The `@daily-co/daily-js` and `@daily-co/daily-react` dependencies are still installed.
- **Supabase auth-helpers → better-auth** migration is essentially complete. `middleware.ts` uses better-auth, `lib/auth-server.ts` and `lib/auth-client.ts` are wired in, and a `migrate-users-to-better-auth.ts` script exists. The only remaining `@supabase/auth-helpers-nextjs` import is one line: `lib/supabase/client.ts:13`.
- **Rich-text editor stack** has three libraries installed (`@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `novel`, plus the `@tiptap/*` family). Only TipTap is actually imported anywhere — by `components/Editor.tsx` and `components/Thread.tsx`. BlockNote and Novel are pure dead dependencies.
- **Toast libraries**: both `react-hot-toast` and `react-toastify` are imported across ~56 files. This is real duplication, not orphans — both are in active use.
- **Duplicate config files**: `next.config.js` and `next.config.mjs` both exist and differ. The `.js` file is the long, current one with the LiveKit CSP fix from commit `7844741`, redirects, and Mux/Backblaze image hosts. The `.mjs` file is a stale, minimal copy with just `output: standalone` and three image hosts. Next.js's precedence rule when both exist is to prefer `.mjs`, so depending on deployment, the LiveKit CSP fix may not actually be in effect — this is a potential latent bug, not just cosmetic clutter. The same dual-file situation exists for `tailwind.config.js` and `tailwind.config.ts`.
- **Loose docs at repo root**: `API_TESTING_GUIDE.md`, `FRONTEND_INTEGRATION_GUIDE.md`, `FRONTEND_STATUS.md`, `PHASE_1_IMPLEMENTATION_SUMMARY.md`, `PRE_REGISTRATION_IMPLEMENTATION.md`, `SIMPLE_TEST_GUIDE.md`, `STRIPE_CUSTOM_ONBOARDING_PLAN.md`, `url_restructure_plan.md`. Plus a `backup/` directory containing an 84K orphan supabase snapshot, and a `better-auth-schema.sql` SQL file at root (uncertain whether already applied to the DB).
- **`'use client'` density**: 78 client directives across `components/` and 17 in `app/` — i.e. effectively every component is client-rendered, despite `CLAUDE.md` explicitly instructing "Favor React Server Components over client components, Minimize 'use client' usage". This is the single largest runtime-perf opportunity in the codebase, and is the centerpiece of the investigation track.
- **Filesystem starting points** for measurement: `node_modules` is 1.2 GB, `.next` is 536 MB.

The cleanup is in scope for this round. The runtime perf *fixes* are explicitly out of scope (with a narrow Phase 5 exception for trivial wins). Investigation of the runtime perf surface is in scope and produces a backlog for a follow-up spec.

---

## 2. Goals

1. Make the Dance-Hub repo visibly sharper: no orphan files, no dead deps, no half-finished migrations, no duplicate config files, no loose docs cluttering the root.
2. Quantify the cleanup with hard before/after numbers (dependency count, install size, JS bundle size per route, build time) so the round produces a measurable receipt.
3. Land each change in a small, reviewable, revertable phase. No big-bang PRs.
4. Run a runtime performance investigation that produces a prioritized backlog of page-load improvements (RSC conversion, image optimization, query patterns), with concrete file targets — not a vague "make it faster" wish list.
5. Verify and resolve the `next.config.js` vs `.mjs` duplication, since it may be a latent CSP/redirects bug masquerading as cosmetic clutter.
6. Land trivial perf wins from the investigation (≤ 5-line, mechanical fixes) inside this round, while deferring all meaningful refactors to a follow-up spec.

## 3. Non-Goals

1. **Executing the meaningful runtime perf improvements** (RSC rewrites, query refactors, suspense/streaming refactors, missing-index migrations). The investigation produces the *plan*; the execution is a separate spec/sprint. Phase 5 ships only ≤ 5-line mechanical fixes from the backlog.
2. Refactoring component file naming to kebab-case, even though `.cursorrules.json` says so. ~70 file renames is pure churn this round.
3. Touching the Stream-Hub / LiveKit integration itself. It's the active feature work and out of bounds for cleanup.
4. Database schema cleanup (dropping unused columns/tables). Different risk profile, deserves its own spec.
5. Replacing any *working* feature, library, or service. This is cleanup, not redesign.
6. Performance work on third-party services we don't control (Stripe, Mux, Resend latency).

---

## 4. Phase Plan

Five phases, executed in strict order. Each one is its own commit (or PR) so any single step can be reverted without unwinding the others. Phase ordering rationale: Phase 0 is data; Phases 1–3 are ascending blast radius (orphan deletes → one-line swap → ~30-file migration); Phase 4 is the receipt; Phase 5 is the trivial-wins tail.

### Phase 0 — Baseline measurement (no code changes)

- Add `@next/bundle-analyzer` as a dev dependency, wired into `next.config.js` behind an `ANALYZE=true` flag.
- Run `ANALYZE=true bun run build` once and capture: total client JS size, top 10 heaviest routes, top 20 heaviest modules.
- Run `bun run build` clean and capture: total build time, `.next` directory size, `node_modules` size, count of `dependencies` in `package.json`.
- Save all numbers in `docs/superpowers/specs/2026-04-06-cleanup-baseline.md` so Phase 4 can diff against them. Document the exact commands so Phase 4 can reproduce identically.
- **Deliverable:** baseline file checked into git. Zero behavioral changes.

### Phase 1 — Pure deletes (zero runtime risk)

Each numbered sub-step lands as its own commit so it's individually bisectable.

1. **Resolve `next.config` duplication.** Verify which file Next.js is actually loading by adding a temporary `console.log("loaded: js")` to `next.config.js` and `console.log("loaded: mjs")` to `next.config.mjs`, running `bun dev`, and observing which prints. Delete the loser. If `.mjs` was winning, this also fixes the latent CSP/redirects bug — explicitly verify (a) a LiveKit room loads after the fix, (b) the `/community/foo` → `/foo` redirect still fires.
2. **Move Daily type defs.** Extract `HandRaise` and `ActiveSpeaker` interfaces from `components/CustomDailyRoom.tsx` into `types/live-class.ts`. Update the one importer (`components/LiveClassChat.tsx:7`).
3. **Delete the 6 orphan Daily files**: `DailyVideoCall.tsx`, `CustomDailyRoom.tsx`, `SimpleDailyCall.tsx`, `SimpleVideoCall.tsx`, `UltraSimpleDaily.tsx`, `VideoCall.tsx`.
4. **Drop dead dependencies** from `package.json`: `@daily-co/daily-js`, `@daily-co/daily-react`, `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `novel`. Run `bun install` to refresh the lockfile.
5. **Clean Daily references from the surviving Next config's CSP** (`*.daily.co`, `wss://*.daily.co`, `api.daily.co` entries in `script-src`/`connect-src`/`frame-src`/`media-src`). Edit whichever file step 1 left in place. Only after step 3 confirms no Daily code remains.
6. **Resolve `tailwind.config.js` vs `tailwind.config.ts` duplication** using the same technique as step 1: identify which one is loaded, delete the other.
7. **Delete `backup/`** (the 84K orphan supabase snapshot). If it has anything worth keeping, archive to git history first via a `git mv` to `docs/archive/old-supabase-backup/`.
8. **Reorganize loose root docs** into `docs/archive/`: `API_TESTING_GUIDE.md`, `FRONTEND_INTEGRATION_GUIDE.md`, `FRONTEND_STATUS.md`, `PHASE_1_IMPLEMENTATION_SUMMARY.md`, `PRE_REGISTRATION_IMPLEMENTATION.md`, `SIMPLE_TEST_GUIDE.md`, `STRIPE_CUSTOM_ONBOARDING_PLAN.md`, `url_restructure_plan.md`. `README.md` and `CLAUDE.md` stay at root. Before moving, grep for any internal links or CI references to those filenames and update them.
9. **Decide on `better-auth-schema.sql`** at repo root: if already applied to the DB, move it to `supabase/migrations/` with a proper timestamp prefix; if already there, delete the root copy.

**Verification gate for Phase 1:** `bun run build` passes, `bun lint` passes, `bun test` passes, manual smoke test of one live class room load and one private lesson booking page (both touch the video stack we just cleaned).

### Phase 2 — Auth one-liner swap

- Edit `lib/supabase/client.ts:13`: replace `import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"` with the equivalent `createBrowserClient` from `@supabase/ssr`. Adjust the call site (one function).
- Drop `@supabase/auth-helpers-nextjs` from `package.json`. Run `bun install`.
- **Verification gate:** auth still works on a smoke-tested page (login + dashboard load).

### Phase 3 — Toast consolidation

- Audit every `react-toastify` import site (~30+ files). Build a small mapping table from toastify's API to react-hot-toast's API. `toast.success`, `toast.error`, `toast.loading` mostly translate 1:1. `ToastContainer` becomes `<Toaster />`. Decide explicitly how to handle any toastify-only features (`toast.warning`, progress bars, etc.) — most likely substitute with `toast()` plus an icon, and document the choice in the commit message.
- Migrate file by file in groups of 5–10 per commit so the diff stays reviewable.
- Ensure `<Toaster />` is mounted exactly once in `app/layout.tsx`. Remove every `<ToastContainer />` and `import 'react-toastify/dist/ReactToastify.css'`.
- Drop `react-toastify` from `package.json`. Run `bun install`.
- **Verification gate:** spot-check 5 user flows that fire toasts (login error, course save, payment success, lesson booking, generic error).

### Phase 4 — Re-measure & wins report

- Re-run the same Phase 0 measurements with the same commands.
- Write a delta report into `docs/superpowers/specs/2026-04-06-cleanup-results.md` covering: dependencies removed, KB shaved per route, build-time delta, install-size delta. Format: a table per metric with `before | after | delta | %`, plus a one-paragraph narrative.
- End the wins report with a "Next steps" section that names the follow-up perf spec by date and topic, so the perf backlog has a concrete commitment to be executed.
- Publish the runtime perf investigation backlog (see Section 5) as `docs/superpowers/specs/2026-04-06-perf-backlog.md`.

### Phase 5 — Trivial perf wins from the investigation

**Strict admission rule.** A fix can be in Phase 5 only if **all four** are true:
1. Diff is ≤ 5 lines.
2. Change is mechanical (no judgment about data flow, auth, or hydration).
3. A reviewer can verify correctness in under 30 seconds.
4. It's listed in the perf backlog (Probe A/B/C/D output) — no ad-hoc additions.

**Examples that qualify:**
- Removing unused entries from `next.config.js` `images.remotePatterns`.
- `<img>` → `<Image>` swap where width/height are obvious.
- Removing a leaked server-only import from a client component.
- Per-icon `lucide-react` imports if any file does `import * as Icons`.
- Removing `'use client'` from a file with literally no interactivity (no hooks, no events, no browser APIs).

**Examples that DO NOT qualify** (go to follow-up spec):
- Splitting a large client component into RSC + island.
- Rewriting an N+1 query into a join.
- Adding a missing DB index.
- Suspense/streaming refactors.

Phase 5 lands as one commit per category ("image swaps", "icon imports", "client-directive removals"), each independently revertable. **Verification gate:** full smoke test, since these touch real rendering code.

---

## 5. Runtime Performance Investigation Track

**Timing.** This track runs in parallel with Phases 1–3. It is read-only — it doesn't touch application code — so it can't conflict with the cleanup phases. The four probes can each be done independently. Probe outputs are merged into the consolidated backlog (`2026-04-06-perf-backlog.md`) which is finalized as part of Phase 4. **Phase 5 is blocked on the finalized backlog**, so the investigation must complete before Phase 5 begins.

It produces a backlog, not code changes. Four scoped probes; each is read-only.

### Probe A — Client/Server boundary audit

**Question:** Which of the 95 `'use client'` files (78 in `components/` + 17 in `app/`) actually need to be client components, and which were marked client out of habit?

**Method:**
1. For each `'use client'` file, classify into one of four buckets:
   - **MUST be client** — uses `useState`, `useEffect`, browser APIs, event handlers, or third-party client-only libs (LiveKit, Stripe Elements, TipTap, dnd-kit).
   - **Could be partially RSC** — wraps a small interactive island in a larger static shell. Candidate for splitting.
   - **Should be pure RSC** — only renders props/data, no interactivity. Marked client by mistake.
   - **Layout/wrapper** — provides context. Maybe convertible.
2. Pay special attention to page-level files in `app/[communitySlug]/**` and `app/dashboard/**`, since converting those to RSC has cascading data-fetching wins.

**Deliverable:** a CSV/markdown table of all 95 files, classified, with a "convert effort" estimate (S/M/L) and a "user-facing impact" estimate (low/med/high) for the top 20.

### Probe B — Bundle hot-spot analysis

**Question:** What's actually big in the JS bundle, and why?

**Method:**
1. Use the bundle-analyzer output from Phase 0.
2. For the 5 heaviest routes, identify the top 3 contributing modules each.
3. Look for known offenders: `motion` (often bigger than expected), `date-fns` (verify tree-shaking), `@blocknote/*` (will be gone after Phase 1, confirm), `react-toastify` (gone after Phase 3, confirm), `lucide-react` (must be imported per-icon, not as `import * as`), `@radix-ui/*` (one package per primitive — verify nothing's accidentally importing all).
4. Check for client-side imports of server-only heavy deps (Stripe Node SDK, AWS S3 SDK, `pg`, Mux Node SDK). Any leaking into the client bundle is an instant fix.

**Deliverable:** ranked list of "top 10 bundle wins" — each with route, offending module, proposed fix, and estimated KB saved.

### Probe C — Database query patterns

**Question:** Where are the N+1s and missing indexes?

**Method:**
1. Inventory every Supabase query in `app/api/**` and in server components/loaders. Look for:
   - Loops that issue queries inside (`.map(async ...)` patterns) — classic N+1.
   - Queries that fetch full rows when `.select('id, name')` would do.
   - Repeated queries on the same page that could be a single join.
   - Listing endpoints without pagination.
2. Cross-reference against `supabase/migrations/` to see which tables have indexes on the columns being filtered/joined.
3. For the highest-traffic routes (`[communitySlug]/page.tsx`, `classroom/page.tsx`, `dashboard/page.tsx`), trace the full data graph for a single page load.

**Deliverable:** list of "top 10 query wins" — file, line, the bad pattern, the fix, and which migration to add (if an index is missing).

### Probe D — Image, font, and asset audit

**Question:** What's downloading on every page load that doesn't need to?

**Method:**
1. Inventory `<img>` tags vs `next/image` usage. Every raw `<img>` is a missed optimization.
2. Check `app/fonts/` and font loading strategy — is `next/font` used with `display: swap`?
3. Check `public/` for huge files that should be on a CDN or removed.
4. Verify `MuxPlayer` isn't loaded on pages that don't show video.
5. Check `next.config.js` `images.remotePatterns` — are all listed hosts actually used?

**Deliverable:** list of asset fixes — file, what's wrong, expected weight saved.

### Final investigation deliverable

A single document `docs/superpowers/specs/2026-04-06-perf-backlog.md` merging Probes A–D into one prioritized backlog. Format: each item gets a row with `{probe, file, fix, effort S/M/L, impact L/M/H, est. KB or ms saved}`. Sorted by impact-per-effort. The top 5 become the input to the follow-up implementation spec.

**Critical rule:** the investigation is *not* allowed to fix anything it finds, even if "it would only take a minute." The whole point is to produce a reviewable backlog. Trivial fixes get queued for Phase 5 instead, where the admission rule enforces the boundary.

---

## 6. Success Metrics & Measurement

The whole point of Phase 0 is to make this section enforceable. We commit to measuring exactly these numbers before and after, and to publishing the delta in `2026-04-06-cleanup-results.md`.

**Hard quantitative metrics** (must improve or stay flat — never regress):

1. **Total `dependencies` count** in `package.json` — target: drop by ≥ 6 packages, expected actual closer to 8–10.
2. **`node_modules` size on disk** after a clean `bun install` — informational headline number.
3. **Total client JS shipped** across all routes (from `next build`'s "First Load JS" column) — target: meaningful drop driven by removing BlockNote/Novel/react-toastify/Daily.
4. **Heaviest route's First Load JS** — target: drop by ≥ 10%.
5. **`bun run build` cold-build wall-clock time** — target: drop, even marginally.
6. **Number of `'use client'` directives in `app/` and `components/`** — informational baseline only this round (we're not converting; we want the number on record so the follow-up perf spec has a starting point).
7. **Number of orphan files** in `components/` — target: zero after Phase 1.

**Qualitative checks** (binary pass/fail):

- `bun run build` passes after every phase.
- `bun lint` passes after every phase.
- `bun test` passes after every phase.
- The two `next.config` files become one. The two `tailwind.config` files become one.
- `backup/` directory no longer exists at repo root.
- No loose `*_GUIDE.md`, `*_SUMMARY.md`, `*_PLAN.md`, or `*_STATUS.md` files at repo root.

**Investigation track deliverable:**

- A single `docs/superpowers/specs/2026-04-06-perf-backlog.md` exists, sorted by impact-per-effort, with at least 10 entries.

The wins report (`2026-04-06-cleanup-results.md`) is the artifact that proves the round was worth doing. If the deltas are disappointing, that's also a useful finding — it tells us cleanup wasn't where the perf bottleneck was, which is itself signal for the follow-up.

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Deleting a Daily file that's still imported somewhere I missed | Low | Medium | Phase 1 verification gate is `bun run build` after every sub-step. Build failure = revert + investigate. |
| R2 | Wrong `next.config` file gets deleted, silently disabling LiveKit CSP fix or `/community/:slug*` redirect | Medium | **High** | Before deleting either, do the runtime test in Phase 1 step 1 (console.log probe). After deleting, explicitly verify (a) LiveKit room loads, (b) old community URL redirect still fires. |
| R3 | Toast migration introduces visual or behavioral regressions (positioning, duration, missing variants like `toast.warning`) | Medium | Low–Med | Build the API mapping table *before* touching code. Document any non-1:1 substitution in commit messages. Spot-check the 5 highest-traffic toast paths after migration. |
| R4 | Auth swap breaks browser-side Supabase usage on some page | Low | High | Phase 2 verification gate: manual smoke test of login + dashboard before merging. Single-commit change is trivially revertable. |
| R5 | Bundle analyzer numbers are misleading because of dev-vs-prod differences or caching | Medium | Low | Always measure with the same command (`ANALYZE=true bun run build` from a clean `.next/`). Document the exact command in Phase 0's baseline file so Phase 4 reproduces identically. |
| R6 | Phase 5 trivial wins turn out not to be trivial | Medium | Low | Enforce the four admission criteria strictly. If a fix touches more than 5 lines or requires reasoning about data flow, stop and move it to the backlog. |
| R7 | Investigation backlog gets written but never executed | Med-High | Medium | The wins report (Phase 4) explicitly ends with a "Next steps" section that names the follow-up spec by date and topic. Concrete commitment, not vague intention. |
| R8 | Stream-Hub/LiveKit migration is *less* done than the user thinks; we delete something secretly still needed | Low | High | Phase 1's smoke test explicitly includes loading a LiveKit room before the phase merges. If anything breaks, revert. |

**Global rollback strategy:** every phase is a separate commit (or PR). If any phase breaks something downstream, `git revert <phase-commit>` restores the prior state without unwinding anything else. Phase 0 and Phase 4 are pure documentation and have no rollback need.

---

## 8. Decisions Made During Brainstorming

These were live questions resolved during the design conversation. Recording them here so the plan and implementation don't relitigate:

- **Approach chosen:** B + touch of C. Phased cleanup, lowest-risk first, with bundle measurement bracketing the work.
- **Toast library winner:** `react-hot-toast` (smaller bundle, simpler API, sufficient for the SaaS's transactional toasts). `react-toastify` is being dropped.
- **Editor library winner:** TipTap (only one currently in use). BlockNote and Novel are being dropped as dead deps.
- **Auth target:** better-auth (already 99% migrated). The remaining `@supabase/auth-helpers-nextjs` import is the only thing standing in the way.
- **Daily.co status:** dead, ready to delete. Confirmed by grep — only one type-only import remains.
- **Runtime perf execution:** *not* in this round, except the narrow Phase 5 trivial-wins exception. The investigation produces a backlog; meaningful refactors get a follow-up spec.
- **kebab-case rename:** explicitly skipped this round. ~70 file renames is pure churn.
- **DB schema cleanup:** out of scope. Different risk profile, separate spec.
- **Stream-Hub integration code:** out of bounds. Active feature work, not cleanup territory.

---

## 9. Out of Scope / Follow-ups

These are deliberately excluded from this round. Each one is a candidate for its own future spec:

- **Runtime perf execution spec** (the natural follow-up to this one). Input: the perf backlog produced in Phase 4. Should be brainstormed and planned as its own cycle once this round ships.
- **Component file naming pass** — convert PascalCase to kebab-case to match `.cursorrules.json`.
- **Database schema audit** — drop unused columns/tables, add missing indexes that aren't covered by Probe C's top-10.
- **CSP tightening** — review what Daily/Mux/etc. domains can be removed from CSP after each migration.
- **Test coverage gaps** — out of scope, but flag any gaps discovered during smoke testing as input to a future testing spec.
- **CLAUDE.md / `.cursorrules.json` consolidation** — both files exist and partially overlap. Worth aligning, but not this round.
