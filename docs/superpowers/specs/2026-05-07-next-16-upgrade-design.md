# Next.js 14 → 16 + React 18 → 19 upgrade

**Date:** 2026-05-07
**Branch (proposed):** `chore/next-16-upgrade`
**Worktree (proposed):** `/home/debian/apps/dance-hub-next16`
**Cut from:** `main@95465db`

## Goal

Upgrade Dance-Hub from Next.js 14.2.16 to Next.js 16.x (currently 16.2.2), with the React 18 → 19 bump that Next 16 requires. Validate via local smoke + a 2–3 day soak on `preprod.dance-hub.io` before merging to `main`.

## Why now

Next 16 is the current stable. Staying two majors behind blocks security patches, locks us out of new caching primitives (`'use cache'`, dynamicIO), and makes future dep upgrades harder as packages drop React 18 peerDeps.

## Scope

**In scope**

- `next` 14.2.16 → 16.x
- `react`, `react-dom` 18.x → 19.x
- `@types/react`, `@types/react-dom` 18 → 19
- `eslint-config-next` 14.0.4 → 16.x
- Async-API codemod across pages, layouts, route handlers (cookies/headers/draftMode/params/searchParams)
- Replace `"lint": "next lint"` (removed in 16) with direct `eslint .`
- Drop `output: 'standalone'` from `next.config.js` (we never use the standalone server)
- Switch `pm2 dance-hub-preprod` from `bunx next dev` to `bunx next start` so soak actually validates the prod build path
- Per-call audit of `fetch()` and GET route handlers for the Next 15+ no-cache default

**Out of scope** (explicit non-goals — separate PRs, separate cycles)

- Tailwind v3 → v4
- ESLint 8 → 9 (flat config). Stay on eslint 8; just stop calling `next lint`.
- Adopting `'use cache'`, `dynamicIO`, or PPR
- Touching the existing `landing-v4` work in `dance-hub-preprod`
- Auto-merging to `main` without explicit go-ahead post-soak

## Pre-flight (already verified)

| Check | Required | Actual | Status |
|---|---|---|---|
| Node | ≥ 20.9.0 | 22.22.0 | ✅ |
| TypeScript | ≥ 5.1.0 | 5.9.3 | ✅ |
| `next/legacy/image` usage | none | none | ✅ |
| `useAmp` / `serverRuntimeConfig` / `publicRuntimeConfig` usage | none | none | ✅ |
| Existing middleware file | n/a (none) | none | ✅ |
| `eslint` key in `next.config.js` | not present | not present | ✅ |
| AMP config | not present | not present | ✅ |

## Mechanics (what the upgrade actually does)

### Step 1: codemod
```bash
npx @next/codemod@latest upgrade 16
```
This will:
- Bump `next`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint-config-next` in `package.json`
- Run `lockfile`-aware install
- Apply async-API transforms across:
  - 39 `page.tsx` files
  - 5 `layout.tsx` files
  - 116 `route.ts` files
  - All `cookies()` / `headers()` callers in `lib/`
- Where it can't auto-fix, it inserts `(cookies() as unknown as UnsafeUnwrappedCookies)` casts and a comment for manual review

### Step 2: manual edits

**`next.config.js`**
- Remove `output: 'standalone'`
  - Reason: `next start` is incompatible with `output: 'standalone'` in Next 16 (warns and tells you to run `node .next/standalone/server.js`). Our pm2 launches use `npm start` / `next start`, never the standalone server. Removing the option matches actual usage.
- Leave `withBundleAnalyzer`, `images.remotePatterns`, `redirects`, `headers` (CSP) untouched — none use removed APIs.

**`package.json`**
- Change `"lint": "next lint"` → `"lint": "eslint ."`
  - Reason: `next lint` is removed in 16. We keep `eslint-config-next@16.x` extending in `.eslintrc.json` (legacy config; ESLint 8 still supports it).

### Step 3: fetch / cache audit
1. `grep -rn "fetch(" app/ lib/ --include="*.ts" --include="*.tsx"`
2. For each call site, decide:
   - **Public/static data** that previously was cached implicitly → add `cache: 'force-cache'` or `next: { revalidate: N }`
   - **Per-request data** (auth-aware, user-specific) → leave default (no-store)
3. For GET route handlers under `app/api/` that should remain cached, add `export const dynamic = 'force-static'` at the top of the route file. Default for everything else: leave uncached.

### Step 4: pm2 launch correction (preprod only, in this PR)
Update the pm2 saved entry for `dance-hub-preprod`:
- **Before:** `bash -c "cd /home/debian/apps/dance-hub-preprod && bunx next dev -p 3009 -H 0.0.0.0"`
- **After:** `bash -c "cd /home/debian/apps/dance-hub-next16 && bunx next start -p 3009 -H 0.0.0.0"` (pre-build required)

Workflow:
```bash
cd /home/debian/apps/dance-hub-next16
bun install
bun run build
pm2 delete dance-hub-preprod
pm2 start "bunx next start -p 3009 -H 0.0.0.0" \
  --name dance-hub-preprod \
  --cwd /home/debian/apps/dance-hub-next16
pm2 save
```

(Prod `dance-hub` pm2 entry is NOT touched in this PR. The deploy.sh path keeps working.)

## Risk surface

| Area | Likelihood | Mitigation |
|---|---|---|
| Implicit-cache regression on `fetch()` calls | Medium | Step 3 audit + 2–3 day soak |
| Radix UI components vs React 19 ref-as-prop | Low | Current Radix versions support React 19; verify on first build |
| @tiptap v2 React 19 peerDep | Medium | Locked on v2 per prior `@react-email/editor` spike. Accept peer warning; verify editor mounts in admin/emails composer |
| @livekit/components-react ^2.9 React 19 | Low–Medium | Verify peer; bump within 2.x if needed |
| @mux/mux-player-react ^3.2 React 19 | Low | Verify peer; bump within 3.x if needed |
| better-auth + @supabase/ssr async cookies path | Low | Codemod handles; smoke OAuth callback explicitly |
| Server Actions default `default-no-store` fetch | Medium | Step 3 covers this |
| Turbopack dev default | Low | Fall back to `--webpack` if a specific lib breaks |

## Validation matrix

| Stage | Pass criteria |
|---|---|
| `bun install` | Resolves; peer warnings acceptable, no errors |
| `bun run build` | Exits 0, no type errors |
| `bun start -p 3010` (local) | App boots; landing renders |
| Smoke: `/` (landing) | MuxPlayer hero + product tour video play |
| Smoke: `/auth/sign-in` + Google OAuth callback | Full round-trip; cookies set |
| Smoke: `/[slug]` (community page) | Feed loads, RLS works |
| Smoke: classroom course playback | Mux video starts; progress writes |
| Smoke: private lesson booking → video session | Stripe checkout completes (real money risk on preprod live keys — use test card or own card with refund); LiveKit room created via Stream-Hub; video joins |
| Smoke: admin broadcast send | TipTap composer opens; react-email render OK; Resend send to `delivered@resend.dev` succeeds |
| Smoke: `/admin/*` pages | Server-side auth; pages render |
| `bun test` | Jest suites pass |
| Soak on `preprod.dance-hub.io` | 2–3 days; check pm2 logs daily for warnings/errors |

## Rollback

| Failure point | Action |
|---|---|
| Build fails | Stay in worktree; investigate. Cost: zero (prod untouched) |
| Local smoke fails | Same |
| Soak surfaces issue | `pm2 delete dance-hub-preprod && pm2 start <old bunx next dev command> && pm2 save`. Total time: <1 min |
| Already merged + prod regression | `./deploy.sh code` after `git revert` of merge commit |

## Merge plan (after green soak)

1. Rebase `chore/next-16-upgrade` on latest `main` if main moved
2. Open PR with this design as the description (linked)
3. Self-review the diff (codemod can be noisy)
4. Merge to `main`
5. `cd /home/debian/apps/dance-hub && ./deploy.sh code`
6. Post-deploy: tail pm2 `dance-hub` logs for 30 min; verify smoke matrix runs cleanly on prod
7. Decide whether to also restore `dance-hub-preprod` to landing-v4 (separate worktree) or leave it tracking the upgraded main

## Memory implications

After successful merge, update CLAUDE.md to reflect:
- No middleware file (it's stale on this anyway)
- Lint command is `eslint .`, not `next lint`
- `output: 'standalone'` removed
