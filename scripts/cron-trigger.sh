#!/usr/bin/env bash
#
# Wrapper for hitting internal Dance-Hub cron endpoints from system crontab.
#
# Lives between system cron and the Next.js app so that all curl format
# strings (which contain `%`) are evaluated in bash, never in crontab. In
# crontab, an unescaped `%` is converted to a newline and everything after
# it is fed as stdin — silently breaking commands like `-w "%{http_code}"`.
#
# Usage (from crontab):
#   */5 * * * * /home/debian/apps/dance-hub/scripts/cron-trigger.sh /api/cron/live-class-reminders http://localhost:3007
#
# Reads CRON_SECRET from the worktree's .env.local. Logs HTTP code + response
# body to logs/cron.log inside the worktree.

set -euo pipefail

ENDPOINT="${1:?Usage: $0 <endpoint-path> [base-url] [host-header]}"
BASE_URL="${2:-http://localhost:3007}"
HOST_HEADER="${3:-dance-hub.io}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/.env.local"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/cron.log"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

if [ ! -f "$ENV_FILE" ]; then
  log "ERROR $ENDPOINT: env file not found at $ENV_FILE"
  exit 1
fi

CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$CRON_SECRET" ]; then
  log "ERROR $ENDPOINT: CRON_SECRET missing from $ENV_FILE"
  exit 1
fi

RESPONSE=$(curl -s -w $'\n%{http_code}' \
  --max-time 60 \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Host: $HOST_HEADER" \
  "$BASE_URL$ENDPOINT" 2>&1) || {
  log "ERROR $ENDPOINT: curl failed exit=$?"
  exit 1
}

HTTP_CODE=$(printf '%s' "$RESPONSE" | tail -n1)
BODY=$(printf '%s' "$RESPONSE" | sed '$d' | tr '\n' ' ')

log "$ENDPOINT -> HTTP $HTTP_CODE: $BODY"

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  exit 1
fi
