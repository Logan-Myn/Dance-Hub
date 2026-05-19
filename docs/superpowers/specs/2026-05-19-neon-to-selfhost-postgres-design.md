# Migrate Postgres from Neon to self-hosted on app server

**Date:** 2026-05-19
**Status:** Approved by Logan, ready for implementation plan
**Triggered by:** Neon free-tier compute quota exhaustion (quota reset 2026-06-01) bringing prod + preprod down with `Your account or project has exceeded the compute time quota`. Root cause was `suspend_timeout_seconds: 0` keeping the Neon compute hot 24/7 across two branches.

## Goals

1. Eliminate dependency on Neon as a recurring cost and single point of quota-failure.
2. Move both prod and preprod to the native PostgreSQL 17 cluster already running on this server (localhost, port 5432).
3. Preserve every byte of production data (97 users, 10 communities, 198 fee_changes, 204 sessions, etc. — see `rowcounts-pre-20260519-073735.txt`).
4. Set up a nightly backup pipeline to Backblaze B2 from day one — no period where we have data on local disk only.
5. Keep prod available throughout the migration; accept a single planned ~90-second downtime window at cutover.

## Non-goals

- PgBouncer / connection pooling — current connection counts (~20/env) are far under PG's `max_connections=100`.
- Postgres tuning — defaults are fine for a 12 MB DB.
- Postgres monitoring (Prometheus exporter, etc.) — separate work; the server already has `pentagi-pgexporter` as a reference pattern when wanted.
- Schema changes, refactors, or any non-migration work — strictly out of scope.
- Public-facing access to Postgres — local-only, same as today's default.

## Architecture

```
Server: this server (localhost only, no public exposure)

┌─ Native PostgreSQL 17 (systemd: postgresql@17-main) ────────┐
│  Listen 127.0.0.1:5432                                      │
│                                                             │
│  Roles:                                                     │
│   - dance_hub_app     (LOGIN, app role, password-auth)      │
│                                                             │
│  Databases (owner: dance_hub_app):                          │
│   - dance_hub          ← prod data                          │
│   - dance_hub_preprod  ← preprod data                       │
└─────────────────────────────────────────────────────────────┘

┌─ pm2: dance-hub ─────────────┐  ┌─ pm2: dance-hub-preprod ────┐
│ cwd: /home/debian/apps/      │  │ cwd: /home/debian/apps/     │
│      dance-hub               │  │      dance-hub-preprod      │
│ DATABASE_URL=                │  │ DATABASE_URL=               │
│   postgresql://dance_hub_app │  │   postgresql://dance_hub_app│
│   :PWD@127.0.0.1:5432/       │  │   :PWD@127.0.0.1:5432/      │
│   dance_hub                  │  │   dance_hub_preprod         │
└──────────────────────────────┘  └─────────────────────────────┘

┌─ cron (03:00 daily, MAILTO=logan.moyon15@gmail.com) ──────┐
│  /home/debian/scripts/backup-dance-hub.sh                 │
│    pg_dump --format=custom both DBs                       │
│    write to /home/debian/backups/dance-hub/               │
│    upload to s3://<B2_BUCKET>/dance-hub-db/<db>/          │
│    local retention 14 days, B2 retention 30 days          │
│    log to /home/debian/backups/dance-hub/backup.log       │
└───────────────────────────────────────────────────────────┘
```

- One Postgres cluster, two databases — separation by database name (not schema) so a misconfigured connection string cannot accidentally read or write the wrong env.
- Single application role owns both databases; environments are distinguished by the database segment of the connection string.
- Better-auth's `pg.Pool` (already in use, see `lib/auth-server.ts`) and `lib/db.ts`'s `postgres` package (new dep) coexist with separate pools per process. ~10 connections each = ~20 per pm2 process = ~40 total across prod + preprod.

## Files affected

### Source-controlled changes

| File | Change |
|---|---|
| `package.json` + `bun.lock` | Add `postgres` (Porsager) dependency |
| `lib/db.ts` | Import swap: `neon` → `postgres`. Callsite API is byte-identical for our tagged-template usage; types unchanged. |
| `scripts/migration/migrate-users-to-better-auth.ts` | Same import swap (one-off historical script) |
| `__tests__/utils/test-db.ts` | Same import swap |

### Files explicitly NOT changing

| File | Why |
|---|---|
| `lib/auth-server.ts` | Already uses `new Pool({connectionString: process.env.DATABASE_URL})` from `pg` — works against any Postgres unmodified |
| All callsites of `sql\`...\`` across the codebase | `postgres` package exposes the same tagged-template signature as `neon()` |
| All 32 tables and their schema | Restored verbatim from Neon's `pg_dump` |
| `lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-session.ts` | No DB driver references |

### Environment files (NOT in git, edited manually)

| File | Change |
|---|---|
| `/home/debian/apps/dance-hub/.env.local` | `DATABASE_URL=postgresql://dance_hub_app:PWD@127.0.0.1:5432/dance_hub` |
| `/home/debian/apps/dance-hub-preprod/.env.preprod` | `DATABASE_URL=postgresql://dance_hub_app:PWD@127.0.0.1:5432/dance_hub_preprod` |

The password is generated by the operator via `openssl rand -base64 24` at provisioning time and written to both env files. It is never committed.

### New filesystem artifacts (not in git)

| Path | Purpose |
|---|---|
| `/home/debian/backups/dance-hub/` | Local dump destination + log |
| `/home/debian/scripts/backup-dance-hub.sh` | Backup script (not in app repo — server-level concern) |
| Crontab entry under `debian` user | Schedules the backup |

## Cutover sequence

Each phase has an explicit verification gate. **If any gate fails, stop, diagnose, and rollback. Do not advance.**

### Reference: the rowcount-parity query

Used in Phase 0's verification gate and Phase 4 step 4. Define once, reuse:

```sql
SELECT tablename,
       (xpath('/row/cnt/text()',
              query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I', schemaname, tablename),
                           true, true, '')))[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename;
```

Run with `psql -At -F'|'` to produce pipe-separated output suitable for `diff`.


### Phase 0 — Provision local Postgres (no user impact)

```bash
# As postgres superuser:
PWD=$(openssl rand -base64 24 | tr -d '/+=')
sudo -u postgres psql <<SQL
  CREATE ROLE dance_hub_app WITH LOGIN PASSWORD '$PWD';
  CREATE DATABASE dance_hub OWNER dance_hub_app;
  CREATE DATABASE dance_hub_preprod OWNER dance_hub_app;
SQL
echo "DATABASE_URL_PROD=postgresql://dance_hub_app:$PWD@127.0.0.1:5432/dance_hub"
echo "DATABASE_URL_PREPROD=postgresql://dance_hub_app:$PWD@127.0.0.1:5432/dance_hub_preprod"
# Save those URLs for later phases; the password is not recoverable from PG.

# Restore the existing dump into BOTH databases:
DUMP=/home/debian/backups/dance-hub/neon-20260519-073735.dump
pg_restore --no-owner --no-acl --role=dance_hub_app -d dance_hub "$DUMP"
pg_restore --no-owner --no-acl --role=dance_hub_app -d dance_hub_preprod "$DUMP"
```

**Gate:** row counts in both local DBs match `rowcounts-pre-20260519-073735.txt` exactly for all 32 tables. Use the rowcount-parity query defined above.

### Phase 1 — Code change + commit (no user impact)

```bash
cd /home/debian/apps/dance-hub
git checkout -b migrate-neon-to-selfhost
bun add postgres
# Edit lib/db.ts: replace `import { neon, NeonQueryFunction } from '@neondatabase/serverless'`
#   with `import postgres from 'postgres'`
#   and `export const sql = neon(databaseUrl)` with `export const sql = postgres(databaseUrl)`
#   adjust the exported type accordingly.
# Edit scripts/migration/migrate-users-to-better-auth.ts: same swap.
# Edit __tests__/utils/test-db.ts: same swap.
bun lint
bun test
git add -A && git commit -m "feat(db): swap @neondatabase/serverless for postgres driver"
git push origin migrate-neon-to-selfhost
```

**Gate:** `bun lint` and `bun test` both pass.

### Phase 2 — Preprod cutover (canary)

```bash
cd /home/debian/apps/dance-hub-preprod
git fetch && git checkout migrate-neon-to-selfhost
# Edit .env.preprod: set DATABASE_URL=$DATABASE_URL_PREPROD
./deploy-preprod.sh code
```

**Smoke tests on preprod URL:**

- [ ] `GET /` returns 200
- [ ] `GET /api/auth/get-session` returns 200 (anon)
- [ ] Sign up new test user with `delivered+migration@resend.dev` → email arrives → confirm link works
- [ ] Sign in an existing test user → session persists across navigation
- [ ] Open a community page (DB-heavy read path)
- [ ] Post a thread or comment → write succeeds → appears on reload
- [ ] `pm2 logs dance-hub-preprod --err --lines 50` is empty of new errors after the test run

**Soak:** observe for at least 10–20 minutes. Then gate.

**Gate:** all smoke tests pass; no errors in preprod log.

### Phase 3 — Deploy code to prod (still on Neon)

```bash
cd /home/debian/apps/dance-hub
git checkout main
git merge --ff-only migrate-neon-to-selfhost   # or open PR + merge, per workflow preference
./deploy.sh code
```

Prod's `.env.local` is unchanged; `DATABASE_URL` still points at Neon. Only the *driver* is new.

**Gate:** prod stays healthy on Neon with the new driver. `curl https://dance-hub.io/` returns 200; `curl https://dance-hub.io/api/auth/get-session` returns 200; `pm2 logs dance-hub --err --lines 50` has no new errors after 5 minutes.

This step proves the driver swap is safe *independently* of the host swap.

### Phase 4 — Prod cutover (~90 sec planned downtime)

Pre-cutover: pick a low-traffic window (early morning Estonia time). Have a terminal ready with the exact commands below pre-typed.

```bash
# Step 1 — pause traffic
pm2 stop dance-hub

# Step 2 — fresh dump from Neon (captures any writes since Phase 0)
STAMP=$(date +%Y%m%d-%H%M%S)
NEON_URL=$(grep '^DATABASE_URL=' /home/debian/apps/dance-hub/.env.local | cut -d= -f2- | tr -d '"')
pg_dump --format=custom --no-owner --no-acl "$NEON_URL" \
  -f /home/debian/backups/dance-hub/neon-cutover-${STAMP}.dump

# Step 3 — clean local prod DB and restore fresh
sudo -u postgres psql -c 'DROP DATABASE dance_hub;'
sudo -u postgres psql -c 'CREATE DATABASE dance_hub OWNER dance_hub_app;'
pg_restore --no-owner --no-acl --role=dance_hub_app -d dance_hub \
  /home/debian/backups/dance-hub/neon-cutover-${STAMP}.dump

# Step 4 — row-count parity check vs live Neon
#   Use the rowcount-parity query defined above; outputs MUST match.
psql "$NEON_URL" -At -F'|' -f /tmp/rowcount.sql > /tmp/rc-neon.txt
psql "$DATABASE_URL_PROD" -At -F'|' -f /tmp/rowcount.sql > /tmp/rc-local.txt
diff /tmp/rc-neon.txt /tmp/rc-local.txt    # MUST be empty

# Step 5 — swap env to localhost
#   $DATABASE_URL_PROD was set in Phase 0 to:
#     postgresql://dance_hub_app:<password>@127.0.0.1:5432/dance_hub
sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL_PROD|" \
  /home/debian/apps/dance-hub/.env.local

# Step 6 — restart pm2
pm2 start dance-hub

# Step 7 — smoke
curl -sk -o /dev/null -w '%{http_code}\n' https://dance-hub.io/
curl -sk -o /dev/null -w '%{http_code}\n' https://dance-hub.io/api/auth/get-session
pm2 logs dance-hub --err --lines 30
```

**Gate:** both curls return 200; no errors in the 5-min log window post-restart; one manual sign-in confirms session reads work.

### Phase 5 — Steady state + cleanup (next 48h)

1. Deploy the backup script + crontab entry (see below). Run it once manually to verify B2 upload.
2. Observe prod for 24–48h.
3. Take one final `pg_dump` from Neon, archive to B2 as `dance-hub-db/neon-final-<date>.dump` (paranoia copy).
4. Delete the Neon project entirely from the Vercel/Neon dashboard. Confirm next Vercel invoice shows zero.

## Rollback plan

| Failing phase | Action | Recovery time | Risk |
|---|---|---|---|
| Phase 0 | `DROP DATABASE dance_hub; DROP DATABASE dance_hub_preprod; DROP ROLE dance_hub_app;` Nothing else changed. | instant | none |
| Phase 1 | `git checkout` off the branch. Nothing deployed yet. | instant | none |
| Phase 2 | Revert `.env.preprod` DATABASE_URL to Neon's preprod URL, `./deploy-preprod.sh code`. Prod was never touched. | ~2 min | preprod test data may need cleanup |
| Phase 3 | `git revert` the driver-swap commit, `./deploy.sh code`. Back on Neon with old driver. | ~5 min | none — Neon is still our DB |
| Phase 4 | Revert `.env.local` DATABASE_URL to Neon, `pm2 restart dance-hub`. Keep the local `dance_hub` DB intact as evidence. | < 60 sec | writes during the 90-sec cutover window are lost (mitigation: cutover during quiet hours) |
| Phase 5 | If a problem appears after cutover and Neon has already been deleted, restore from the most recent local + B2 dump into a fresh DB. | hours | acceptable for a non-emergency rollback |

**Critical:** do not delete the Neon project until Phase 5 is at least 24h in.

## Backup design

### Script: `/home/debian/scripts/backup-dance-hub.sh`

Responsibilities:

1. For each of `dance_hub` and `dance_hub_preprod`:
   - `pg_dump --format=custom --no-owner --no-acl` → `/home/debian/backups/dance-hub/<db>-YYYYMMDD-HHMMSS.dump`
   - Upload to `s3://<B2_BUCKET>/dance-hub-db/<db>/<filename>` via `aws s3 cp` with `--endpoint-url $B2_ENDPOINT` and `AWS_ACCESS_KEY_ID=$B2_KEY_ID AWS_SECRET_ACCESS_KEY=$B2_APP_KEY` (sourced from `/home/debian/apps/dance-hub/.env.local`).
2. Local retention: `find /home/debian/backups/dance-hub -name '*.dump' -mtime +14 -delete`.
3. B2 retention: script-side `aws s3 ls`+filter+`aws s3 rm` for files older than 30 days under the `dance-hub-db/` prefix. (Alternative: a B2 lifecycle rule on the bucket; pick whichever is easier to verify at implementation time.)
4. Append to `/home/debian/backups/dance-hub/backup.log`: `ISO8601 timestamp | db | local-size | b2-size | exit-code`.
5. Exit non-zero on any sub-step failure so cron emails fire.

### Crontab (user `debian`)

```cron
MAILTO=logan.moyon15@gmail.com
0 3 * * * /home/debian/scripts/backup-dance-hub.sh
```

Cron emails fire on any non-zero exit. Local mail transport must be functional; verify with a manually-triggered failure during implementation.

### Restore procedure (documented, manual)

```bash
# From local backup file:
pg_restore --no-owner --clean --if-exists \
  --role=dance_hub_app -d dance_hub \
  /home/debian/backups/dance-hub/dance_hub-YYYYMMDD-HHMMSS.dump

# From Backblaze (if local disk is lost):
source /home/debian/apps/dance-hub/.env.local
AWS_ACCESS_KEY_ID=$B2_KEY_ID AWS_SECRET_ACCESS_KEY=$B2_APP_KEY \
  aws s3 cp s3://$B2_BUCKET_NAME/dance-hub-db/dance_hub/<file>.dump - \
  --endpoint-url $B2_ENDPOINT \
  | pg_restore --no-owner --clean --if-exists --role=dance_hub_app -d dance_hub
```

## Verification checklist (must all pass before declaring done)

- [ ] Local PG has `dance_hub` and `dance_hub_preprod` databases, owned by `dance_hub_app`
- [ ] Row counts in both databases match `rowcounts-pre-20260519-073735.txt`
- [ ] `package.json` includes `postgres` dependency
- [ ] `lib/db.ts`, `scripts/migration/migrate-users-to-better-auth.ts`, `__tests__/utils/test-db.ts` all import `postgres`, not `@neondatabase/serverless`
- [ ] `bun lint` passes, `bun test` passes
- [ ] Preprod smoke tests (Phase 2) all pass
- [ ] Prod is on the new driver, still on Neon, for at least 5 minutes without errors (Phase 3 gate)
- [ ] Prod cutover row-count diff is empty (Phase 4)
- [ ] Prod `curl /` and `curl /api/auth/get-session` return 200 post-cutover
- [ ] Backup script ran manually once, both local file and B2 object exist, log line written
- [ ] Cron entry installed, `MAILTO` set, dry-run test email fires on simulated failure
- [ ] 24h observation post-cutover: no PG-related errors in `pm2 logs dance-hub --err`
- [ ] Neon project deleted via Vercel dashboard, next Vercel invoice line item is zero

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `postgres` package's tagged-template output differs subtly from `neon()` for an edge case (e.g., array params) | Low | Phase 2 (preprod canary) exercises the dominant code paths; `bun test` catches API-level regressions. If something obscure breaks, the rollback in Phase 3 is `git revert` away. |
| Better-auth schema drift after restore (e.g., it tries to auto-add columns and conflicts) | Very low | Better-auth uses an explicit migrate command and would not silently alter a populated schema. Existing schema came from `migrate-users-to-better-auth.ts` and matches what better-auth expects. |
| Server disk fills, taking down PG | Low | 263 GB free today; 12 MB DB grows slowly; backup retention prunes old files. Monitor disk via existing server tooling. |
| Single point of failure: server dies, no HA | Acceptable | Same trade-off as the rest of the stack on this server. Daily B2 backups bound the worst-case data loss to ~24h. Out of scope to address HA in this migration. |
| B2 credentials expire / bucket misconfigured | Low | Phase 5 verifies first upload manually. Cron mail alerts on any subsequent failure. |
| Cutover write loss (Phase 4) | Low | Cutover scheduled in low-traffic window. 90-sec window. Realistic estimate: 0–3 inserts. If non-zero, can be reconciled via post-hoc query against the cutover dump. |

## Out of scope

- PgBouncer or any connection pooler.
- Postgres tuning beyond defaults.
- Postgres metrics / Prometheus exporter.
- Automated backup verification (test restore to scratch DB) — recommended as a follow-up.
- Multi-region / HA Postgres.
- Schema migrations, refactors, deprecations.
- Touching any of the Daily.co → LiveKit migration follow-up work referenced in CLAUDE.md.
