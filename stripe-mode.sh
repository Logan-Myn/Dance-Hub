#!/bin/bash
set -euo pipefail

MODE="${1:-}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$MODE" != "test" && "$MODE" != "live" ]]; then
  cat <<EOF
Usage: $0 {test|live}

Switches preprod between Stripe test and live keys, restarts pm2.

  test  - sk_test_/pk_test_ keys (safe, no real money)
  live  - sk_live_/pk_live_ keys (real money, real webhooks)

Current active mode:
EOF
  if grep -q '^STRIPE_SECRET_KEY="sk_test_' "$DIR/.env.local" 2>/dev/null; then
    echo "  TEST"
  elif grep -q '^STRIPE_SECRET_KEY="sk_live_' "$DIR/.env.local" 2>/dev/null; then
    echo "  LIVE"
  else
    echo "  unknown (no STRIPE_SECRET_KEY in .env.local)"
  fi
  exit 1
fi

SRC="$DIR/.env.preprod.$MODE"
if [[ ! -f "$SRC" ]]; then
  echo "Error: $SRC not found"
  exit 1
fi

# pm2 wrapper does `cp .env.preprod .env.local` on every (re)start,
# so .env.preprod is the source-of-truth — write there.
cp "$SRC" "$DIR/.env.preprod"
echo "Switched preprod env to Stripe $MODE mode."

echo "Restarting pm2 dance-hub-preprod..."
pm2 restart dance-hub-preprod --update-env

echo
echo "Active Stripe key in .env.local (after pm2 wrapper copy):"
sleep 1
grep -E "^STRIPE_SECRET_KEY=" "$DIR/.env.local" | head -c 35; echo "..."
