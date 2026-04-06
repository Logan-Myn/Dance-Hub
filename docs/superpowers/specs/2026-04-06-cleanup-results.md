# Cleanup Wins Report — 2026-04-06

Delta between the Phase 0 baseline (`2026-04-06-cleanup-baseline.md`) and the post-cleanup measurement captured after Phases 1–3 on branch `chore/cleanup-and-perf-investigation`.

**TL;DR:** 23 dead files deleted, 8 dead dependencies dropped, one latent Tailwind config bug fixed, repo root cleaned. Client bundle sizes per route are unchanged — as expected, because the deleted code was already tree-shaken out by Webpack (it wasn't being shipped). The wins are in dependency surface area, install size, and repo clarity. The big runtime perf gains are recorded in the parallel `2026-04-06-perf-backlog.md` and will be implemented in a follow-up spec.

## Quantitative deltas

| Metric | Before | After | Delta | % |
|---|---|---|---|---|
| `dependencies` count | 78 | **70** | **−8** | **−10.3%** |
| `devDependencies` count | 26 | 26 | 0 | — |
| `node_modules` size | ~1.2 GB (1200 MB approx) | **1142 MB** | **≈ −58 MB** | **≈ −5%** |
| `.next` build output size | 484 MB | 484 MB | 0 | — |
| Cold build wall-clock time | 1m 49.255s | 1m 49.407s | +0.15s | within noise |
| `'use client'` count in `app/` | 17 | 17 | 0 | — |
| `'use client'` count in `components/` | 78 | **69** | **−9** | **−11.5%** |
| Orphan files in `components/` | 9+ | **0** | — | — |
| Duplicate config files (`next.config.*`, `tailwind.config.*`) | 2 pairs | **0** | **−2 files** | — |
| Loose root `.md`/`.sql` clutter files | 10 | **0** | **−10 files** | — |

(Baseline `node_modules` size was captured with `du -sh` which rounds to 1 unit; post-cleanup was captured with `du -sm` for MB precision, hence the approximation in the delta.)

## Top 10 heaviest routes — before vs after

| # | Route | Before (KB) | After (KB) | Delta |
|---|---|---|---|---|
| 1 | `/[communitySlug]/about` | 613 | 613 | 0 |
| 2 | `/[communitySlug]/classroom/[courseSlug]` | 611 | 611 | 0 |
| 3 | `/[communitySlug]` | 411 | 411 | 0 |
| 4 | `/[communitySlug]/private-lessons` | 218 | 218 | 0 |
| 5 | `/[communitySlug]/classroom` | 200 | 200 | 0 |
| 6 | `/[communitySlug]/calendar` | 187 | 187 | 0 |
| 7 | `/discovery` | 181 | 181 | 0 |
| 8 | `/privacy` | 174 | 174 | 0 |
| 9 | `/terms` | 174 | 174 | 0 |
| 10 | `/admin/users` | 157 | 157 | 0 |

**Why zero?** This is the expected outcome and the cleanup was never going to move these numbers. The code we deleted was already orphaned — nothing imported it, so Webpack's tree-shaker was already excluding it from the bundle. Deleting it from the source is a repo-clarity win, not a bundle-size win. The real runtime bundle savings require splitting these pages into RSC + client islands, which is the first row of the Top 5 in the perf backlog.

## Dependencies removed

| Package | Reason |
|---|---|
| `@daily-co/daily-js` | Daily.co → Stream-Hub/LiveKit migration complete, no remaining consumers |
| `@daily-co/daily-react` | Same |
| `@blocknote/core` | Zero source imports (dead editor experiment) |
| `@blocknote/react` | Same |
| `@blocknote/shadcn` | Same |
| `novel` | Zero source imports (another dead editor experiment) |
| `@supabase/auth-helpers-nextjs` | Only consumer was the deprecated `lib/supabase/client.ts`, now deleted |
| `react-toastify` | Zero source imports (was listed but never actually used; `react-hot-toast` is the live toast library) |

**8 dependencies removed in total.** Active editor is TipTap (unchanged). Active toast library is react-hot-toast (unchanged). Active auth is better-auth (unchanged).

## Dependencies added

| Package | Reason |
|---|---|
| `@next/bundle-analyzer@^14` | Dev dependency for bundle analysis — enabled via `ANALYZE=true bun run build`. Used to capture the baseline + re-measurement in this report. |

## Files removed (23 total)

| Category | Files | Lines removed |
|---|---|---|
| Orphan Daily video components | `DailyVideoCall.tsx`, `CustomDailyRoom.tsx`, `SimpleDailyCall.tsx`, `SimpleVideoCall.tsx`, `UltraSimpleDaily.tsx`, `VideoCall.tsx` (6) | ~1800 |
| Transitive orphans (only consumed by direct orphans) | `LiveClassChat.tsx`, `ControlBar.tsx`, `ParticipantTile.tsx` (3) | ~500 |
| Dead supabase layer | `lib/supabase.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/Superbase_Schema.json`, `types/supabase.ts` (5) | ~1340 |
| Duplicate/stale configs | `next.config.mjs`, `tailwind.config.ts` (2) | ~120 |
| Orphan supabase snapshot dir | `backup/supabase/*.sql` + `*.md` (6) | ~400 |
| Stale root SQL | `better-auth-schema.sql` (1) | 13 |
| **Total** | **23 files** | **~4200 lines** |

## Files moved

8 loose root docs → `docs/archive/`:
`API_TESTING_GUIDE.md`, `FRONTEND_INTEGRATION_GUIDE.md`, `FRONTEND_STATUS.md`, `PHASE_1_IMPLEMENTATION_SUMMARY.md`, `PRE_REGISTRATION_IMPLEMENTATION.md`, `SIMPLE_TEST_GUIDE.md`, `STRIPE_CUSTOM_ONBOARDING_PLAN.md`, `url_restructure_plan.md`.

README.md:213 link updated to point to the new archive path.

## Unexpected bonus: latent Tailwind config bug fixed

During Task 10 (`resolve tailwind.config.js vs .ts duplication`), discovery: the two config files had diverged into two completely different themes, and Tailwind v3 was loading `.js` (the older one). The `.ts` config — which had `fontFamily.display: Fraunces`, custom animations (`glow-pulse`, `bounce-subtle`, `gradient-shift`, `float`, `slide-in-left`), and chart colors — was **silently dead config**.

10+ source files were using `font-display` for header text, `ComposerBox` was using `animate-glow-pulse`, and `CategoryPills` was using `animate-bounce-subtle` — **none of which were generating any CSS**. The references were falling back to browser defaults without any developer awareness.

**Fix:** merged `.ts`'s extensions (fontFamily, custom animations, chart colors) into `.js` before deleting `.ts`. Verified via post-build CSS inspection that `font-display`, `animate-glow-pulse`, `animate-bounce-subtle` are all now present in the output.

**Production impact of the fix:** pages using `font-display` will now render headers in Fraunces serif (the display font loaded via `next/font` in `app/layout.tsx`). `CategoryPills` will now animate on category select. `ComposerBox` will now animate the focus border. These were the developer's original intent all along — they just got shadowed by a config resolution order the developer didn't know about.

## Commit trail

12 atomic commits on `chore/cleanup-and-perf-investigation` branch, all individually revertable with `git revert`:

```
9272887 chore: drop unused react-toastify dependency
af41978 fix: delete entire dead supabase layer (barrel + admin.ts + types)
3e74ea4 chore: delete deprecated lib/supabase/client.ts and drop @supabase/auth-helpers-nextjs
52d0726 chore: delete stale better-auth-schema.sql from repo root
d9d7306 chore: archive loose root docs into docs/archive/
a0be336 chore: delete orphan backup/ directory (old supabase snapshot)
76abee2 chore: merge tailwind.config.ts into .js and delete the stale .ts copy
c5a8b0e chore: remove Daily.co domains from CSP
2d853a7 chore: drop dead dependencies (Daily.co, BlockNote, Novel)
cbb0d4d chore: delete orphan Daily.co video components and their orphaned consumers
399e42a chore: remove duplicate next.config.mjs (kept the loaded next.config.js)
4d94726 docs: capture cleanup baseline measurements
2c4134c chore: wire @next/bundle-analyzer behind ANALYZE=true flag
4e6b31f fix: pin @next/bundle-analyzer to ^14 to match Next 14
5ff23da chore: add @next/bundle-analyzer for cleanup baseline
```

(Phase 4 commits — this report and the backlog finalization — are added after this is written.)

## Narrative

This round was **cleanup, not optimization**. The goal was to strip dead code and half-finished migrations so future work has a cleaner starting point. By that measure the round succeeded: 23 files gone, 8 dependencies gone, ~4200 lines of dead source removed, two duplicate config pairs consolidated, one latent bug fixed by accident during the consolidation.

The most surprising finding was that `bun test` has been failing on 44 tests against the merge commit on main — these are Neon DB integration tests unrelated to anything this cleanup touched. They were failing before and are failing the same way after, but they're worth flagging as a separate follow-up because `bun test` is currently a broken verification gate.

The zero-movement on route-level First Load JS was expected and is not a failure — it confirms that Webpack's tree-shaker was already doing its job. The real runtime wins from this round are the **investigation backlog** (`2026-04-06-perf-backlog.md`), which identifies 26 discrete fix candidates across four probes. The top items — RSC conversion for the 613 kB and 611 kB pages — need architectural refactoring, not dep cleanup, and will land in a dedicated follow-up.

## Next steps

1. **Review this branch and merge into `main`.** All changes are small, bisectable, and individually revertable. No production deploy needed for this branch itself — it's preprod-tested code changes that are safe on prod.
2. **Read `2026-04-06-perf-backlog.md`** and decide on the scope of the follow-up perf execution round. Top 3 candidates: A6 (Split `[communitySlug]/about/page.tsx`, 613 kB → target ≤300 kB), A5 (Split `classroom/[courseSlug]`), A4 (Split main community page).
3. **Brainstorm the follow-up spec:** `docs/superpowers/specs/YYYY-MM-DD-perf-execution-design.md`. Input: top 5 items from the backlog. Output: an implementation plan that actually ships the RSC conversions and measures the bundle deltas afterwards.
4. **Separate cleanup: fix the broken `bun test` gate.** 44 Neon DB integration tests fail with Postgres `42883 function-does-not-exist` errors. That's a real (pre-existing) bug that's hiding every future test regression in this project.
5. **Separate cleanup: resolve the `sharp` and `output: standalone` warnings in PM2 logs** — the deploy uses `next start` which doesn't work correctly with `output: standalone`, and `sharp` is missing so image optimization is degraded. Flagged during the Stream-Hub deploy earlier today.
