# Neon → Self-Host Postgres Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Operator note:** This plan touches production. Phases 5 (preprod cutover), 6 (deploy code to prod), and 7 (prod cutover) require an operator at the keyboard. Phase 7 is a single contiguous downtime window — do not interrupt it.

**Goal:** Migrate prod and preprod Postgres from Neon (Vercel-integrated, hit quota) to the native PG17 cluster already running on this server, with zero data loss and ~90 seconds of planned prod downtime.

**Architecture:** Single native PG17 cluster on `127.0.0.1:5432` hosts two databases (`dance_hub`, `dance_hub_preprod`) owned by a single `dance_hub_app` role. Application code swaps from `@neondatabase/serverless` (HTTP) to `postgres` (native protocol); `better-auth` keeps using its existing `pg.Pool`. Nightly `pg_dump` cron pushes to Backblaze B2 alongside existing image storage.

**Tech Stack:** PostgreSQL 17 (Debian package, systemd), `postgres` npm package (Porsager), `pg` (already installed, for better-auth), Bun for build, pm2 for process supervision, Backblaze B2 via aws-cli (S3-compatible), Debian crontab for scheduling.

**Spec:** `docs/superpowers/specs/2026-05-19-neon-to-selfhost-postgres-design.md`

**Pre-existing artifact this plan depends on:**
- `/home/debian/backups/dance-hub/neon-20260519-073735.dump` — the initial 12 MB Neon dump (already taken, checksum-verified)
- `/home/debian/backups/dance-hub/rowcounts-pre-20260519-073735.txt` — baseline row counts for verification

---

## Task 1: Provision local Postgres role and databases

**Files:**
- No source files changed. Operates on the running `postgresql@17-main` systemd service.

- [ ] **Step 1: Generate a strong password and capture both connection strings**

Run as the operator (any shell, no sudo needed yet):

```bash
PWD=$(openssl rand -base64 24 | tr -d '/+=')
echo "DATABASE_URL_PROD=postgresql://dance_hub_app:${PWD}@127.0.0.1:5432/dance_hub"
echo "DATABASE_URL_PREPROD=postgresql://dance_hub_app:${PWD}@127.0.0.1:5432/dance_hub_preprod"
```

Copy both URLs into a scratch file (e.g. `/tmp/dance-hub-db-urls.txt`, mode 600). They are needed in Tasks 2, 5, and 7. The password cannot be recovered from Postgres later.

- [ ] **Step 2: Create role and databases**

```bash
sudo -u postgres psql <<SQL
  CREATE ROLE dance_hub_app WITH LOGIN PASSWORD '${PWD}';
  CREATE DATABASE dance_hub OWNER dance_hub_app;
  CREATE DATABASE dance_hub_preprod OWNER dance_hub_app;
SQL
```

Expected output: three `CREATE ROLE` / `CREATE DATABASE` lines, no errors.

- [ ] **Step 3: Verify connection works with the new credentials**

```bash
PGPASSWORD=$PWD psql -h 127.0.0.1 -U dance_hub_app -d dance_hub -c 'SELECT current_database(), current_user, version();'
PGPASSWORD=$PWD psql -h 127.0.0.1 -U dance_hub_app -d dance_hub_preprod -c 'SELECT current_database(), current_user;'
```

Expected: both queries return one row each. `current_database()` matches the requested DB, `current_user` is `dance_hub_app`, `version()` shows PostgreSQL 17.

- [ ] **Step 4: Commit nothing**

This task changes only the running Postgres cluster, not source-controlled files. No commit.

---

## Task 2: Restore initial dump into both databases

**Files:**
- No source files changed. Restores `/home/debian/backups/dance-hub/neon-20260519-073735.dump` into both local DBs.

- [ ] **Step 1: Restore into `dance_hub`**

```bash
pg_restore --no-owner --no-acl --role=dance_hub_app \
  -h 127.0.0.1 -U dance_hub_app \
  -d dance_hub \
  /home/debian/backups/dance-hub/neon-20260519-073735.dump
```

You will be prompted for password (or set `PGPASSWORD=$PWD` from Task 1 in the shell). Expected: a stream of `CREATE TABLE`, `COPY`, `ALTER TABLE`, `CREATE INDEX` lines, exiting 0.

- [ ] **Step 2: Restore into `dance_hub_preprod`**

```bash
pg_restore --no-owner --no-acl --role=dance_hub_app \
  -h 127.0.0.1 -U dance_hub_app \
  -d dance_hub_preprod \
  /home/debian/backups/dance-hub/neon-20260519-073735.dump
```

Same expected output as Step 1.

- [ ] **Step 3: Save the rowcount-parity query to a file**

```bash
cat > /tmp/rowcount.sql <<'SQL'
SELECT tablename,
       (xpath('/row/cnt/text()',
              query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I', schemaname, tablename),
                           true, true, '')))[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename;
SQL
```

This file is reused in Task 7.

- [ ] **Step 4: Verify row counts match the baseline (gate)**

```bash
PGPASSWORD=$PWD psql -h 127.0.0.1 -U dance_hub_app -d dance_hub -At -F'|' -f /tmp/rowcount.sql > /tmp/rc-local-prod.txt
PGPASSWORD=$PWD psql -h 127.0.0.1 -U dance_hub_app -d dance_hub_preprod -At -F'|' -f /tmp/rowcount.sql > /tmp/rc-local-preprod.txt
diff /home/debian/backups/dance-hub/rowcounts-pre-20260519-073735.txt /tmp/rc-local-prod.txt
diff /home/debian/backups/dance-hub/rowcounts-pre-20260519-073735.txt /tmp/rc-local-preprod.txt
```

Expected: both `diff` commands produce **zero output** (files are identical). Any difference is a HARD STOP — investigate before proceeding.

- [ ] **Step 5: Commit nothing**

Restore is local DB state, not source-controlled.

---

## Task 3: Add `postgres` dependency

**Files:**
- Modify: `package.json`, `bun.lock`

- [ ] **Step 1: Create a feature branch**

```bash
cd /home/debian/apps/dance-hub
git checkout main && git pull
git checkout -b migrate-neon-to-selfhost
```

- [ ] **Step 2: Add the dependency**

```bash
bun add postgres
```

Expected: `package.json` gets a new entry `"postgres": "^3.x.x"` under `dependencies`, `bun.lock` updates.

- [ ] **Step 3: Confirm the dep landed**

```bash
grep '"postgres"' package.json
```

Expected: one line showing `"postgres": "^3.x.x"`.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: add postgres driver for self-hosted PG migration"
```

---

## Task 4: Swap driver in `lib/db.ts`

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Verify nothing imports `NeonQueryFunction` outside `lib/db.ts`**

```bash
grep -rn 'NeonQueryFunction' --include='*.ts' --include='*.tsx' . | grep -v node_modules
```

Expected: one match, in `lib/db.ts` itself. If there are external imports, they need updating too — flag and stop.

- [ ] **Step 2: Rewrite `lib/db.ts`**

Replace the entire file contents with:

```ts
import postgres, { type Sql } from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql: Sql = postgres(databaseUrl);

/**
 * Execute a typed SQL query using tagged template literals
 * @example
 * const users = await query<User>`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export async function query<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return sql(strings as unknown as TemplateStringsArray, ...values) as unknown as Promise<T[]>;
}

/**
 * Execute a typed SQL query expecting a single result
 * Returns the first row or null if no results
 * @example
 * const user = await queryOne<User>`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export async function queryOne<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const results = (await sql(strings as unknown as TemplateStringsArray, ...values)) as unknown as T[];
  return results[0] ?? null;
}

/**
 * Execute a typed SQL query expecting exactly one result
 * Throws an error if no results found
 * @example
 * const user = await queryFirst<User>`SELECT * FROM profiles WHERE id = ${userId}`;
 */
export async function queryFirst<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const results = (await sql(strings as unknown as TemplateStringsArray, ...values)) as unknown as T[];
  if (results.length === 0) {
    throw new Error('Query returned no results');
  }
  return results[0];
}
```

The cast through `unknown` is necessary because the `postgres` package's tagged-template signature is generic and the callsite's `T` is opaque. Behavior is identical to the prior `neon()` implementation.

- [ ] **Step 3: Run typecheck and lint**

```bash
bun lint
```

Expected: zero errors related to `lib/db.ts`. (Pre-existing lint warnings elsewhere are fine; you should not introduce new ones in this file.)

- [ ] **Step 4: Run the test suite**

```bash
bun test
```

Expected: all tests pass. Tests that connect to a real DB (e.g. `__tests__/api/auth-database.test.ts`) may still depend on Neon — that's expected; we fix the test-side driver in Task 5. For now they may skip or pass via the existing Neon connection because `DATABASE_URL` in the dev shell still points at Neon.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat(db): swap @neondatabase/serverless for postgres driver in lib/db.ts"
```

---

## Task 5: Swap driver in test utilities and historical migration script

**Files:**
- Modify: `__tests__/utils/test-db.ts`
- Modify: `scripts/migration/migrate-users-to-better-auth.ts`

- [ ] **Step 1: Read the current `__tests__/utils/test-db.ts`**

```bash
cat __tests__/utils/test-db.ts
```

Identify lines using `neon()`. There is one call to `neon(databaseUrl)` at line 24.

- [ ] **Step 2: Edit `__tests__/utils/test-db.ts`**

Replace the import line:

```ts
// before:
import { neon } from '@neondatabase/serverless';
// after:
import postgres from 'postgres';
```

Replace the construction:

```ts
// before:
export const testSql = neon(databaseUrl);
// after:
export const testSql = postgres(databaseUrl);
```

If there is a type annotation like `NeonQueryFunction<...>` on the export, change it to `Sql` from `postgres` (and update the import accordingly: `import postgres, { type Sql } from 'postgres'`).

- [ ] **Step 3: Edit `scripts/migration/migrate-users-to-better-auth.ts`**

Same swap pattern: change `import { neon } from '@neondatabase/serverless'` to `import postgres from 'postgres'`, and `const sql = neon(DATABASE_URL)` to `const sql = postgres(DATABASE_URL)`. This is a historical one-off script; the swap is purely so the file still type-checks and lints.

- [ ] **Step 4: Verify no remaining Neon imports**

```bash
grep -rn '@neondatabase/serverless' --include='*.ts' --include='*.tsx' . | grep -v node_modules
```

Expected: zero matches.

- [ ] **Step 5: Run typecheck, lint, and tests**

```bash
bun lint && bun test
```

Expected: all green. If a test calls `testSql` against a Neon URL and Neon connection works (still upgraded), the test passes via the new driver hitting Neon. If a test specifically depends on Neon HTTP semantics (none should, but check), flag and stop.

- [ ] **Step 6: Commit**

```bash
git add __tests__/utils/test-db.ts scripts/migration/migrate-users-to-better-auth.ts
git commit -m "feat(db): swap Neon driver in test utils and historical migration script"
```

- [ ] **Step 7: Push the branch**

```bash
git push -u origin migrate-neon-to-selfhost
```

---

## Task 6: Preprod cutover (canary)

**Files:**
- Modify (in preprod worktree, not main repo): `/home/debian/apps/dance-hub-preprod/.env.preprod`

**Operator note:** Preprod runs from a detached-HEAD worktree at `/home/debian/apps/dance-hub-preprod` per project memory. Use `deploy-preprod.sh` from that worktree, not the main repo.

- [ ] **Step 1: Check out the migration branch in the preprod worktree**

```bash
cd /home/debian/apps/dance-hub-preprod
git fetch origin
git checkout migrate-neon-to-selfhost
git pull origin migrate-neon-to-selfhost
```

- [ ] **Step 2: Back up the current preprod env, then point it at local PG**

```bash
cp /home/debian/apps/dance-hub-preprod/.env.preprod /home/debian/apps/dance-hub-preprod/.env.preprod.neon.bak
# Use $DATABASE_URL_PREPROD captured in Task 1
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL_PREPROD}|" /home/debian/apps/dance-hub-preprod/.env.preprod
grep '^DATABASE_URL=' /home/debian/apps/dance-hub-preprod/.env.preprod
```

Expected: the grep shows the localhost URL.

- [ ] **Step 3: Deploy preprod**

```bash
cd /home/debian/apps/dance-hub-preprod
./deploy-preprod.sh code
```

Expected: build succeeds, pm2 restarts `dance-hub-preprod`, process is `online` in `pm2 list`.

- [ ] **Step 4: Smoke-test preprod via HTTP**

Replace `<PREPROD_URL>` with the actual preprod URL (e.g. `https://preprod.dance-hub.io` — confirm with operator).

```bash
curl -sk -o /dev/null -w 'home=%{http_code} time=%{time_total}s\n' <PREPROD_URL>/
curl -sk -o /dev/null -w 'session=%{http_code} time=%{time_total}s\n' <PREPROD_URL>/api/auth/get-session
```

Expected: both return `200`.

- [ ] **Step 5: Manual smoke test (operator)**

Operator must perform in a browser pointed at the preprod URL:

- [ ] Sign up a new user using email `delivered+migration@resend.dev` (Resend test address that simulates delivery). Verification email should arrive.
- [ ] Click verification link → land on dashboard.
- [ ] Sign out, sign back in → session persists.
- [ ] Browse to a community page that has data (e.g. a community listing).
- [ ] Post a thread or comment → reload, verify it shows.

- [ ] **Step 6: Check preprod logs are clean (gate)**

```bash
pm2 logs dance-hub-preprod --err --lines 100 --nostream
```

Expected: no errors mentioning `connect`, `ECONNREFUSED`, `Better Auth`, `findSession`, or `INTERNAL_SERVER_ERROR` since restart.

- [ ] **Step 7: Soak (gate)**

Let preprod run for at least 15 minutes under whatever ambient traffic it sees. Re-run Step 6. Still clean? Proceed. Any new errors? **STOP and investigate.**

- [ ] **Step 8: Commit nothing**

Preprod `.env.preprod` is intentionally not in git.

---

## Task 7: Deploy code to prod (still on Neon)

**Files:**
- Merge `migrate-neon-to-selfhost` → `main` and deploy via `./deploy.sh code`.

**Operator note:** This step deploys the new driver to prod but **keeps prod on Neon** (env unchanged). This isolates the driver change from the host change so failures are diagnosable.

- [ ] **Step 1: Merge the branch to main**

```bash
cd /home/debian/apps/dance-hub
git checkout main
git pull
git merge --ff-only migrate-neon-to-selfhost
```

If fast-forward isn't possible (someone landed work on main), rebase the feature branch on main first and re-run.

- [ ] **Step 2: Push main**

```bash
git push origin main
```

- [ ] **Step 3: Deploy to prod**

```bash
./deploy.sh code
```

Expected: build succeeds, pm2 restarts `dance-hub`, process is `online`.

- [ ] **Step 4: Smoke-test prod (still on Neon)**

```bash
curl -sk -o /dev/null -w 'home=%{http_code} time=%{time_total}s\n' https://dance-hub.io/
curl -sk -o /dev/null -w 'session=%{http_code} time=%{time_total}s\n' https://dance-hub.io/api/auth/get-session
```

Expected: both `200`.

- [ ] **Step 5: Watch logs for 5 minutes (gate)**

```bash
pm2 logs dance-hub --err --lines 50 --nostream
# wait 5 minutes, re-run
```

Expected: no new errors related to the driver. Any DB errors here mean the driver is broken even against Neon — STOP, `git revert`, redeploy.

- [ ] **Step 6: Commit nothing further**

The merge commit on main is the artifact.

---

## Task 8: Prod cutover (the planned downtime window)

**Files:**
- Modify: `/home/debian/apps/dance-hub/.env.local` (in-place)

**Operator note:** This is the only user-facing-impact phase. Pick a low-traffic window (early morning Estonia time). Have all the commands below pre-typed in a terminal before starting. Target: <2 minutes of downtime.

- [ ] **Step 1: Stop pm2 to pause writes**

```bash
pm2 stop dance-hub
```

The site begins returning 502 / connection-refused. Downtime clock starts.

- [ ] **Step 2: Fresh dump from Neon**

```bash
STAMP=$(date -u +%Y%m%d-%H%M%S)
NEON_URL=$(grep '^DATABASE_URL=' /home/debian/apps/dance-hub/.env.local | cut -d= -f2- | tr -d '"')
pg_dump --format=custom --no-owner --no-acl "$NEON_URL" \
  -f /home/debian/backups/dance-hub/neon-cutover-${STAMP}.dump
ls -la /home/debian/backups/dance-hub/neon-cutover-${STAMP}.dump
```

Expected: file exists, size in the hundreds of KB range (matches the initial dump's order of magnitude).

- [ ] **Step 3: Drop and recreate local prod DB**

```bash
sudo -u postgres psql -c 'DROP DATABASE dance_hub;'
sudo -u postgres psql -c 'CREATE DATABASE dance_hub OWNER dance_hub_app;'
```

Expected: `DROP DATABASE` then `CREATE DATABASE`, no errors.

- [ ] **Step 4: Restore the fresh dump**

```bash
PGPASSWORD=$PWD pg_restore --no-owner --no-acl --role=dance_hub_app \
  -h 127.0.0.1 -U dance_hub_app -d dance_hub \
  /home/debian/backups/dance-hub/neon-cutover-${STAMP}.dump
```

Expected: stream of `CREATE TABLE` / `COPY` / `CREATE INDEX`, exit 0.

- [ ] **Step 5: Row-count parity check (gate)**

```bash
psql "$NEON_URL" -At -F'|' -f /tmp/rowcount.sql > /tmp/rc-neon-cutover.txt
PGPASSWORD=$PWD psql -h 127.0.0.1 -U dance_hub_app -d dance_hub -At -F'|' -f /tmp/rowcount.sql > /tmp/rc-local-cutover.txt
diff /tmp/rc-neon-cutover.txt /tmp/rc-local-cutover.txt
```

Expected: **empty diff**. Any difference: STOP, do not swap env. Either re-dump (someone wrote between Step 2 and now) or investigate.

- [ ] **Step 6: Swap env to localhost**

```bash
cp /home/debian/apps/dance-hub/.env.local /home/debian/apps/dance-hub/.env.local.neon.bak
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL_PROD}|" /home/debian/apps/dance-hub/.env.local
grep '^DATABASE_URL=' /home/debian/apps/dance-hub/.env.local
```

Expected: grep shows the localhost URL.

- [ ] **Step 7: Restart pm2**

```bash
pm2 start dance-hub
```

Downtime clock stops.

- [ ] **Step 8: Smoke test (gate)**

```bash
curl -sk -o /dev/null -w 'home=%{http_code} time=%{time_total}s\n' https://dance-hub.io/
curl -sk -o /dev/null -w 'session=%{http_code} time=%{time_total}s\n' https://dance-hub.io/api/auth/get-session
pm2 logs dance-hub --err --lines 30 --nostream
```

Expected: both `200`, log has no new errors.

- [ ] **Step 9: Manual sign-in test (operator)**

Sign in to https://dance-hub.io with an existing test account. Session must work, DB writes (last-seen, etc.) must succeed.

- [ ] **Step 10: Watch for 10 more minutes**

Re-run Step 8 every 2-3 minutes. Any error appearing within 10 minutes is grounds for rollback (Step 11).

- [ ] **Step 11: Rollback (only if Steps 8/9/10 fail)**

```bash
cp /home/debian/apps/dance-hub/.env.local.neon.bak /home/debian/apps/dance-hub/.env.local
pm2 restart dance-hub
```

Site returns to Neon. The local `dance_hub` database is left intact as evidence.

- [ ] **Step 12: Commit nothing**

`.env.local` is not in git.

---

## Task 9: Implement nightly backup script

**Files:**
- Create: `/home/debian/scripts/backup-dance-hub.sh` (mode 750)

**Operator note:** This script lives outside the app repo because it's a server-level concern that references env files from multiple worktrees.

- [ ] **Step 1: Verify the aws CLI is available**

```bash
which aws && aws --version
```

If missing, install: `sudo apt-get install -y awscli`. Expected: `aws-cli/2.x` or `aws-cli/1.x`.

- [ ] **Step 2: Create the script directory if needed**

```bash
mkdir -p /home/debian/scripts
```

- [ ] **Step 3: Write the backup script**

Create `/home/debian/scripts/backup-dance-hub.sh` with this exact content:

```bash
#!/usr/bin/env bash
# Nightly backup of dance-hub prod + preprod Postgres databases.
# - dumps to /home/debian/backups/dance-hub/
# - uploads to Backblaze B2 under dance-hub-db/<db>/
# - local retention: 14 days; B2 retention: 30 days
# - logs each step; non-zero exit triggers cron MAILTO alert.

set -euo pipefail

BACKUP_DIR=/home/debian/backups/dance-hub
LOG="$BACKUP_DIR/backup.log"
STAMP=$(date -u +%Y%m%d-%H%M%S)
LOCAL_RETENTION_DAYS=14
B2_RETENTION_DAYS=30

PROD_ENV=/home/debian/apps/dance-hub/.env.local
PREPROD_ENV=/home/debian/apps/dance-hub-preprod/.env.preprod

mkdir -p "$BACKUP_DIR"

log() { printf '%s | %s\n' "$(date -u --iso-8601=seconds)" "$*" | tee -a "$LOG" >&2; }

trap 'log "FAILED at line $LINENO"; exit 1' ERR

# Source B2 creds from prod env (shared bucket)
# shellcheck disable=SC1090
set -a; . "$PROD_ENV"; set +a

PROD_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV" | head -1 | cut -d= -f2- | tr -d '"')
PREPROD_URL=$(grep -E '^DATABASE_URL=' "$PREPROD_ENV" | head -1 | cut -d= -f2- | tr -d '"')

backup_one() {
  local label=$1 url=$2
  local file="$BACKUP_DIR/${label}-${STAMP}.dump"
  log "$label | starting dump"
  pg_dump --format=custom --no-owner --no-acl -d "$url" -f "$file"
  local size; size=$(stat -c %s "$file")
  log "$label | dump complete | $file | ${size} bytes"

  log "$label | uploading to B2"
  AWS_ACCESS_KEY_ID=$B2_KEY_ID \
  AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
  aws s3 cp "$file" "s3://${B2_BUCKET_NAME}/dance-hub-db/${label}/" \
    --endpoint-url "$B2_ENDPOINT" --region "$B2_REGION"
  log "$label | upload complete"
}

backup_one dance_hub         "$PROD_URL"
backup_one dance_hub_preprod "$PREPROD_URL"

# Local retention
log "local retention | pruning >${LOCAL_RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -name '*.dump' -mtime +"$LOCAL_RETENTION_DAYS" -print -delete | while read -r f; do
  log "local retention | deleted $f"
done

# B2 retention
log "b2 retention | pruning >${B2_RETENTION_DAYS} days"
cutoff_epoch=$(date -d "${B2_RETENTION_DAYS} days ago" +%s)
AWS_ACCESS_KEY_ID=$B2_KEY_ID \
AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
aws s3 ls --recursive "s3://${B2_BUCKET_NAME}/dance-hub-db/" \
  --endpoint-url "$B2_ENDPOINT" --region "$B2_REGION" \
| awk '{ print $1" "$2" "$4 }' \
| while read -r d t key; do
    obj_epoch=$(date -d "$d $t" +%s)
    if (( obj_epoch < cutoff_epoch )); then
      AWS_ACCESS_KEY_ID=$B2_KEY_ID \
      AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
      aws s3 rm "s3://${B2_BUCKET_NAME}/${key}" \
        --endpoint-url "$B2_ENDPOINT" --region "$B2_REGION" >/dev/null
      log "b2 retention | deleted ${key}"
    fi
  done

log "run complete"
```

- [ ] **Step 4: Make the script executable**

```bash
chmod 750 /home/debian/scripts/backup-dance-hub.sh
```

- [ ] **Step 5: Run the script manually as a dry-run**

```bash
/home/debian/scripts/backup-dance-hub.sh
```

Expected: log lines printed to stderr, exit 0. Two new `.dump` files in `/home/debian/backups/dance-hub/`. Two new objects in B2 under `dance-hub-db/dance_hub/` and `dance-hub-db/dance_hub_preprod/`.

- [ ] **Step 6: Verify the B2 uploads**

```bash
set -a; . /home/debian/apps/dance-hub/.env.local; set +a
AWS_ACCESS_KEY_ID=$B2_KEY_ID AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
  aws s3 ls --recursive "s3://${B2_BUCKET_NAME}/dance-hub-db/" \
  --endpoint-url "$B2_ENDPOINT" --region "$B2_REGION"
```

Expected: two new objects with today's UTC timestamp.

- [ ] **Step 7: Commit nothing**

Script lives outside the app repo intentionally.

---

## Task 10: Install cron job with failure alerts

**Files:**
- Modify: `debian` user crontab (`crontab -e`)

- [ ] **Step 1: Inspect the current crontab**

```bash
crontab -l
```

Note any existing `MAILTO=` line. We'll add ours non-destructively.

- [ ] **Step 2: Add the schedule and alert**

Run `crontab -e` and append (do not remove existing entries):

```cron
# dance-hub Postgres backup — alerts to Logan on any non-zero exit
MAILTO=logan.moyon15@gmail.com
0 3 * * * /home/debian/scripts/backup-dance-hub.sh
```

If `MAILTO=` is already set elsewhere in the crontab for a different recipient, place this `MAILTO=` immediately above the dance-hub line so it applies only from that point forward.

- [ ] **Step 3: Confirm the entry**

```bash
crontab -l | grep -A1 backup-dance-hub
```

Expected: the two lines added above are shown.

- [ ] **Step 4: Verify the local mail transport works**

```bash
echo "test from dance-hub backup wiring" | mail -s "[dance-hub] cron mail test" logan.moyon15@gmail.com
```

Operator: check the inbox (and spam folder). If mail does not arrive within ~5 min, the server's outbound mail is broken; fix that separately (e.g. install `postfix` / `msmtp`) before relying on cron alerts.

- [ ] **Step 5: Simulate a failure to verify the alert path**

Temporarily break the script:

```bash
sudo sed -i.bak 's|set -euo pipefail|set -euo pipefail\nexit 1  # TEMP test|' /home/debian/scripts/backup-dance-hub.sh
# trigger an immediate cron-like run as the debian user:
/home/debian/scripts/backup-dance-hub.sh >/tmp/cronlike.out 2>&1; echo "exit=$?"
# undo:
sudo mv /home/debian/scripts/backup-dance-hub.sh.bak /home/debian/scripts/backup-dance-hub.sh
```

Expected: `exit=1`. (Cron itself will send the email on its next scheduled run if the script exits non-zero; this manual check just confirms the script *can* exit non-zero. The MAILTO behavior is wired by cron's standard contract.)

- [ ] **Step 6: Commit nothing**

Crontab is per-user state, not source-controlled.

---

## Task 11: 24–48h observation period

**Files:** None.

- [ ] **Step 1: Set a calendar reminder for 24h after Task 8 completed**

Operator: put a reminder on your phone/calendar. This task gates Task 12 (Neon deletion).

- [ ] **Step 2: Periodic spot-checks during observation**

Every few hours:

```bash
pm2 logs dance-hub --err --lines 50 --nostream | grep -E '(ERROR|FAILED|connect|ECONNREFUSED)' | tail -20
psql "$DATABASE_URL_PROD" -c "SELECT count(*) FROM \"user\";"
```

Expected: no new errors, user count stays ≥97 (and may grow as new signups happen).

- [ ] **Step 3: Verify backup ran successfully the first scheduled night**

```bash
ls -lt /home/debian/backups/dance-hub/ | head -5
tail -20 /home/debian/backups/dance-hub/backup.log
```

Expected: a new `dance_hub-*.dump` from ~03:00 UTC. Log shows `run complete`. No `FAILED` line.

- [ ] **Step 4: Verify B2 has the same fresh upload**

```bash
set -a; . /home/debian/apps/dance-hub/.env.local; set +a
AWS_ACCESS_KEY_ID=$B2_KEY_ID AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
  aws s3 ls --recursive "s3://${B2_BUCKET_NAME}/dance-hub-db/dance_hub/" \
  --endpoint-url "$B2_ENDPOINT" --region "$B2_REGION" | tail -5
```

Expected: a dump file dated today's UTC date.

- [ ] **Step 5: Gate before Task 12**

If everything above is green for 24h (48h preferred), proceed to Task 12. Any unresolved error: stay in observation; do not delete Neon yet.

---

## Task 12: Delete the Neon project

**Files:** None in this repo. Action via Vercel/Neon dashboard.

**Operator note:** This is irreversible. Confirm Task 11 gates are all green first.

- [ ] **Step 1: Take a final paranoia dump from Neon**

```bash
NEON_URL=$(cat /home/debian/apps/dance-hub/.env.local.neon.bak | grep '^DATABASE_URL=' | cut -d= -f2- | tr -d '"')
STAMP=$(date -u +%Y%m%d)
pg_dump --format=custom --no-owner --no-acl "$NEON_URL" \
  -f /home/debian/backups/dance-hub/neon-final-${STAMP}.dump

set -a; . /home/debian/apps/dance-hub/.env.local; set +a
AWS_ACCESS_KEY_ID=$B2_KEY_ID AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
  aws s3 cp /home/debian/backups/dance-hub/neon-final-${STAMP}.dump \
  "s3://${B2_BUCKET_NAME}/dance-hub-db/neon-final/" \
  --endpoint-url "$B2_ENDPOINT" --region "$B2_REGION"
```

Expected: dump file exists locally and in B2 under `dance-hub-db/neon-final/`.

- [ ] **Step 2: Delete the Neon project via Vercel dashboard**

Operator action (no command):

1. Open Vercel → Storage → Neon integration
2. Select the `dance-hub` project (Neon project id `wild-art-53938668`)
3. Use the delete-project action
4. Confirm the deletion explicitly

- [ ] **Step 3: Verify deletion**

```bash
# This should now fail (project gone):
psql "$NEON_URL" -c 'SELECT 1' 2>&1 | tail -3
```

Expected: connection error indicating the project no longer exists.

- [ ] **Step 4: Confirm zero billing on next Vercel invoice**

Operator: check the next Vercel billing email for $0 on the Neon line. If non-zero, investigate (may be a prorated final charge from the migration period — acceptable if small).

- [ ] **Step 5: Clean up the backup files of stale env**

```bash
# After confirming everything is stable for a few more days, you can remove:
rm /home/debian/apps/dance-hub/.env.local.neon.bak
rm /home/debian/apps/dance-hub-preprod/.env.preprod.neon.bak
```

These backups exist as safety nets during the observation period; removing after confirms commitment to the new state.

- [ ] **Step 6: Commit nothing**

---

## Self-Review

Performed inline before saving:

**Spec coverage:** Every phase 0–5 in the spec maps to one or more tasks above:
- Spec Phase 0 → Tasks 1, 2
- Spec Phase 1 → Tasks 3, 4, 5
- Spec Phase 2 → Task 6
- Spec Phase 3 → Task 7
- Spec Phase 4 → Task 8
- Spec Phase 5 → Tasks 9, 10, 11, 12

Spec's backup design → Task 9. Spec's cron alert → Task 10. Spec's verification checklist items are distributed across the task-level gates. Spec's risk register and rollback table are referenced but not re-implemented (operator reads them in spec).

**Placeholder scan:** No `TBD`/`TODO`/`implement X` strings. Every code step has full code. Every command has expected output where applicable. The only string substitution is `<PREPROD_URL>` in Task 6 which is explicitly called out as operator-supplied.

**Type consistency:** `lib/db.ts` and `__tests__/utils/test-db.ts` both import `postgres` and `type Sql` from the same package and apply identical signatures. The `query<T>`, `queryOne<T>`, `queryFirst<T>` signatures in Task 4 are preserved byte-for-byte from the original.

**Operator-vs-agent boundary:** Tasks 1, 6, 8, 10, 11, 12 explicitly call out operator-only steps. Tasks 2–5 and 9 are mostly automatable.
