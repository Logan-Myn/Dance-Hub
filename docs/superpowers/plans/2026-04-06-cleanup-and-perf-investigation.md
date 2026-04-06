# Dance-Hub Cleanup & Performance Investigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip dead code, dead deps, and duplicate config files from Dance-Hub; produce hard before/after measurements; and generate a runtime-perf backlog for a follow-up round, with a narrow exception for trivial perf wins.

**Architecture:** Six phases executed in strict order (0–5). Phases 0 and 4 bracket the work with bundle-analyzer measurements. Phases 1–3 are ascending blast-radius cleanup. Phase 5 ships only ≤ 5-line trivial perf wins from the investigation backlog. A read-only investigation track (Probes A–D) runs in parallel with Phases 1–3 and finalizes its backlog inside Phase 4. Every step is a separate commit so any single change can be reverted with `git revert`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind, Bun, Supabase, better-auth, LiveKit/Stream-Hub, react-hot-toast, TipTap, Stripe, Mux.

**Source spec:** `docs/superpowers/specs/2026-04-06-cleanup-and-perf-investigation-design.md`

**Important reality-check findings made during planning** (these supersede the spec where they conflict):

- `react-toastify` is **already dead**. Zero source files import it. Phase 3 collapses to "delete one line from `package.json`".
- `lib/supabase/client.ts` is marked `@deprecated` and **has zero importers**. Phase 2 collapses to "delete the file outright + drop the dep".
- `<Toaster />` from `react-hot-toast` is already mounted in `app/layout.tsx:7` (with `position="bottom-right"` at line 59). No layout edit needed.
- `types/live-classes.ts` (plural) already exists — that's where the extracted Daily type defs go.

---

## File Structure

### Files this plan will CREATE
- `docs/superpowers/specs/2026-04-06-cleanup-baseline.md` — Phase 0 measurement snapshot
- `docs/superpowers/specs/2026-04-06-cleanup-results.md` — Phase 4 wins report
- `docs/superpowers/specs/2026-04-06-perf-backlog.md` — Investigation deliverable
- `docs/archive/` directory (with 8 moved doc files)

### Files this plan will MODIFY
- `package.json` — add `@next/bundle-analyzer` (dev), remove dead deps
- The surviving `next.config.{js,mjs}` — wire bundle analyzer, scrub Daily CSP entries
- `types/live-classes.ts` — append `HandRaise` and `ActiveSpeaker` interfaces
- `components/LiveClassChat.tsx` — change type import path

### Files this plan will DELETE
- `components/DailyVideoCall.tsx`
- `components/CustomDailyRoom.tsx`
- `components/SimpleDailyCall.tsx`
- `components/SimpleVideoCall.tsx`
- `components/UltraSimpleDaily.tsx`
- `components/VideoCall.tsx`
- `lib/supabase/client.ts` (deprecated, zero importers)
- One of `next.config.js` / `next.config.mjs` (whichever is stale)
- One of `tailwind.config.js` / `tailwind.config.ts` (whichever is stale)
- `backup/` directory (84K orphan supabase snapshot)
- `better-auth-schema.sql` at repo root (after verifying it's already in `supabase/migrations/` or moving it)

### Files this plan will MOVE
- `API_TESTING_GUIDE.md` → `docs/archive/`
- `FRONTEND_INTEGRATION_GUIDE.md` → `docs/archive/`
- `FRONTEND_STATUS.md` → `docs/archive/`
- `PHASE_1_IMPLEMENTATION_SUMMARY.md` → `docs/archive/`
- `PRE_REGISTRATION_IMPLEMENTATION.md` → `docs/archive/`
- `SIMPLE_TEST_GUIDE.md` → `docs/archive/`
- `STRIPE_CUSTOM_ONBOARDING_PLAN.md` → `docs/archive/`
- `url_restructure_plan.md` → `docs/archive/`

---

## Phase 0 — Baseline measurement

### Task 1: Add `@next/bundle-analyzer` as a dev dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package as a dev dependency**

```bash
bun add -d @next/bundle-analyzer
```

- [ ] **Step 2: Verify it landed in `devDependencies`**

```bash
grep -A1 '"@next/bundle-analyzer"' package.json
```

Expected: a line like `"@next/bundle-analyzer": "^14.x.x",` inside the `devDependencies` block.

- [ ] **Step 3: Verify install still succeeds and lockfile is consistent**

```bash
bun install
```

Expected: `Done` with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add @next/bundle-analyzer for cleanup baseline"
```

---

### Task 2: Wire bundle analyzer into the Next.js config

**Files:**
- Modify: `next.config.js` (the long, current file with the LiveKit CSP fix)

> **Important:** at this point we have NOT yet resolved the `next.config.js` vs `next.config.mjs` duplication. Phase 1 Task 4 handles that. For Task 2, edit `next.config.js` because it's the file with the recent LiveKit CSP fix and is therefore the file we know is being maintained. If the Phase 1 probe later reveals `.mjs` was actually winning, we'll re-apply this same change to whichever file survives — but starting from `.js` is the safer guess based on commit history.

- [ ] **Step 1: Read current next.config.js to confirm structure**

```bash
head -5 next.config.js
```

Expected: `/** @type {import('next').NextConfig} */` and `const nextConfig = {`.

- [ ] **Step 2: Wrap the export with the analyzer**

Edit `next.config.js`. At the very top of the file (above the `/** @type ... */` comment), add:

```js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
```

At the bottom of the file, change the final line from:

```js
module.exports = nextConfig
```

to:

```js
module.exports = withBundleAnalyzer(nextConfig)
```

- [ ] **Step 3: Verify build still succeeds without ANALYZE**

```bash
bun run build
```

Expected: build completes, exits 0. No bundle-analyzer HTML report opened (because `ANALYZE` is unset).

- [ ] **Step 4: Verify ANALYZE mode produces reports**

```bash
ANALYZE=true bun run build
```

Expected: build completes, three HTML files written to `.next/analyze/` (`client.html`, `nodejs.html`, `edge.html`).

- [ ] **Step 5: Commit**

```bash
git add next.config.js
git commit -m "chore: wire @next/bundle-analyzer behind ANALYZE=true flag"
```

---

### Task 3: Capture baseline measurements

**Files:**
- Create: `docs/superpowers/specs/2026-04-06-cleanup-baseline.md`

- [ ] **Step 1: Clean previous build artifacts**

```bash
rm -rf .next
```

- [ ] **Step 2: Run a clean build with measurement, save the build output**

```bash
time bun run build 2>&1 | tee /tmp/dancehub-build-baseline.log
```

Expected: build completes. Note the wall-clock time printed by `time`. The `Route` table at the end of the output lists every route with its "First Load JS" column — this is what we need.

- [ ] **Step 3: Capture filesystem and dep counts**

```bash
du -sh .next
du -sh node_modules
jq '.dependencies | length' package.json
jq '.devDependencies | length' package.json
grep -rlE '["\x27]use client["\x27]' app/ | wc -l
grep -rlE '["\x27]use client["\x27]' components/ | wc -l
```

Record each number. (`\x27` is a hex-escaped single quote so the regex matches both `"use client"` and `'use client'` styles.)

- [ ] **Step 4: Run analyzer build to capture chunk sizes**

```bash
rm -rf .next
ANALYZE=true bun run build 2>&1 | tail -100 > /tmp/dancehub-analyze-baseline.log
```

The analyzer's HTML reports in `.next/analyze/` give per-chunk module sizes. Open `client.html` and identify the top 10 heaviest routes and the top 20 heaviest modules.

- [ ] **Step 5: Write `docs/superpowers/specs/2026-04-06-cleanup-baseline.md`**

Write a markdown file with this exact structure:

```markdown
# Cleanup Baseline — 2026-04-06

Captured before any cleanup phase ran. All numbers reproducible by running the commands below from a clean working tree.

## Reproduction commands

```bash
rm -rf .next
time bun run build
du -sh .next
du -sh node_modules
jq '.dependencies | length' package.json
jq '.devDependencies | length' package.json
ANALYZE=true bun run build  # for analyzer reports
```

## Numbers

| Metric | Value |
|---|---|
| `dependencies` count | _<from jq>_ |
| `devDependencies` count | _<from jq>_ |
| `node_modules` size | _<from du>_ |
| `.next` size | _<from du>_ |
| Cold build wall-clock time | _<from `time`>_ |
| `'use client'` count in `app/` | _<from grep>_ |
| `'use client'` count in `components/` | _<from grep>_ |

## Top 10 heaviest routes (First Load JS)

| # | Route | First Load JS (KB) |
|---|---|---|
| 1 | _<route>_ | _<size>_ |
| 2 |  |  |
| ... |  |  |

## Top 20 heaviest modules (from analyzer client.html)

| # | Module | Size (KB) |
|---|---|---|
| 1 |  |  |
| ... |  |  |

## Notes

- Baseline captured on branch _<branch>_, commit _<sha>_.
- The analyzer HTML reports themselves are in `.next/analyze/` and are intentionally not committed (they're rebuildable).
```

Fill in every blank from the actual command output. **No placeholders allowed in the committed file.**

- [ ] **Step 6: Force-add and commit (file is in gitignored `/docs` path)**

```bash
git add -f docs/superpowers/specs/2026-04-06-cleanup-baseline.md
git commit -m "docs: capture cleanup baseline measurements"
```

---

## Phase 1 — Pure deletes

### Task 4: Determine which `next.config` file Next.js actually loads

**Files:**
- Modify (temporarily): `next.config.js`, `next.config.mjs`

- [ ] **Step 1: Add a probe log to `next.config.js`**

Edit `next.config.js`. Add this line as the FIRST line of the file (above the `withBundleAnalyzer` requirement):

```js
console.log("[next-config-probe] loaded: next.config.js");
```

- [ ] **Step 2: Add a probe log to `next.config.mjs`**

Edit `next.config.mjs`. Add this line as the FIRST line:

```js
console.log("[next-config-probe] loaded: next.config.mjs");
```

- [ ] **Step 3: Run `bun dev` and observe which line prints**

```bash
bun dev 2>&1 | head -20
```

You should see exactly ONE of `[next-config-probe] loaded: next.config.js` or `[next-config-probe] loaded: next.config.mjs`. Press Ctrl+C to stop the dev server. Record which one printed.

- [ ] **Step 4: Remove both probe lines**

Revert both files to remove the `console.log` lines added in Steps 1 and 2.

- [ ] **Step 5: Verify no leftover probe code**

```bash
grep -n "next-config-probe" next.config.js next.config.mjs
```

Expected: no output (both lines removed).

- [ ] **Step 6: DO NOT commit the probe**

The probe is throwaway exploration. The result of this task is knowledge ("the loser is the one Next is NOT loading") that informs Task 5. Nothing to commit yet.

---

### Task 5: Delete the stale `next.config` file

**Files:**
- Delete: whichever of `next.config.js` / `next.config.mjs` did NOT print in Task 4
- Possibly modify: the surviving file (if `next.config.mjs` was winning, you must port the LiveKit CSP, redirects, image hosts, and `withBundleAnalyzer` setup from `next.config.js` BEFORE deleting `.js`)

- [ ] **Step 1: If `next.config.js` was the winner**

```bash
git rm next.config.mjs
```

Skip to Step 4.

- [ ] **Step 2: If `next.config.mjs` was the winner — port everything from `.js` first**

Convert `next.config.js` content (CommonJS) to `.mjs` content (ESM) and overwrite `next.config.mjs`. Specifically:
- Replace `const withBundleAnalyzer = require('@next/bundle-analyzer')({...})` with `import withBundleAnalyzer from '@next/bundle-analyzer';` plus `const bundleAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });`
- Keep all `images`, `redirects`, `headers` blocks identical.
- Replace `module.exports = withBundleAnalyzer(nextConfig)` with `export default bundleAnalyzer(nextConfig);`

Then:
```bash
git rm next.config.js
```

- [ ] **Step 3: Build to confirm port is correct**

```bash
bun run build
```

Expected: build succeeds. If it fails, fix the port and re-run.

- [ ] **Step 4: Smoke-test LiveKit room loads (CSP regression check)**

```bash
bun dev
```

Open `http://localhost:3000` and navigate to a community page that has a live class. Click into a live class and confirm the LiveKit room loads (you should see video tiles, not a blank screen with CSP errors in the browser console). Press Ctrl+C to stop.

- [ ] **Step 5: Smoke-test the `/community/:slug*` redirect**

```bash
bun dev
```

In a browser, visit `http://localhost:3000/community/test-slug` (any slug, doesn't need to exist). It should redirect to `http://localhost:3000/test-slug` (which may then 404, but the redirect itself must fire). Confirm in the address bar. Press Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove duplicate next.config and consolidate to one file"
```

---

### Task 6: Move Daily type defs into `types/live-classes.ts`

**Files:**
- Modify: `types/live-classes.ts`
- Modify: `components/LiveClassChat.tsx`

- [ ] **Step 1: Read current `types/live-classes.ts`**

```bash
cat types/live-classes.ts
```

Note where to append (end of file) and the existing export style.

- [ ] **Step 2: Append the two interfaces to the end of `types/live-classes.ts`**

Add these lines at the end of the file (after existing exports):

```ts

export interface HandRaise {
  sessionId: string;
  userName: string;
}

export interface ActiveSpeaker {
  sessionId: string;
  userName: string;
}
```

- [ ] **Step 3: Update the import in `components/LiveClassChat.tsx`**

Edit `components/LiveClassChat.tsx` line 7. Change:

```ts
import type { HandRaise, ActiveSpeaker } from "./CustomDailyRoom";
```

to:

```ts
import type { HandRaise, ActiveSpeaker } from "@/types/live-classes";
```

- [ ] **Step 4: Build to confirm**

```bash
bun run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add types/live-classes.ts components/LiveClassChat.tsx
git commit -m "refactor: move HandRaise/ActiveSpeaker types to types/live-classes.ts"
```

---

### Task 7: Delete the 6 orphan Daily files

**Files:**
- Delete: `components/DailyVideoCall.tsx`
- Delete: `components/CustomDailyRoom.tsx`
- Delete: `components/SimpleDailyCall.tsx`
- Delete: `components/SimpleVideoCall.tsx`
- Delete: `components/UltraSimpleDaily.tsx`
- Delete: `components/VideoCall.tsx`

- [ ] **Step 1: Final orphan-check before deletion**

```bash
grep -rn "from ['\"].*\(DailyVideoCall\|CustomDailyRoom\|SimpleDailyCall\|SimpleVideoCall\|UltraSimpleDaily\|VideoCall\)['\"]" --include='*.ts' --include='*.tsx' app components lib 2>&1
```

Expected: no matches. (After Task 6, the LiveClassChat type import has been redirected, so there should be zero references.)

If ANY match appears, STOP and investigate before deleting. Do not proceed until the count is zero.

- [ ] **Step 2: Delete the six files**

```bash
git rm components/DailyVideoCall.tsx \
       components/CustomDailyRoom.tsx \
       components/SimpleDailyCall.tsx \
       components/SimpleVideoCall.tsx \
       components/UltraSimpleDaily.tsx \
       components/VideoCall.tsx
```

- [ ] **Step 3: Build to confirm nothing broke**

```bash
bun run build
```

Expected: build succeeds.

- [ ] **Step 4: Run lint and tests**

```bash
bun lint
bun test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: delete orphan Daily.co video components"
```

---

### Task 8: Drop dead dependencies (Daily, BlockNote, Novel)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove the six dead dependencies**

```bash
bun remove @daily-co/daily-js @daily-co/daily-react @blocknote/core @blocknote/react @blocknote/shadcn novel
```

- [ ] **Step 2: Verify they're gone from `package.json`**

```bash
grep -E '@daily-co|@blocknote|"novel"' package.json
```

Expected: no output.

- [ ] **Step 3: Build to confirm no leftover imports**

```bash
bun run build
```

Expected: build succeeds. If it fails with a "module not found" error pointing at one of the removed packages, that means there's still an import we missed — find it with `grep -rn -e '@daily-co' -e '@blocknote' -e "from 'novel'" -e 'from "novel"' --include='*.ts' --include='*.tsx' app components lib` and resolve before continuing.

- [ ] **Step 4: Run lint and tests**

```bash
bun lint
bun test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: drop dead dependencies (Daily.co, BlockNote, Novel)"
```

---

### Task 9: Scrub Daily.co references from the surviving Next config CSP

**Files:**
- Modify: the surviving `next.config.{js,mjs}` from Task 5

- [ ] **Step 1: Find the Daily references in the CSP**

```bash
grep -n "daily.co" next.config.*
```

You should see hits in the `script-src`, `connect-src`, `frame-src`, and `media-src` directives.

- [ ] **Step 2: Edit the surviving config and remove every `*.daily.co`, `wss://*.daily.co`, and `api.daily.co` substring from the CSP value**

For example, the line:
```
"script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://*.daily.co https://www.gstatic.com https://js.stripe.com https://vercel.live https://*.vercel.live https://accounts.google.com",
```
becomes:
```
"script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://www.gstatic.com https://js.stripe.com https://vercel.live https://*.vercel.live https://accounts.google.com",
```

Repeat for `connect-src`, `frame-src`, and `media-src`. Be careful: `connect-src` has both `https://*.daily.co` and `wss://*.daily.co` and `https://api.daily.co` — remove all three.

- [ ] **Step 3: Verify no `daily.co` references remain**

```bash
grep -n "daily.co" next.config.*
```

Expected: no output.

- [ ] **Step 4: Build to confirm CSP is still well-formed**

```bash
bun run build
```

Expected: build succeeds.

- [ ] **Step 5: Smoke-test that LiveKit still works (regression check)**

```bash
bun dev
```

Load a live class room. Open browser DevTools → Console. Confirm no CSP violations are logged. Confirm the LiveKit video tiles still appear. Press Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add next.config.*
git commit -m "chore: remove Daily.co domains from CSP"
```

---

### Task 10: Resolve `tailwind.config.js` vs `tailwind.config.ts` duplication

**Files:**
- Read: `tailwind.config.js`, `tailwind.config.ts`
- Delete: whichever is stale

- [ ] **Step 1: Diff the two files**

```bash
diff tailwind.config.js tailwind.config.ts
```

Note the differences. Identify which one is the "real" config (it should match what `app/globals.css` and the rest of the codebase actually use — the one with the full theme, plugins, content globs).

- [ ] **Step 2: Probe-log to confirm which Tailwind loads**

There's no clean console.log probe for Tailwind because it runs at build time. Instead, rename ONE file at a time and see which makes the build still work. First, temporarily rename `tailwind.config.ts`:

```bash
mv tailwind.config.ts tailwind.config.ts.bak
bun run build 2>&1 | tail -20
```

If the build succeeds and the styles look right (run `bun dev` and visually check a known-styled page), then `tailwind.config.js` is the live one. Restore the backup with `mv tailwind.config.ts.bak tailwind.config.ts` before proceeding.

If the build fails or styles are missing, then `tailwind.config.ts` is the live one. Restore with `mv tailwind.config.ts.bak tailwind.config.ts`.

- [ ] **Step 3: Delete the loser**

```bash
git rm tailwind.config.<loser-extension>
```

- [ ] **Step 4: Build and visual smoke-test**

```bash
bun run build
bun dev
```

Visit `http://localhost:3000` and confirm the styles render correctly on a known-styled page (e.g., the landing page). Press Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove duplicate tailwind config"
```

---

### Task 11: Delete `backup/` directory

**Files:**
- Delete: `backup/` (entire directory)

- [ ] **Step 1: Inspect contents one last time**

```bash
ls -la backup/
find backup -type f
```

Confirm the contents are an old supabase snapshot and nothing irreplaceable. (Git history retains the contents anyway since they were committed at some point.)

- [ ] **Step 2: Delete the directory**

```bash
git rm -r backup/
```

- [ ] **Step 3: Verify**

```bash
ls backup 2>&1
```

Expected: `ls: cannot access 'backup': No such file or directory`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete orphan backup/ directory"
```

---

### Task 12: Move loose root docs into `docs/archive/`

**Files:**
- Create: `docs/archive/` directory (implicitly via `git mv`)
- Move: 8 files from repo root into `docs/archive/`

- [ ] **Step 1: Grep for any internal references to these filenames before moving**

```bash
grep -rln 'API_TESTING_GUIDE\|FRONTEND_INTEGRATION_GUIDE\|FRONTEND_STATUS\|PHASE_1_IMPLEMENTATION_SUMMARY\|PRE_REGISTRATION_IMPLEMENTATION\|SIMPLE_TEST_GUIDE\|STRIPE_CUSTOM_ONBOARDING_PLAN\|url_restructure_plan' --include='*.md' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yml' --include='*.yaml' .
```

If any match comes back (from CI configs, README links, internal cross-references), record each one — you'll need to update them in Step 3.

- [ ] **Step 2: Move all 8 files**

```bash
mkdir -p docs/archive
git mv API_TESTING_GUIDE.md docs/archive/
git mv FRONTEND_INTEGRATION_GUIDE.md docs/archive/
git mv FRONTEND_STATUS.md docs/archive/
git mv PHASE_1_IMPLEMENTATION_SUMMARY.md docs/archive/
git mv PRE_REGISTRATION_IMPLEMENTATION.md docs/archive/
git mv SIMPLE_TEST_GUIDE.md docs/archive/
git mv STRIPE_CUSTOM_ONBOARDING_PLAN.md docs/archive/
git mv url_restructure_plan.md docs/archive/
```

- [ ] **Step 3: Update any internal references found in Step 1**

For each file from Step 1, update the path to point at `docs/archive/<filename>` instead of just `<filename>`.

- [ ] **Step 4: Verify the root is clean of these files**

```bash
ls *.md
```

Expected: only `README.md` and `CLAUDE.md` (and any other intentionally-root markdown like a `LICENSE.md`).

- [ ] **Step 5: Verify the moved files are tracked at their new path**

```bash
git status
```

Expected: each file shows as `renamed:` with the new `docs/archive/` path.

- [ ] **Step 6: Note about gitignore**

`/docs` is in `.gitignore`, but `git mv` will track the files at their new path because git tracks renames of already-tracked files. If `git status` shows any of the moved files as untracked instead of renamed, force-add them: `git add -f docs/archive/<filename>`.

- [ ] **Step 7: Commit**

```bash
git commit -m "chore: archive loose root docs into docs/archive/"
```

---

### Task 13: Resolve `better-auth-schema.sql` at repo root

**Files:**
- Read: `better-auth-schema.sql`
- Possibly delete or move

- [ ] **Step 1: Check if the schema is already in `supabase/migrations/`**

```bash
find supabase/migrations -name "*better*auth*" -o -name "*better-auth*"
```

If a migration with the same content exists, the root file is a duplicate and can be deleted.

- [ ] **Step 2: Compare contents if a candidate exists**

```bash
diff better-auth-schema.sql supabase/migrations/<matching-file>
```

If they're identical or the migration is a superset, the root file is safe to delete.

- [ ] **Step 3: Delete the root file**

If Step 2 confirms duplication:

```bash
git rm better-auth-schema.sql
```

If Step 2 shows the migration is missing (no equivalent exists in `supabase/migrations/`):

```bash
git mv better-auth-schema.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_better_auth_schema.sql
```

(Use a timestamp prefix that matches the project's existing migration naming convention.)

- [ ] **Step 4: Verify**

```bash
ls better-auth-schema.sql 2>&1
```

Expected: `ls: cannot access 'better-auth-schema.sql': No such file or directory`.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: resolve better-auth-schema.sql duplication at repo root"
```

---

### Phase 1 verification gate

After Tasks 4–13, run the full check before declaring Phase 1 done:

- [ ] **Build passes:** `bun run build`
- [ ] **Lint passes:** `bun lint`
- [ ] **Tests pass:** `bun test`
- [ ] **Manual smoke test 1:** start `bun dev`, log in, navigate to a live class, confirm LiveKit room loads with no CSP console errors.
- [ ] **Manual smoke test 2:** navigate to a private lesson booking page, confirm it loads.
- [ ] **Repo root is visibly cleaner:** `ls *.md` shows only the intentional root files (README, CLAUDE).

If any check fails, `git revert` the offending commit and investigate before continuing to Phase 2.

---

## Phase 2 — Delete deprecated `lib/supabase/client.ts`

> **Note:** the spec described this phase as "auth one-liner swap". During planning we discovered the file is marked `@deprecated` and has zero importers. The right move is to delete it outright, not swap its import.

### Task 14: Delete the deprecated client file and drop the auth-helpers dependency

**Files:**
- Delete: `lib/supabase/client.ts`
- Modify: `package.json`

- [ ] **Step 1: Re-confirm zero importers**

```bash
grep -rn "lib/supabase/client" --include='*.ts' --include='*.tsx' app components lib contexts hooks scripts
```

Expected: only the file itself shows up (`lib/supabase/client.ts`), no other consumers. If any other file appears in the output, STOP and migrate it first using the patterns documented in the file's deprecation banner (`@/lib/auth-client`, `@/contexts/AuthContext`, `@/lib/db`).

- [ ] **Step 2: Re-confirm zero references to `createClient` from the old supabase client**

```bash
grep -rn "createClientComponentClient" --include='*.ts' --include='*.tsx' app components lib contexts hooks scripts
```

Expected: no output (apart from the line inside `lib/supabase/client.ts` itself).

- [ ] **Step 3: Delete the file**

```bash
git rm lib/supabase/client.ts
```

- [ ] **Step 4: Drop the dependency**

```bash
bun remove @supabase/auth-helpers-nextjs
```

- [ ] **Step 5: Verify it's gone**

```bash
grep '@supabase/auth-helpers-nextjs' package.json
```

Expected: no output.

- [ ] **Step 6: Build, lint, test**

```bash
bun run build
bun lint
bun test
```

Expected: all three pass.

- [ ] **Step 7: Smoke-test login**

```bash
bun dev
```

Open `http://localhost:3000`, log in, confirm the dashboard loads. Press Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: delete deprecated lib/supabase/client.ts and drop auth-helpers"
```

---

## Phase 3 — Drop dead `react-toastify` dependency

> **Note:** the spec described this phase as "migrate ~30 toastify call sites to react-hot-toast". During planning we discovered `react-toastify` has zero source imports. It's pure dead weight in `package.json`. Phase 3 collapses to a single dependency removal.

### Task 15: Remove `react-toastify` from dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Final confirmation of zero source imports**

```bash
grep -rn "react-toastify" --include='*.ts' --include='*.tsx' --include='*.css' app components lib contexts hooks
```

Expected: no output. If anything appears, STOP — the spec assumption is wrong and we need to handle the import.

- [ ] **Step 2: Drop the dependency**

```bash
bun remove react-toastify
```

- [ ] **Step 3: Verify it's gone**

```bash
grep '"react-toastify"' package.json
```

Expected: no output.

- [ ] **Step 4: Build, lint, test**

```bash
bun run build
bun lint
bun test
```

Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: drop unused react-toastify dependency"
```

---

## Investigation Track — Probes A through D

These four probes run **in parallel with Phases 1–3**. They are read-only — they do not modify application code. Their outputs are merged into `docs/superpowers/specs/2026-04-06-perf-backlog.md` which is finalized in Phase 4. **Phase 5 is blocked on this backlog being complete.**

All four probe tasks produce a single combined deliverable: `2026-04-06-perf-backlog.md`. Each task contributes its rows.

### Task I-A: Probe A — Client/Server boundary audit

**Files:**
- Read: every file matching `'use client'` in `app/` and `components/`
- Contribute rows to: `docs/superpowers/specs/2026-04-06-perf-backlog.md`

- [ ] **Step 1: Generate the full list of `'use client'` files**

```bash
grep -rlnE '["\x27]use client["\x27]' app components > /tmp/use-client-files.txt
wc -l /tmp/use-client-files.txt
```

(`\x27` is a hex-escaped single quote so the regex matches both `"use client"` and `'use client'`.) Expected: ~95 files (the spec's baseline number).

- [ ] **Step 2: Classify each file**

For each file, open it and apply this classification rule:

| Bucket | Rule | Action |
|---|---|---|
| **MUST be client** | Uses `useState`, `useEffect`, `useRef`, browser APIs (`window`, `document`, `localStorage`), event handlers (`onClick`, `onChange`, etc.), or third-party client-only libs (LiveKit, Stripe Elements, TipTap, dnd-kit, react-hook-form, motion) | Leave alone — perf backlog: skip |
| **Could be partially RSC** | Wraps a small interactive island in a larger static shell (e.g., a card with a button — the card content could be RSC, only the button is client) | Add to backlog as **Split (M)** |
| **Should be pure RSC** | Only renders props/data, no hooks, no events | Add to backlog as **Convert (S)** — easy win |
| **Layout/wrapper** | Provides React context | Leave alone unless context can be moved server-side |

- [ ] **Step 3: Pay special attention to page-level files**

The biggest cascading wins come from converting `app/[communitySlug]/page.tsx`, `app/[communitySlug]/classroom/page.tsx`, `app/[communitySlug]/about/page.tsx`, `app/[communitySlug]/calendar/page.tsx`, `app/[communitySlug]/private-lessons/page.tsx`, `app/dashboard/page.tsx`, and `app/dashboard/settings/page.tsx`. For each, classify and add a row to the backlog with **Impact: H**.

- [ ] **Step 4: Append rows to the backlog file**

If `docs/superpowers/specs/2026-04-06-perf-backlog.md` doesn't yet exist, create it with this header:

```markdown
# Dance-Hub Runtime Performance Backlog — 2026-04-06

Output of the investigation track from cleanup spec `2026-04-06-cleanup-and-perf-investigation-design.md`. Each row is a discrete fix candidate. Sorted by impact-per-effort.

| # | Probe | File / Location | Issue | Proposed Fix | Effort (S/M/L) | Impact (L/M/H) | Est. Saving |
|---|---|---|---|---|---|---|---|
```

Then append one row per finding from this probe:

```markdown
| 1 | A | app/dashboard/page.tsx | Marked 'use client' but only renders SSR-friendly data | Remove 'use client' directive | S | M | ~3 KB |
```

(For Probe A rows, the "Est. Saving" column estimates the size of the client chunk that would no longer ship if the file were converted to RSC. Use the analyzer to find a rough number; "~N KB" is fine.)

- [ ] **Step 5: This task does NOT commit yet**

The backlog file is finalized and committed in Phase 4 Task 18 once all probes have contributed.

---

### Task I-B: Probe B — Bundle hot-spot analysis

**Files:**
- Read: `.next/analyze/client.html` (from the Phase 0 baseline analyzer run)
- Contribute rows to: `docs/superpowers/specs/2026-04-06-perf-backlog.md`

- [ ] **Step 1: Open the analyzer report**

```bash
ls .next/analyze/
```

Open `.next/analyze/client.html` in a browser. The treemap visualization shows every chunk and every module inside it.

- [ ] **Step 2: Identify the 5 heaviest routes**

In the analyzer, find the 5 routes (page chunks) with the largest "First Load JS" totals. For each, click in to see the top 3 contributing modules.

- [ ] **Step 3: Hunt for known offenders**

Search the analyzer for these specific module names and check if/where they appear:

| Module | Concern | Fix if found |
|---|---|---|
| `lucide-react` | Wildcard import (`import * as Icons from 'lucide-react'`) bundles every icon | Per-icon imports |
| `motion` | Often bigger than expected | Check if used everywhere or only in landing |
| `date-fns` | Verify tree-shaking is working (per-function imports) | Switch to `import { format } from 'date-fns/format'` |
| `@radix-ui/*` | Each primitive should be its own package; verify nothing imports the umbrella | One per primitive |
| `stripe` (Node SDK) | Should NEVER appear in client bundle | If present, find the leak and isolate to server |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Should NEVER appear in client bundle | Same — server-only |
| `@mux/mux-node` | Should NEVER appear in client bundle (vs `@mux/mux-player-react` which is fine) | Same |
| `pg`, `@neondatabase/serverless` | Should NEVER appear in client bundle | Same |

- [ ] **Step 4: For each finding, append a row to the backlog**

```markdown
| N | B | app/dashboard/page.tsx | Imports lucide-react as `import * as Icons` | Replace with per-icon imports | S | H | ~50 KB |
```

- [ ] **Step 5: This task does NOT commit yet** (see Task I-A Step 5)

---

### Task I-C: Probe C — Database query patterns

**Files:**
- Read: every file in `app/api/**` and any server components/loaders that issue Supabase queries
- Contribute rows to: `docs/superpowers/specs/2026-04-06-perf-backlog.md`

- [ ] **Step 1: Grep for Supabase query patterns**

```bash
grep -rln 'supabase\|\.from(' app/api app/[communitySlug] app/dashboard --include='*.ts' --include='*.tsx' > /tmp/query-files.txt
```

- [ ] **Step 2: For each file, look for these anti-patterns**

| Anti-pattern | What to look for | Fix |
|---|---|---|
| **N+1 in a loop** | `.map(async ... await supabase.from(...))`, `for (... await supabase ...)`, `Promise.all(items.map(... supabase ...))` | Single join query with `.in()` or a SQL view |
| **Fetching full rows** | `.select('*')` when only a few columns are used downstream | Explicit `.select('id, name, ...')` |
| **Repeated queries on the same page** | Two `.from(...)` calls that could be one join | Combine |
| **Listing without pagination** | `.from(...).select(...)` with no `.limit()` or `.range()` and no upstream cap | Add `.limit(N)` and pagination |

- [ ] **Step 3: Cross-reference with migrations for missing indexes**

```bash
ls supabase/migrations/
```

For each query you flagged that filters or joins on a column, check whether `supabase/migrations/*.sql` includes a `CREATE INDEX` on that column.

- [ ] **Step 4: For the highest-traffic routes, trace the full data graph**

Pick `app/[communitySlug]/page.tsx`, `app/[communitySlug]/classroom/page.tsx`, and `app/dashboard/page.tsx`. For each, trace every `await supabase.from(...)` call that fires during a single page render. Count them. Any page with > 5 queries is a candidate for a backlog entry.

- [ ] **Step 5: For each finding, append a row to the backlog**

```markdown
| N | C | app/[communitySlug]/classroom/page.tsx:42 | Loops over courses and fires one query per course (N+1) | Refactor to single `.in('course_id', ids)` query | M | H | ~200 ms |
```

- [ ] **Step 6: This task does NOT commit yet**

---

### Task I-D: Probe D — Image, font, and asset audit

**Files:**
- Read: every `.tsx` file (for `<img>` tags), `app/fonts/`, `public/`, the surviving `next.config.*`
- Contribute rows to: `docs/superpowers/specs/2026-04-06-perf-backlog.md`

- [ ] **Step 1: Find raw `<img>` tags that should be `<Image>`**

```bash
grep -rn '<img ' app components --include='*.tsx'
```

For each result, decide if it's a candidate for `next/image` (it almost always is, unless it's an inline SVG or a `data:` URI).

- [ ] **Step 2: Check font loading strategy**

```bash
ls app/fonts/
grep -n 'next/font\|display.*swap' app/layout.tsx
```

Confirm `next/font` is in use (it is, per layout.tsx) and `display: 'swap'` is set (it is). Look for any other font loaded via `<link>` in `<head>` — those are missed optimizations.

- [ ] **Step 3: Find big static assets**

```bash
find public -type f -size +500k -exec ls -lh {} \;
```

Anything > 500 KB in `public/` is a candidate to either move to a CDN (Backblaze B2 is already configured per CSP), compress, or remove if unused.

- [ ] **Step 4: Check `MuxPlayer` import sites**

```bash
grep -rn 'MuxPlayer\|@mux/mux-player' app components --include='*.tsx'
```

Confirm `MuxPlayer` is only imported by components that show video. If it's imported by a layout or always-rendered shell, it's bloating every page.

- [ ] **Step 5: Audit `next.config` `images.remotePatterns`**

Open the surviving `next.config.*`. The `images.remotePatterns` array lists every domain images can be loaded from. For each entry, check if the codebase actually uses that domain:

```bash
# Example for each pattern
grep -rn 'placehold.co' app components --include='*.tsx' --include='*.ts'
```

If a pattern has zero usages, flag it for removal in Phase 5.

- [ ] **Step 6: Append rows to the backlog**

```markdown
| N | D | components/CourseCard.tsx:23 | Raw <img> for course thumbnail | Replace with next/image, width 320 height 180 | S | M | ~LCP improvement |
```

- [ ] **Step 7: This task does NOT commit yet**

---

## Phase 4 — Re-measure & wins report

### Task 16: Re-run the baseline measurements

**Files:**
- Read: `docs/superpowers/specs/2026-04-06-cleanup-baseline.md` (for the commands and the format)

- [ ] **Step 1: Open the baseline file to copy the exact reproduction commands**

```bash
cat docs/superpowers/specs/2026-04-06-cleanup-baseline.md
```

- [ ] **Step 2: Run the same commands**

```bash
rm -rf .next
time bun run build 2>&1 | tee /tmp/dancehub-build-after.log
du -sh .next
du -sh node_modules
jq '.dependencies | length' package.json
jq '.devDependencies | length' package.json
grep -rlE '["\x27]use client["\x27]' app/ | wc -l
grep -rlE '["\x27]use client["\x27]' components/ | wc -l
ANALYZE=true bun run build 2>&1 | tail -100 > /tmp/dancehub-analyze-after.log
```

Record every number.

- [ ] **Step 3: This task does not commit. The numbers feed into Task 17.**

---

### Task 17: Write the cleanup wins report

**Files:**
- Create: `docs/superpowers/specs/2026-04-06-cleanup-results.md`

- [ ] **Step 1: Write the wins report**

Create the file with this exact structure:

```markdown
# Cleanup Wins Report — 2026-04-06

Delta between the Phase 0 baseline and the post-cleanup measurement (after Phases 1–3, before Phase 5).

## Quantitative deltas

| Metric | Before | After | Delta | % |
|---|---|---|---|---|
| `dependencies` count | _<from baseline>_ | _<from Task 16>_ | _<diff>_ | _<%>_ |
| `devDependencies` count |  |  |  |  |
| `node_modules` size |  |  |  |  |
| `.next` size |  |  |  |  |
| Cold build wall-clock time |  |  |  |  |
| `'use client'` count in `app/` |  |  |  |  |
| `'use client'` count in `components/` |  |  |  |  |

## Top 10 heaviest routes — before vs after

| # | Route | Before (KB) | After (KB) | Delta |
|---|---|---|---|---|
| 1 |  |  |  |  |
| ... |  |  |  |  |

## Dependencies removed

- `@daily-co/daily-js`
- `@daily-co/daily-react`
- `@blocknote/core`
- `@blocknote/react`
- `@blocknote/shadcn`
- `novel`
- `@supabase/auth-helpers-nextjs`
- `react-toastify`

## Files removed

- 6 orphan Daily.co components
- 1 deprecated supabase client (`lib/supabase/client.ts`)
- 1 stale `next.config.*`
- 1 stale `tailwind.config.*`
- 1 `backup/` directory
- (possibly) 1 root `better-auth-schema.sql`

## Files moved

- 8 loose root docs → `docs/archive/`

## Narrative

_<one paragraph summarizing the round: what shipped, what surprised us, what didn't move>_

## Next steps

The runtime performance investigation backlog is published as `2026-04-06-perf-backlog.md`. The follow-up implementation spec is **`<YYYY-MM-DD>-perf-execution-design.md`** (to be brainstormed in a future session) and should target the top 5 items from the backlog.
```

Fill in every blank with the actual numbers from Task 16. **No placeholders allowed in the committed file.**

- [ ] **Step 2: Force-add and commit**

```bash
git add -f docs/superpowers/specs/2026-04-06-cleanup-results.md
git commit -m "docs: cleanup wins report"
```

---

### Task 18: Finalize and commit the perf backlog

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-perf-backlog.md` (built up by Tasks I-A through I-D)

- [ ] **Step 1: Read the backlog file in full**

```bash
cat docs/superpowers/specs/2026-04-06-perf-backlog.md
```

Confirm there are at least 10 rows total across all four probes.

- [ ] **Step 2: Sort the backlog rows by impact-per-effort**

A rough scoring rule: assign each row a priority score where Impact (H=3, M=2, L=1) is divided by Effort (S=1, M=2, L=3). Sort rows by score descending. Highest-score rows go to the top.

Re-order the table rows in the file accordingly. Re-number the `#` column.

- [ ] **Step 3: Add a "Top 5" section at the top**

After the title and intro, before the table, add:

```markdown
## Top 5 candidates for the follow-up perf execution spec

1. _<row 1 description>_
2. _<row 2 description>_
3. _<row 3 description>_
4. _<row 4 description>_
5. _<row 5 description>_
```

Fill in with the top 5 rows from the sorted table.

- [ ] **Step 4: Add a "Phase 5 candidates" section**

After the Top 5, add a section listing every backlog row that meets the Phase 5 admission criteria (≤ 5 lines, mechanical, < 30s review). These will be the input to Phase 5 Task 19.

```markdown
## Phase 5 candidates (≤ 5-line mechanical fixes)

- _<row N>_: _<description>_
- _<row M>_: _<description>_
```

- [ ] **Step 5: Force-add and commit**

```bash
git add -f docs/superpowers/specs/2026-04-06-perf-backlog.md
git commit -m "docs: finalize runtime perf investigation backlog"
```

---

## Phase 5 — Trivial perf wins from the investigation

> **Strict admission rule:** a fix can be in Phase 5 only if all four are true: (1) diff ≤ 5 lines, (2) mechanical, (3) reviewable in < 30s, (4) listed in the backlog. Anything else goes to the follow-up spec.

### Task 19: Triage the backlog into Phase 5 work and follow-up work

**Files:**
- Read: `docs/superpowers/specs/2026-04-06-perf-backlog.md`

- [ ] **Step 1: Re-read the "Phase 5 candidates" section from Task 18 Step 4**

This is your work list. Each item is one tiny fix.

- [ ] **Step 2: Group candidates by category**

Group similar fixes together. Likely categories include:
- **Image swaps** (`<img>` → `<Image>`)
- **Per-icon `lucide-react` imports**
- **`'use client'` directive removals** (only on files where there's literally no interactivity)
- **`next.config` `images.remotePatterns` pruning**
- **Server-only-import leak fixes** (one line each)

- [ ] **Step 3: Plan one commit per category, not one per file**

Tasks 20+ each handle one category. If a category has zero candidates, skip the corresponding task.

---

### Task 20: Phase 5 — Image swaps (only if Phase 5 candidates include any)

**Files:**
- Modify: each `.tsx` file containing a `<img>` flagged in the backlog

- [ ] **Step 1: For each flagged file, swap `<img>` to `<Image>`**

For a typical case:

```tsx
// before
<img src="/course-thumb.jpg" alt="Course" className="w-80 h-45" />
```

```tsx
// after
import Image from 'next/image';
// ...
<Image src="/course-thumb.jpg" alt="Course" width={320} height={180} className="w-80 h-45" />
```

If a file already imports `Image` from somewhere else, do not duplicate. If `width`/`height` are not obvious, the fix is NOT trivial — move it to the follow-up backlog and skip this file.

- [ ] **Step 2: Build to confirm**

```bash
bun run build
```

Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Visual smoke test**

```bash
bun dev
```

Open each affected page and confirm the image still renders at the right size and aspect ratio. Press Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf: swap raw <img> to next/image (Phase 5 trivial wins)"
```

---

### Task 21: Phase 5 — `lucide-react` per-icon imports (only if any wildcard imports were found)

**Files:**
- Modify: each file flagged in Probe B as having a `lucide-react` wildcard import

- [ ] **Step 1: For each flagged file, convert wildcard imports to named imports**

```tsx
// before
import * as Icons from 'lucide-react';
// usage: <Icons.Bold />

// after
import { Bold, Italic, ... } from 'lucide-react';
// usage: <Bold />
```

List exactly the icons used in the file. If the file uses dynamic icon lookup (e.g. `Icons[iconName]`), the fix is NOT trivial — move to follow-up.

- [ ] **Step 2: Build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "perf: per-icon lucide-react imports (Phase 5 trivial wins)"
```

---

### Task 22: Phase 5 — `'use client'` directive removals (only on files with zero interactivity)

**Files:**
- Modify: each file flagged in Probe A as "Should be pure RSC"

- [ ] **Step 1: For each flagged file, remove the `'use client'` line**

Open the file. Confirm it has zero `useState`, `useEffect`, `useRef`, `onClick`, `onChange`, browser-API access, and no client-only library imports. If ANY of those are present, the fix is NOT trivial — move to follow-up.

Delete the `"use client";` line at the top of the file.

- [ ] **Step 2: Build to confirm RSC compatibility**

```bash
bun run build
```

Expected: succeeds. Common failures: "useX is not defined in server components" — that means the file IS interactive after all. Restore the directive and move to follow-up.

- [ ] **Step 3: Visual smoke test**

```bash
bun dev
```

Open every page that includes the affected component and confirm it still renders correctly. Press Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf: remove 'use client' from non-interactive components (Phase 5 trivial wins)"
```

---

### Task 23: Phase 5 — Prune `next.config` `images.remotePatterns`

**Files:**
- Modify: the surviving `next.config.*`

- [ ] **Step 1: For each pattern flagged in Probe D as unused, remove it**

In the surviving `next.config.*`, locate the `images.remotePatterns` array and delete the entries that have zero usages in the codebase.

- [ ] **Step 2: Build**

```bash
bun run build
```

- [ ] **Step 3: Visually verify image-heavy pages still load**

```bash
bun dev
```

Test the landing page and at least one community page. Confirm images still load. Press Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add next.config.*
git commit -m "perf: remove unused image remotePatterns (Phase 5 trivial wins)"
```

---

### Task 24: Phase 5 — Fix server-only import leaks (one line each)

**Files:**
- Modify: each client component flagged in Probe B as importing a server-only SDK

- [ ] **Step 1: For each flagged file, identify the leaked import**

Common cases:
- `import Stripe from 'stripe'` in a client component → should be in an API route only.
- `import { S3Client } from '@aws-sdk/client-s3'` in a client component → ditto.
- `import Mux from '@mux/mux-node'` in a client component → ditto (use `@mux/mux-player-react` instead).
- `import { Pool } from 'pg'` in a client component → ditto.

- [ ] **Step 2: Remove the leaked import and the code that uses it**

If the leaked code path is short (≤ 5 lines), remove it inline and replace with a fetch to the corresponding API route. If it's longer, the fix is NOT trivial — move to follow-up.

- [ ] **Step 3: Build**

```bash
bun run build
```

- [ ] **Step 4: Smoke-test the affected page**

```bash
bun dev
```

Open the affected page and confirm the functionality still works (it should — the fetch to the API route should produce the same data). Press Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf: remove server-only SDK imports from client components (Phase 5 trivial wins)"
```

---

### Phase 5 verification gate

After all Phase 5 tasks (only the ones with non-empty backlog candidates), run the final check:

- [ ] **Build passes:** `bun run build`
- [ ] **Lint passes:** `bun lint`
- [ ] **Tests pass:** `bun test`
- [ ] **Full smoke test of high-traffic pages:** landing, dashboard, one community page, one classroom page, one private lesson page, one live class.
- [ ] **Optional: re-run analyzer to capture the Phase 5 deltas**

```bash
rm -rf .next
ANALYZE=true bun run build
```

If the deltas are meaningful, append a "Phase 5 deltas" addendum to `2026-04-06-cleanup-results.md` and commit.

---

## Final state checklist

After all phases complete, verify:

- [ ] `bun run build` passes
- [ ] `bun lint` passes
- [ ] `bun test` passes
- [ ] Repo root `ls *.md` shows only `README.md` and `CLAUDE.md`
- [ ] `backup/` directory does not exist
- [ ] Only one `next.config.*` exists
- [ ] Only one `tailwind.config.*` exists
- [ ] `package.json` no longer contains `@daily-co/daily-js`, `@daily-co/daily-react`, `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn`, `novel`, `@supabase/auth-helpers-nextjs`, `react-toastify`
- [ ] `lib/supabase/client.ts` does not exist
- [ ] No file in `components/` matches `*Daily*.tsx`, `VideoCall.tsx`, or `SimpleVideoCall.tsx`
- [ ] `docs/superpowers/specs/2026-04-06-cleanup-baseline.md` exists and is committed
- [ ] `docs/superpowers/specs/2026-04-06-cleanup-results.md` exists and is committed
- [ ] `docs/superpowers/specs/2026-04-06-perf-backlog.md` exists, has ≥ 10 rows, and is committed
- [ ] LiveKit room loads in dev (CSP regression check)
- [ ] `/community/foo` redirects to `/foo` in dev (redirect regression check)
- [ ] Login + dashboard work in dev (auth regression check)
