#!/usr/bin/env bash
#
# Switches PREPROD between Stripe test and live keys. Prod is never touched.
#
# The canonical preprod env is $MAIN_REPO/.env.preprod; deploy-preprod.sh
# copies it into each preprod release as .env.local. This script replaces
# the Stripe lines of .env.preprod with those of .env.preprod.<mode> (every
# other line, e.g. DATABASE_URL, stays as it is), then rebuilds the preprod
# commit that is live now. A restart alone is not enough: the publishable
# key is compiled into the browser bundle at build time.
set -euo pipefail

MODE="${1:-}"
APP_NAME="dance-hub-preprod"
APP_PORT=3009
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_REPO="${DEPLOY_MAIN_REPO:-$SCRIPT_DIR}"
ENV_SOURCE="$MAIN_REPO/.env.preprod"
# Where the .env.preprod.test / .live files lived before preprod moved to
# release directories. Still read if they have not been moved yet.
LEGACY_PREPROD_DIR="/home/debian/apps/dance-hub-preprod"

# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/deploy/lib.sh"
init_releases

mode_file() {
  local dir
  for dir in "$MAIN_REPO" "$LEGACY_PREPROD_DIR"; do
    if [[ -f "$dir/.env.preprod.$1" ]]; then
      echo "$dir/.env.preprod.$1"
      return 0
    fi
  done
  return 1
}

# Which publishable key the running browser bundle was built with.
bundle_mode() {
  local live=0 test=0
  grep -rqs 'pk_live_' "$1/.next/static" && live=1
  grep -rqs 'pk_test_' "$1/.next/static" && test=1
  if ((live && !test)); then echo "pk_live"
  elif ((test && !live)); then echo "pk_test"
  else echo "unknown"
  fi
}

show_status() {
  local pid cwd
  echo "  $ENV_SOURCE (used by the next build): $(stripe_key_mode "$ENV_SOURCE")"
  pid=$(port_holder_pid)
  if [[ -z "$pid" ]]; then
    echo "  running preprod: nothing listens on port $APP_PORT"
    return 0
  fi
  cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
  echo "  running preprod (pid $pid, $cwd):"
  echo "    server key:     $(stripe_key_mode "$cwd/.env.local")"
  echo "    browser bundle: $(bundle_mode "$cwd")"
}

if [[ "$MODE" != "test" && "$MODE" != "live" ]]; then
  cat <<EOF
Usage: $0 {test|live}

Switches preprod between Stripe test and live keys, then rebuilds preprod.

  test  - sk_test_/pk_test_ keys (safe, no real money)
  live  - sk_live_/pk_live_ keys (real money, real webhooks)

Current mode:
EOF
  show_status
  exit 1
fi

SRC=$(mode_file "$MODE") || die "No .env.preprod.$MODE in $MAIN_REPO or $LEGACY_PREPROD_DIR."
[[ -f "$ENV_SOURCE" ]] || die "$ENV_SOURCE not found."
src_mode=$(stripe_key_mode "$SRC")
[[ "$src_mode" == "sk_$MODE" || "$src_mode" == "rk_$MODE" ]] \
  || die "$SRC holds a '$src_mode' key, not a $MODE key. Nothing changed."

cp -p "$ENV_SOURCE" "$ENV_SOURCE.bak.stripe-mode"
stripe_env_merge "$SRC" "$ENV_SOURCE"
echo "Switched $ENV_SOURCE to Stripe $MODE mode ($(stripe_key_mode "$ENV_SOURCE")); backup in $ENV_SOURCE.bak.stripe-mode."

if [[ -n "$(current_release)" ]]; then
  "$SCRIPT_DIR/deploy-preprod.sh" rebuild
else
  echo "Preprod has no release yet. Build one with: ./deploy-preprod.sh restart <branch>"
fi

echo
echo "Stripe mode now:"
show_status
