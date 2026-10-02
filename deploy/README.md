# Deploys: release directories

`deploy.sh` (prod) and `deploy-preprod.sh` share `deploy/lib.sh`, so a preprod
deploy runs the same code a prod deploy will.

## How it works

Every deploy is built in its own directory, and the live app only switches to
it once the build has succeeded:

```
/home/debian/apps/releases/dance-hub/
  20261002-140512-ab12cd3/     git worktree of one commit, with its own
  20261003-091200-ef45ab6/     .env.local, node_modules and .next
  current -> 20261003-091200-ef45ab6
/home/debian/apps/releases/dance-hub-preprod/   (same layout)
```

A deploy:

1. adds a detached git worktree of the target commit from the main repo
   (`/home/debian/apps/dance-hub`) in a new `<UTC timestamp>-<short sha>` directory;
2. copies the env file in as `.env.local` (prod: the main repo's `.env.local`;
   preprod: the main repo's `.env.preprod`). The source file is never modified;
3. runs `bun install --frozen-lockfile` and `bun run build` there;
4. only if both succeed: points `current` at it (atomic `ln -sfn` + `mv -T`),
   runs `pm2 delete` + `pm2 start <current>/node_modules/next/dist/bin/next --cwd <current>`
   (next runs directly under pm2, never via npm/npx), `pm2 save`, and checks
   that pm2's own pid holds the port and serves from the new release;
5. keeps `current` plus the 2 newest other releases and removes the rest
   with `git worktree remove`.

A failed build removes its half-built directory and leaves the running
release untouched. Only one deploy per app can run at a time.

The restart step (in deploys, `rebuild` and `rollback`) normally takes 1-2 s.
It can take up to 30 s: pm2 gives the old server that long to exit
(`--kill-timeout 30000`) so a broadcast still being sent in the background
can finish instead of being cut off.

The running server keeps its files while a new release builds next to it, so
deploys no longer cause chunk 404s, and there is always a previous build to go
back to.

## Commands

Prod (`./deploy.sh`):

| command | what it does |
| --- | --- |
| `code` | `git pull --ff-only origin main` in the main repo (refused unless it is on `main` with no uncommitted changes to tracked files), then build and switch. If the pull changed the deploy scripts, the new version continues the deploy. Refuses until the live vhost has the Cloudflare real-IP setup (`deploy/nginx/README.md`; `SKIP_NGINX_CHECK=1` overrides). |
| `rebuild` | rebuild the live commit with the current `.env.local` (after an env change); same nginx check as `code` |
| `rollback [release]` | switch back to the previous good release, or to the one named |
| `releases` | list releases, `*` marks the live one |
| `full` | first-time setup: build `HEAD`, install the Cloudflare snippet and the nginx vhost, switch |
| `ssl` | certbot (prod uses Cloudflare origin certificates, so normally unused) |
| `nginx-config` | print the vhost `full` writes |

Preprod (`./deploy-preprod.sh`): `restart [branch]` (builds `origin/<branch>`,
default `main`), `deploy [branch]` (same plus the nginx vhost), `rebuild`,
`rollback [release]`, `releases`, `stop`, `nginx-config`.

Database migrations are not part of a deploy and are not rolled back by
`rollback`.

## What stays in the main repo

`/home/debian/apps/dance-hub` stays the place you work from:

- `.env.local` is the prod env. Edit it there, then run `./deploy.sh rebuild`.
  **pm2 no longer reads it directly**: `pm2 restart dance-hub` restarts the
  release with the copy it was built with.
- `.env.preprod` is the preprod env (plus `.env.preprod.test` / `.live`, see
  below). Edit it there, then `./deploy-preprod.sh rebuild`.
- `scripts/cron-trigger.sh`, run by crontab, still reads `CRON_SECRET` from
  the main repo's `.env.local`, logs to its `logs/`, and calls
  `http://localhost:3007`. Nothing changes for cron.
- The deploy scripts themselves. Run them from the main repo; a copy inside a
  release refuses to run.

The main repo's own `node_modules` and `.next` are no longer served. Leave them
until you are sure you will not go back to in-place deploys.

## First prod deploy with the new script

The `deploy.sh` that is already on the server would run `git pull` and then
keep running its old in-place steps. So pull first, then deploy:

```bash
cd /home/debian/apps/dance-hub
git pull --ff-only origin main
./deploy.sh code
```

Apply the nginx change in `deploy/nginx/README.md` before this:
`./deploy.sh code` refuses to run until the live vhost has it.

This builds the first release in `/home/debian/apps/releases/dance-hub/`, then
moves pm2's `dance-hub` from `cwd /home/debian/apps/dance-hub` to
`/home/debian/apps/releases/dance-hub/current` (pm2 delete + start, a few
seconds of 502 as with every deploy before). Check it:

```bash
./deploy.sh releases
pm2 describe dance-hub | grep -E 'script path|exec cwd'   # .../releases/dance-hub/current/...
readlink -f /proc/$(pm2 pid dance-hub)/cwd                 # .../releases/dance-hub/<release>
```

`pm2 save` stores the `current` path, so after a reboot `pm2 resurrect`
starts whatever release is current.

**Instant fallback** if the first release misbehaves: the main repo's last
in-place build (`/home/debian/apps/dance-hub/.next`, from the last old-style
deploy) is still intact, so this serves it again with no rebuild, using the
main repo's `.env.local`:

```bash
pm2 delete dance-hub
pm2 start /home/debian/apps/dance-hub/node_modules/next/dist/bin/next --name dance-hub --cwd /home/debian/apps/dance-hub --interpreter node -- start -p 3007
pm2 save
readlink -f /proc/$(pm2 pid dance-hub)/cwd    # /home/debian/apps/dance-hub
```

That is the code from before the pull. Running `./deploy.sh code` again
switches back to a release.

Preprod moves the same way on its first `./deploy-preprod.sh restart <branch>`:
pm2's `dance-hub-preprod` goes from `/home/debian/apps/dance-hub-preprod` to
`/home/debian/apps/releases/dance-hub-preprod/current`. The old
`/home/debian/apps/dance-hub-preprod` worktree is then unused. Move its
`.env.preprod.test` / `.env.preprod.live` into the main repo, then remove it.
Each step runs only if the one before succeeded: preprod must already run from
a release, the main repo must not have these files yet, and both must have
arrived, non-empty, before the old worktree goes. `--force` is needed because
that worktree still holds untracked files (its `.env.local`, `node_modules`,
`.next`):

```bash
cd /home/debian/apps/dance-hub \
  && readlink -f /proc/$(pm2 pid dance-hub-preprod)/cwd | grep -q '^/home/debian/apps/releases/dance-hub-preprod/' \
  && test ! -e .env.preprod.test && test ! -e .env.preprod.live \
  && mv /home/debian/apps/dance-hub-preprod/.env.preprod.test /home/debian/apps/dance-hub-preprod/.env.preprod.live . \
  && test -s .env.preprod.test && test -s .env.preprod.live \
  && git worktree remove --force /home/debian/apps/dance-hub-preprod
```

## Stripe mode on preprod

`./stripe-mode.sh test|live` replaces the `STRIPE_*` and
`NEXT_PUBLIC_STRIPE_*` lines of the main repo's `.env.preprod` with those of
`.env.preprod.test` / `.live` (looked up in the main repo, then in the old
preprod worktree). Every other line stays as it is: the mode files still
carry an old Neon `DATABASE_URL`, and copying them whole would point preprod
back at Neon. It then runs `./deploy-preprod.sh rebuild`, because the
publishable key is compiled into the browser bundle. It holds the preprod
deploy lock from before it touches `.env.preprod` until the rebuild is done,
so it changes nothing while a preprod deploy is running, and it keeps the
previous file as `.env.preprod.bak.stripe-mode` (mode 600). `./stripe-mode.sh` with
no argument shows the mode of `.env.preprod`, of the running server's env and
of its browser bundle. It only ever prints the key prefix (`sk_test`,
`sk_live`, ...).

## Rolling back

```bash
./deploy.sh releases            # see what is there
./deploy.sh rollback            # previous good release
./deploy.sh rollback 20261002-140512-ab12cd3
```

`rollback` repoints `current` and restarts pm2; nothing is rebuilt. To return
to the newer release, roll "back" to it by name.

A release keeps the env it was built with. If that differs from the env file
now (prod: the main repo's `.env.local`, preprod: `.env.preprod`), `rollback`
warns with the key names (`env differs: KEY1, KEY2`, never values) and goes
ahead. To run the rolled-back code with the current env, follow it with
`rebuild`.

## Going back to in-place deploys

If the release layout ever has to go:

```bash
cd /home/debian/apps/dance-hub
# Restore the old scripts (the parent of the commit that added deploy/lib.sh):
OLD=$(git log --format=%H --diff-filter=A -- deploy/lib.sh | tail -1)^
git checkout "$OLD" -- deploy.sh deploy-preprod.sh stripe-mode.sh
# The main repo's build is stale; rebuild it in place, then serve from it.
bun install --frozen-lockfile && bun run build
pm2 delete dance-hub
pm2 start /home/debian/apps/dance-hub/node_modules/next/dist/bin/next --name dance-hub \
  --cwd /home/debian/apps/dance-hub --interpreter node -- start -p 3007
pm2 save
```

For preprod, recreate the worktree if you removed it
(`git worktree add /home/debian/apps/dance-hub-preprod --detach`) and run the
old `./deploy-preprod.sh restart <branch>`. Remove the release directories
with `git worktree remove --force <dir>` (not `rm -rf`, which leaves stale
worktree entries; `git worktree prune` cleans those up).

## Testing the scripts from another worktree

`DEPLOY_MAIN_REPO` points the scripts at the main repo (for the env files and
git) while running a copy from elsewhere, for example a review worktree:

```bash
DEPLOY_MAIN_REPO=/home/debian/apps/dance-hub \
  /home/debian/apps/dance-hub-review-fixes/deploy-preprod.sh restart fix/review-2026-10
```

The branch must be pushed: preprod builds `origin/<branch>`.
`DEPLOY_RELEASES_ROOT`, `DEPLOY_KEEP_RELEASES` and `DEPLOY_PORT_CHECK_TIMEOUT`
exist for tests.
