# Next.js 14 → 16 + React 18 → 19 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Dance-Hub from Next.js 14.2.16 to Next.js 16.x with the required React 18→19 bump, validated by local smoke + 2–3 day soak on preprod, then merged to main.

**Architecture:** Isolated git worktree, codemod-driven version bump, manual config edits for removed APIs (`next lint`, `output: 'standalone'`), per-call audit of fetch/cache defaults, then ops swap of pm2 `dance-hub-preprod` from `next dev` to `next start` against the new worktree.

**Tech Stack:** Next 16, React 19, bun, pm2, eslint 8, TypeScript 5.9, Mux, LiveKit, Stripe, better-auth, @supabase/ssr, TipTap v2, react-email/Resend.

**Spec:** `docs/superpowers/specs/2026-05-07-next-16-upgrade-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `/home/debian/apps/dance-hub-next16/` | Create worktree | Isolated workspace for upgrade |
| `package.json` | Modify | Bumped deps; `lint` script change |
| `bun.lockb` (or `package-lock.json`) | Modify | Updated lock |
| `next.config.js` | Modify | Drop `output: 'standalone'` |
| `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/route.ts` | Codemod-modified | Async cookies/headers/params/searchParams |
| `lib/supabase/*.ts` | Codemod-modified | Async cookies in helpers |
| `app/api/**/route.ts` (selected) | Modify | Add `export const dynamic = 'force-static'` where caching is desired |
| `docs/superpowers/notes/2026-05-07-next-16-smoke-results.md` | Create | Smoke matrix results log |
| `CLAUDE.md` | Modify (post-merge) | Reflect new lint cmd, no `output: standalone` |
| pm2 saved process list | Modify | `dance-hub-preprod` → `next start` against next16 worktree |

---

## Task 1: Create isolated worktree

**Files:**
- Create: `/home/debian/apps/dance-hub-next16/` (git worktree)

- [ ] **Step 1: Verify main is clean and at expected commit**

Run from `/home/debian/apps/dance-hub`:
```bash
git status -s
git rev-parse --short HEAD
```
Expected: status shows only the known untracked items (`.agents/`, `.env.preprod`, `app/font-preview/`, `design/`, `package-lock.json`) and one tracked modification (`app/[communitySlug]/admin/page.tsx`); commit is `95465db` or later.

- [ ] **Step 2: Create the worktree on a new branch**

```bash
cd /home/debian/apps/dance-hub
git worktree add /home/debian/apps/dance-hub-next16 -b chore/next-16-upgrade main
```
Expected: `Preparing worktree (new branch 'chore/next-16-upgrade') ... HEAD is now at <sha> ...`

- [ ] **Step 3: Verify worktree**

```bash
git worktree list
```
Expected output includes `/home/debian/apps/dance-hub-next16  <sha> [chore/next-16-upgrade]`.

- [ ] **Step 4: Copy `.env.local` into the worktree**

```bash
cp /home/debian/apps/dance-hub/.env.local /home/debian/apps/dance-hub-next16/.env.local
```
Expected: silent success. (Do NOT use `.env.preprod` — that is already in main repo and may not match the worktree.)

- [ ] **Step 5: Sanity check Node + bun in the worktree**

```bash
cd /home/debian/apps/dance-hub-next16
node --version
bun --version
```
Expected: Node ≥ 20.9 (we have 22.22), bun present.

---

## Task 2: Run the Next.js codemod

**Files:**
- Modify: `/home/debian/apps/dance-hub-next16/package.json`
- Modify: `/home/debian/apps/dance-hub-next16/bun.lockb` or `package-lock.json`
- Codemod-modified: app/**, lib/**

- [ ] **Step 1: Capture pre-codemod versions**

```bash
cd /home/debian/apps/dance-hub-next16
grep -E '"(next|react|react-dom|@types/react|@types/react-dom|eslint-config-next)"' package.json
```
Expected: `"next": "14.2.16"`, `"react": "^18"`, `"react-dom": "^18"`, `"@types/react": "^18"`, `"eslint-config-next": "14.0.4"`.

- [ ] **Step 2: Run the codemod**

```bash
cd /home/debian/apps/dance-hub-next16
npx --yes @next/codemod@latest upgrade 16
```
The codemod is interactive. Choose:
- **Update next**: yes, latest stable (16.x)
- **Update react/react-dom**: yes, 19
- **Update @types/react/@types/react-dom**: yes
- **Apply async-API codemods**: yes (cookies, headers, draftMode, params, searchParams)
- **Use bun as package manager**: yes if prompted

Expected: codemod runs, modifies package.json, runs install, transforms files, prints summary like `Codemod complete. X files updated.`

- [ ] **Step 3: Capture post-codemod versions**

```bash
grep -E '"(next|react|react-dom|@types/react|@types/react-dom|eslint-config-next)"' package.json
```
Expected: `"next": "^16.x"`, `"react": "^19"`, `"react-dom": "^19"`, `"@types/react": "^19"`, `"eslint-config-next": "^16.x"`.

- [ ] **Step 4: Inspect codemod surface**

```bash
git status -s | head -30
git diff --stat | tail -5
```
Expected: many files modified under `app/`, `lib/`, plus `package.json` and lockfile. No deletions.

- [ ] **Step 5: Spot-check one rewritten async API**

```bash
grep -rn "await cookies()\|await headers()\|await props.params\|await props.searchParams" app/ lib/ --include="*.ts" --include="*.tsx" | head -10
```
Expected: at least 5+ matches, confirming codemod applied.

- [ ] **Step 6: Commit codemod output verbatim**

```bash
cd /home/debian/apps/dance-hub-next16
git add -A
git commit -m "$(cat <<'EOF'
chore(deps): run @next/codemod upgrade 16

Bumps next 14.2.16 -> 16.x, react/react-dom 18 -> 19,
@types/react/@types/react-dom 18 -> 19, eslint-config-next -> 16.x.
Applies async cookies/headers/draftMode/params/searchParams transforms.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: commit succeeds.

---

## Task 3: Manual config edits

**Files:**
- Modify: `/home/debian/apps/dance-hub-next16/next.config.js`
- Modify: `/home/debian/apps/dance-hub-next16/package.json`

- [ ] **Step 1: Remove `output: 'standalone'` from `next.config.js`**

Current line in `next.config.js`:
```js
const nextConfig = {
  output: 'standalone',
  images: {
```
Delete the `output: 'standalone',` line. Result:
```js
const nextConfig = {
  images: {
```

- [ ] **Step 2: Update `package.json` lint script**

Current:
```json
    "lint": "next lint",
```
Change to:
```json
    "lint": "eslint .",
```

- [ ] **Step 3: Verify ESLint can still resolve the Next config**

```bash
cd /home/debian/apps/dance-hub-next16
ls .eslintrc.json .eslintrc.js 2>/dev/null
cat .eslintrc.json 2>/dev/null || cat .eslintrc.js 2>/dev/null
```
Expected: a config file exists and `extends` includes `"next/core-web-vitals"` or similar. (No edit needed yet — ESLint 8 still supports legacy config.)

- [ ] **Step 4: Quick lint smoke**

```bash
bunx eslint --version
bun lint 2>&1 | tail -20
```
Expected: ESLint runs. There may be lint errors — that is acceptable here; we only want to confirm the binary executes via the new script. If ESLint cannot resolve `eslint-config-next`, stop and investigate before continuing.

- [ ] **Step 5: Commit manual edits**

```bash
git add next.config.js package.json
git commit -m "$(cat <<'EOF'
chore(next16): drop output:standalone, replace next lint with eslint

next start is incompatible with output:standalone in Next 16,
and we never use the standalone server. next lint is removed
in Next 16, so the lint script now invokes eslint directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: First build + fix compile errors

**Files:**
- Modify (as needed): any file the build complains about

- [ ] **Step 1: Install (idempotent — codemod already installed but confirm)**

```bash
cd /home/debian/apps/dance-hub-next16
bun install 2>&1 | tail -20
```
Expected: install completes. Peer dependency warnings for tiptap v2 / livekit / mux are acceptable; errors are not.

- [ ] **Step 2: Run the production build**

```bash
bun run build 2>&1 | tee /tmp/next16-build-1.log
```
Expected: either passes (`✓ Compiled successfully`) or fails with specific errors. If it passes, skip to Step 5.

- [ ] **Step 3: For each build error, fix at the source**

Common patterns to expect:
- **`params`/`searchParams` is now `Promise<...>` — add `await`** where the codemod missed (often inside helper utils called from pages)
- **`cookies()`/`headers()` returns `Promise<...>` — add `await`** in spots the codemod commented for manual review
- **Type errors on Radix-wrapped `forwardRef` components**: most resolve by updating @types/react to 19; if specific Radix versions are too old, bump within their major (e.g. `bun add @radix-ui/react-dialog@latest`)
- **Stricter type inference on `useState<Type>(undefined)`** when `Type` doesn't include undefined → make explicit

For each error, edit the file the compiler points at, save, re-run `bun run build`. Iterate until green.

- [ ] **Step 4: Commit each error class as its own commit if non-trivial**

If the fixes are mostly type tweaks, one commit is fine:
```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(next16): resolve build errors after codemod

- await missing on cookies()/headers() in helpers the codemod commented
- await on params/searchParams in nested utilities
- type tweaks for React 19 stricter inference

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If a class of fix is large (e.g. forced bump of all @radix-ui packages), make that its own commit:
```bash
git add package.json bun.lockb
git commit -m "chore(deps): bump @radix-ui/* for React 19 compat

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Verify clean build**

```bash
bun run build 2>&1 | tee /tmp/next16-build-final.log | tail -30
```
Expected: `✓ Compiled successfully`, route table prints, no error exit.

- [ ] **Step 6: If any deps were bumped during this task, commit lockfile**

```bash
git status -s
```
If lockfile is dirty, commit it as part of the Step 4 commit you just made (amend) or a new chore commit.

---

## Task 5: Fetch / cache audit

**Files:**
- Modify (as needed): files containing `fetch(` calls

- [ ] **Step 1: List all `fetch(` call sites in app code**

```bash
cd /home/debian/apps/dance-hub-next16
grep -rn "fetch(" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" > /tmp/fetch-audit.txt
wc -l /tmp/fetch-audit.txt
cat /tmp/fetch-audit.txt
```
Expected: a list. Read each line.

- [ ] **Step 2: For each `fetch(` call, decide cache policy**

Decision rule:
- **External/static data that rarely changes** (e.g. static JSON CDN, public RSS) → add `cache: 'force-cache'` or `next: { revalidate: <seconds> }`
- **User-specific or auth-aware data** (anything that reads cookies, session, RLS-scoped data) → leave default (no-store). Do NOT add force-cache.
- **Server-side fetches in API routes for our own DB/Stripe/Mux** → leave default. These should be per-request.
- **Client-side `fetch()` from `'use client'` components** → not affected by Next caching; leave alone.

For each call site that needs explicit caching, add the option. Example:
```ts
// before
const res = await fetch(url)

// after (long-lived)
const res = await fetch(url, { cache: 'force-cache' })

// after (revalidate)
const res = await fetch(url, { next: { revalidate: 3600 } })
```

- [ ] **Step 3: Commit fetch-policy edits**

If any edits were made:
```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(next16): add explicit cache policy for fetch() callers

Next 15+ defaults fetch() to no-store. Restore caching on
call sites that previously relied on the implicit force-cache
default.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no edits needed (every call should remain uncached), skip the commit.

---

## Task 6: GET route handler cache audit

**Files:**
- Modify (as needed): selected `app/api/**/route.ts` files

- [ ] **Step 1: List GET handlers**

```bash
cd /home/debian/apps/dance-hub-next16
grep -rln "export async function GET\|export function GET" app/api/ --include="*.ts" > /tmp/get-routes.txt
wc -l /tmp/get-routes.txt
cat /tmp/get-routes.txt
```
Expected: a list of GET-handler routes.

- [ ] **Step 2: For each, decide if it should remain cached**

Decision rule:
- **Public, non-auth, content rarely changes** (e.g. a public manifest, sitemap data) → add `export const dynamic = 'force-static'` at top of file
- **Auth-aware, user-specific, RLS-scoped, queries DB on every request** → leave default (uncached)
- **Webhook-like or admin-only routes** → leave default

For each route that should be cached, edit the file and add at the top after imports:
```ts
export const dynamic = 'force-static'
```

- [ ] **Step 3: Commit if any changes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(next16): opt cacheable GET route handlers into force-static

Next 15+ no longer caches GET route handlers by default.
Restore caching for public, non-auth-aware routes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no routes need caching, skip the commit.

---

## Task 7: Run unit tests

**Files:**
- Modify (as needed): test files broken by API changes

- [ ] **Step 1: Run jest**

```bash
cd /home/debian/apps/dance-hub-next16
bun test 2>&1 | tee /tmp/next16-jest.log | tail -40
```
Expected: either passes or fails with specific test errors.

- [ ] **Step 2: Fix breakages**

Common patterns:
- **Tests using `cookies()` synchronously** — add `await` and make the test `async`
- **Mocks for `next/headers`** — return promises now
- **Snapshot tests** — `bun test -u` to update if intentional rendering changes; otherwise fix the underlying code

- [ ] **Step 3: Re-run until green**

```bash
bun test 2>&1 | tail -10
```
Expected: `Tests:  N passed`.

- [ ] **Step 4: Commit if any test edits**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(next16): adapt unit tests to async cookies/headers/params

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Local smoke matrix

**Files:**
- Create: `docs/superpowers/notes/2026-05-07-next-16-smoke-results.md` (in main repo, not worktree, so it ships with the design)

- [ ] **Step 1: Start the production server on a free port**

```bash
cd /home/debian/apps/dance-hub-next16
bun start -p 3010 -H 0.0.0.0 &
SERVER_PID=$!
echo "Started PID $SERVER_PID"
sleep 5
curl -sI http://localhost:3010/ | head -5
```
Expected: `HTTP/1.1 200 OK` (or 307/308 redirect if applicable).

- [ ] **Step 2: Create the smoke results note**

Create `/home/debian/apps/dance-hub/docs/superpowers/notes/2026-05-07-next-16-smoke-results.md` (note: in **main** repo, not worktree — it documents the upgrade decision):

```markdown
# Next 16 Upgrade — Local Smoke Results

**Date:** 2026-05-07
**Worktree:** /home/debian/apps/dance-hub-next16
**Branch:** chore/next-16-upgrade
**Local server:** http://localhost:3010

## Results

| # | Path | Action | Pass/Fail | Notes |
|---|---|---|---|---|
| 1 | `/` (landing) | Page renders, MuxPlayer loads, product tour video plays | | |
| 2 | `/auth/sign-in` | Page renders | | |
| 3 | `/auth/sign-in` → Google OAuth → `/auth/callback` | Round-trip works, cookies set, redirected to community | | |
| 4 | `/[slug]` (any community page) | Feed loads, posts render, RLS scoped correctly | | |
| 5 | `/[slug]/classroom/[course]` | Mux video starts, progress UI updates | | |
| 6 | `/[slug]/private-lessons` | Page renders, lesson list shown | | |
| 7 | Book a lesson → Stripe checkout (test card or own + refund) | Checkout completes, lesson_bookings row created | | |
| 8 | Join lesson video session | LiveKit room joins, AV works | | |
| 9 | `/[slug]/admin/emails` (broadcasts) | Page loads, TipTap composer opens | | |
| 10 | Send broadcast to delivered@resend.dev | Resend accepts, dashboard shows sent | | |
| 11 | `/[slug]/admin/*` other admin pages | Render, server-side auth gates work | | |

## Issues found

(list any during smoke)

## Verdict

(pass / fail / fix-then-retry)
```

- [ ] **Step 3: Walk the smoke matrix manually**

Open `http://localhost:3010` in a browser. For each row in the table, perform the action and fill in the Pass/Fail column with notes.

For row 7 (Stripe): preprod uses **live keys** per memory `project_preprod_stripe_live_keys.md`. Use a test card if Stripe test mode is configurable for this app, or use your own card and refund immediately afterwards via Stripe dashboard.

- [ ] **Step 4: Stop the server**

```bash
kill $SERVER_PID
```

- [ ] **Step 5: If all rows pass, commit smoke results**

```bash
cd /home/debian/apps/dance-hub
git add -f docs/superpowers/notes/2026-05-07-next-16-smoke-results.md
git commit -m "$(cat <<'EOF'
docs(next16): record local smoke results

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If any rows fail: stop here, document the failure in the notes file, return to the appropriate task to fix, then re-run smoke.

---

## Task 9: Switch preprod pm2 to next start against the new worktree

**Files:**
- pm2 saved process list (no file in repo)

- [ ] **Step 1: Confirm current pm2 config**

```bash
pm2 describe dance-hub-preprod | grep -E "exec cwd|script path|script args"
```
Expected: `script path: /usr/bin/bash`, `script args: -c cd /home/debian/apps/dance-hub-preprod && bunx next dev -p 3009 -H 0.0.0.0`. Record this exact line so rollback is easy.

- [ ] **Step 2: Save the rollback command**

```bash
echo 'pm2 start "bash -c \"cd /home/debian/apps/dance-hub-preprod && bunx next dev -p 3009 -H 0.0.0.0\"" --name dance-hub-preprod' > /tmp/preprod-rollback.txt
cat /tmp/preprod-rollback.txt
```
Expected: shows the rollback line. Keep this file until merge is complete.

- [ ] **Step 3: Stop and remove the existing preprod entry**

```bash
pm2 delete dance-hub-preprod
```
Expected: `[PM2] Applying action deleteProcessId on app [dance-hub-preprod]`. The `landing-v4` worktree at `/home/debian/apps/dance-hub-preprod` remains on disk untouched.

- [ ] **Step 4: Build the next16 worktree if not already built (Task 4 should have done this)**

```bash
cd /home/debian/apps/dance-hub-next16
ls -la .next/BUILD_ID 2>/dev/null
```
Expected: file exists. If not, re-run `bun run build`.

- [ ] **Step 5: Start the new pm2 entry**

```bash
pm2 start "bunx next start -p 3009 -H 0.0.0.0" \
  --name dance-hub-preprod \
  --cwd /home/debian/apps/dance-hub-next16
pm2 save
```
Expected: process online; `pm2 list` shows `dance-hub-preprod` with status `online`.

- [ ] **Step 6: Verify externally**

```bash
sleep 5
curl -sI https://preprod.dance-hub.io/ | head -5
```
Expected: HTTP 200 or 3xx.

- [ ] **Step 7: Tail logs for first minute**

```bash
pm2 logs dance-hub-preprod --lines 50 --nostream
```
Expected: server log shows `Ready on http://0.0.0.0:3009`, no error stack traces.

---

## Task 10: Soak (2–3 days, monitored)

**Files:**
- Append to: `docs/superpowers/notes/2026-05-07-next-16-smoke-results.md`

- [ ] **Step 1: Daily — check pm2 status**

Once per day for 2–3 days:
```bash
pm2 status dance-hub-preprod
pm2 logs dance-hub-preprod --lines 200 --nostream | grep -iE "error|warning|fatal" | head -20
```
Append findings to the smoke results note under a `## Soak Day N` section.

- [ ] **Step 2: Daily — exercise main flows**

Visit `https://preprod.dance-hub.io`, do a quick walk-through of items 1, 4, 5, 9 from the smoke matrix. Note anomalies.

- [ ] **Step 3: Decide go/no-go after 2–3 days**

If clean: proceed to Task 11. If issues: stop, document, fix in worktree, rebuild, `pm2 restart dance-hub-preprod`, restart soak day count.

---

## Task 11: Open PR and merge to main

**Files:**
- New PR (no file in repo)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rebase on latest main**

```bash
cd /home/debian/apps/dance-hub-next16
git fetch origin main
git rebase origin/main
```
Expected: clean rebase or trivial conflict resolution.

- [ ] **Step 2: Update CLAUDE.md to reflect changes**

Find the `**Code Style Preferences** ...` section near the bottom of the architecture description in `/home/debian/apps/dance-hub-next16/CLAUDE.md`. Make the following targeted edits:

In the `## Development Commands` section, change `bun lint            # Run ESLint` line note (no command change — `bun lint` still works because `package.json` script changed).

In the **Authentication & Authorization** subsection, change:
```
- Middleware protects admin routes (`middleware.ts`)
```
to:
```
- Server-side auth checks in admin layouts (no middleware/proxy file at present)
```

In the **Video Integration** line at the top, change `Daily.co` to `LiveKit (via Stream-Hub)`.

(These keep CLAUDE.md aligned with reality. Memory already flags these as stale.)

- [ ] **Step 3: Commit CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): align with Next 16 + actual stack

- No middleware/proxy file in use
- Video stack is LiveKit, not Daily.co
- Lint script now uses eslint directly

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin chore/next-16-upgrade
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "chore: upgrade Next 14 → 16 + React 18 → 19" --body "$(cat <<'EOF'
## Summary
- Bumps next 14.2.16 → 16.x, react/react-dom 18 → 19, @types/react 18 → 19, eslint-config-next → 16.x
- Codemod-applied async cookies/headers/draftMode/params/searchParams
- Drops `output: 'standalone'` from next.config.js (we never used the standalone server)
- Replaces removed `next lint` with direct `eslint .`
- Per-call audit of fetch() and GET route handlers for the new no-store default
- Soaked 2–3 days on preprod.dance-hub.io against the upgraded build

## Test plan
- [x] bun run build green
- [x] bun test green
- [x] Local smoke (see `docs/superpowers/notes/2026-05-07-next-16-smoke-results.md`)
- [x] Preprod soak ≥ 2 days, no errors in pm2 logs
- [ ] Post-merge: tail prod pm2 logs for 30 min after `./deploy.sh code`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 6: Self-review the diff in the PR UI**

Open the PR. Click through the file list. Verify:
- No surprising file deletions
- No accidentally committed `.env*`
- Codemod transforms look reasonable (await on cookies/headers, params now Promise)
- next.config.js diff is exactly the `output: 'standalone'` removal
- package.json diff shows the version bumps + lint script

If anything looks off, push fixes to the branch.

- [ ] **Step 7: Merge**

Confirm with the user before merging — this is a major version bump landing on main and triggering prod deploy.

```bash
# Only after explicit user approval
gh pr merge --squash --delete-branch
```

---

## Task 12: Deploy to prod and verify

**Files:**
- pm2 saved process list (no file)

- [ ] **Step 1: Deploy via existing script**

```bash
cd /home/debian/apps/dance-hub
./deploy.sh code
```
Expected: pulls main, `npm install`, `npm run build`, pm2 restarts `dance-hub`.

- [ ] **Step 2: Verify prod responds**

```bash
sleep 5
curl -sI https://dance-hub.io/ | head -5
pm2 status dance-hub
```
Expected: HTTP 200/3xx; pm2 status `online`.

- [ ] **Step 3: Tail prod logs for 30 minutes**

```bash
pm2 logs dance-hub --lines 200 --nostream
```
Repeat every ~5 min for 30 min; watch for error spikes. If clean: done. If errors: roll back via `git revert <merge-sha> && ./deploy.sh code`.

- [ ] **Step 4: Decide preprod fate**

Two options (ask user):
- (a) Restore preprod to landing-v4 worktree → `pm2 delete dance-hub-preprod && <rollback command from /tmp/preprod-rollback.txt> && pm2 save`
- (b) Leave preprod tracking the upgraded main (just rebuild after future merges)

- [ ] **Step 5: Clean up the worktree if appropriate**

If user chose (a) and we're done with the next16 worktree:
```bash
cd /home/debian/apps/dance-hub
git worktree remove /home/debian/apps/dance-hub-next16
```

If user wants to keep the worktree as a scratch space, skip this step.

---

## Self-review summary

- **Spec coverage:** Every spec section has at least one task. Pre-flight (already verified) → Task 1 sanity. Mechanics → Tasks 2–6. Validation matrix → Tasks 7–8. pm2 swap → Task 9. Soak → Task 10. Merge plan → Tasks 11–12. Memory implications (CLAUDE.md update) → Task 11 Step 2.
- **Placeholder scan:** No "TBD"/"TODO"/"add appropriate handling". Every code-change step has the actual diff or grep command.
- **Type consistency:** No new types defined; we're modifying existing code.
- **Risk-area coverage:** TipTap/LiveKit/Mux peer warnings → Task 4 Step 3. Server Action fetch defaults → Task 5. Turbopack dev → not applicable (we're using `next start` everywhere).
