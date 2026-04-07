# Cleanup Baseline — 2026-04-06

Captured before any cleanup phase ran. All numbers reproducible by running the commands below from a clean working tree on the cleanup branch.

## Capture context

- **Branch:** `chore/cleanup-and-perf-investigation`
- **Commit at capture time:** `2c4134cc666c14c43b3da1a2f60db7f6ac2dba95` (HEAD = "chore: wire @next/bundle-analyzer behind ANALYZE=true flag")
- **Date:** 2026-04-06
- **Host:** dedicated server (self-hosted, no Vercel)
- **Runtime:** Bun 1.3.9, Next.js 14.2.16

## Reproduction commands

```bash
# Reset build artifacts
rm -rf .next

# Cold build with timing (captures wall-clock and the route table)
time bun run build

# Filesystem and dep counts
du -sh .next
du -sh node_modules
jq '.dependencies | length' package.json
jq '.devDependencies | length' package.json
grep -rlE '["\x27]use client["\x27]' app/ | wc -l
grep -rlE '["\x27]use client["\x27]' components/ | wc -l

# Bundle analyzer HTML reports (separate run, .next is wiped to be deterministic)
rm -rf .next
ANALYZE=true bun run build
# Reports land in .next/analyze/{client.html,nodejs.html,edge.html}
```

## Top-line numbers

| Metric | Value |
|---|---|
| `dependencies` count | **78** |
| `devDependencies` count | **26** |
| `node_modules` size | **1.2 GB** |
| `.next` size (post normal build) | **484 MB** |
| Cold build wall-clock time | **1m 49.255s** (109.255s) |
| `'use client'` count in `app/` | **17** |
| `'use client'` count in `components/` | **78** |
| Total `'use client'` directives (app + components) | **95** |

## Top 10 heaviest page routes (First Load JS)

Sorted descending by First Load JS. Excludes API routes (which are 0 B for First Load JS in the build output).

| # | Route | Page Size | First Load JS |
|---|---|---|---|
| 1 | `/[communitySlug]/about` | 13.1 kB | **613 kB** |
| 2 | `/[communitySlug]/classroom/[courseSlug]` | 11.3 kB | **611 kB** |
| 3 | `/[communitySlug]` | 43.8 kB | **411 kB** |
| 4 | `/[communitySlug]/private-lessons` | 13.5 kB | **218 kB** |
| 5 | `/[communitySlug]/classroom` | 4.57 kB | **200 kB** |
| 6 | `/[communitySlug]/calendar` | 9.69 kB | **187 kB** |
| 7 | `/discovery` | 1.91 kB | **181 kB** |
| 8 | `/privacy` | 226 B | **174 kB** |
| 9 | `/terms` | 226 B | **174 kB** |
| 10 | `/admin/users` | 7.11 kB | **157 kB** |

**Shared chunks (loaded on every page):**
- `chunks/2117-5f5aaf612df78fd1.js` — 31.8 kB
- `chunks/fd9d1056-1e8569d4feb83435.js` — 53.6 kB
- Other shared chunks — 2.48 kB
- **Total First Load JS shared by all routes: 87.9 kB**

**Middleware:** 29.1 kB

## Bundle analyzer reports

The webpack-bundle-analyzer HTML reports are at:

```
.next/analyze/client.html    (754 KB)
.next/analyze/nodejs.html  (1306 KB)
.next/analyze/edge.html     (277 KB)
```

These are intentionally **not committed** — they're rebuildable and bulky. To inspect module-level sizes, regenerate them locally and open `client.html` in a browser. The treemap visualization shows every chunk and the modules within it; this is the source of truth for Probe B (Bundle hot-spot analysis) in the investigation track.

The cleanup spec lists known offenders to look for:
`lucide-react` wildcard imports, `motion`, `date-fns` tree-shaking, `@radix-ui/*` umbrella imports, and any client-side imports of server-only SDKs (`stripe`, `@aws-sdk/*`, `@mux/mux-node`, `pg`, `@neondatabase/serverless`).

## Notes for Phase 4 reconciliation

When Phase 4 re-runs these measurements, use the **exact same commands** above and capture the same metrics in the same units. The wins report at `2026-04-06-cleanup-results.md` will diff before vs. after for each metric and produce a `delta + %` column.

Two metrics that won't move much in this round:
- **`'use client'` counts** — we are explicitly NOT converting components to RSC in this round (that's the follow-up perf execution spec). The number is captured here as a baseline for the follow-up.
- **Top 10 routes** — most of the bundle weight is in third-party libs, not the components we're deleting. Expect modest drops (5–15%) from removing Daily.co/BlockNote/Novel/react-toastify, with the biggest improvement on routes that previously included those libs.

Two metrics that should move meaningfully:
- **`dependencies` count** — drop by 7–8 packages (Daily x2, BlockNote x3, Novel, react-toastify, supabase auth-helpers).
- **`node_modules` size** — drop proportional to the deps removed (rough estimate: 100–200 MB).
