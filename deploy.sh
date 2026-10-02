#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dance-hub"
APP_PORT=3007
DOMAIN="dance-hub.io"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# The main checkout: deploys pull here, and its .env.local is THE prod env.
# Each release gets a copy of it; this file is never modified.
MAIN_REPO="${DEPLOY_MAIN_REPO:-$SCRIPT_DIR}"
ENV_SOURCE="$MAIN_REPO/.env.local"
# Overridable for tests only.
NGINX_CONF="${DEPLOY_NGINX_CONF:-/etc/nginx/sites-available/$DOMAIN}"
CLOUDFLARE_SNIPPET="/etc/nginx/snippets/cloudflare-real-ip.conf"

# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/deploy/lib.sh"
init_releases

# `git pull origin main`, but only on a clean main checkout, and never a
# merge: a diverged main stops the deploy instead.
pull_main() {
  local branch
  branch=$(git -C "$MAIN_REPO" symbolic-ref --quiet --short HEAD || true)
  [[ "$branch" == "main" ]] || die "$MAIN_REPO is on '${branch:-a detached HEAD}', not main."
  if ! git -C "$MAIN_REPO" diff --quiet || ! git -C "$MAIN_REPO" diff --cached --quiet; then
    die "$MAIN_REPO has uncommitted changes to tracked files. Commit or stash them first."
  fi
  say "Pulling latest code..."
  git -C "$MAIN_REPO" pull --ff-only origin main
}

# The app takes the client IP only from X-Real-IP. Behind Cloudflare that is
# the visitor only once the live vhost has the real-IP include, so that
# nginx change has to be live before the app is deployed
# (deploy/nginx/README.md).
require_nginx_real_ip() {
  if [[ "${SKIP_NGINX_CHECK:-}" == "1" ]]; then
    echo "!! SKIP_NGINX_CHECK=1: not checking $NGINX_CONF for the Cloudflare real-IP include."
    return 0
  fi
  # shellcheck disable=SC2016 # the second pattern matches a literal $variable
  if ! grep -qE "^[[:space:]]*include[[:space:]]+$CLOUDFLARE_SNIPPET;" "$NGINX_CONF" 2> /dev/null \
    || grep -qE '^[[:space:]]*proxy_set_header[[:space:]]+X-Forwarded-For[[:space:]]+\$proxy_add_x_forwarded_for' "$NGINX_CONF" 2> /dev/null; then
    echo "!! $NGINX_CONF does not have the Cloudflare real-IP setup yet"
    echo "!! (include $CLOUDFLARE_SNIPPET; and X-Forwarded-For \$remote_addr)."
    echo "!! Without it the app sees Cloudflare's address instead of the visitor's."
    echo "!! Apply deploy/nginx/README.md first, or rerun with SKIP_NGINX_CHECK=1."
    exit 1
  fi
}

cmd_full() {
  local sha
  lock_releases
  sha=$(resolve_commit HEAD)
  build_release "$sha" "main" || exit 1

  echo "==> Configuring Nginx..."
  sudo install -m 644 "$MAIN_REPO/deploy/nginx/cloudflare-real-ip.conf" "$CLOUDFLARE_SNIPPET"
  install_nginx_vhost "$NGINX_CONF" "$(render_nginx_config)"
  require_nginx_real_ip

  switch_to_release "$BUILT_RELEASE"

  echo ""
  echo "Done! App running on port $APP_PORT behind Nginx."
  pm2 status
}

# Prod uses Cloudflare origin certificates (see render_nginx_config), not
# certbot. Kept for a setup without Cloudflare in front.
cmd_ssl() {
  echo "==> Requesting SSL certificates..."
  sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN"
  sudo nginx -s reload
  echo "Done! HTTPS enabled."
}

cmd_code() {
  local before sha
  require_nginx_real_ip
  if [[ -z "${DEPLOY_PULLED:-}" ]]; then
    before=$(git -C "$MAIN_REPO" rev-parse HEAD)
    pull_main
    # If the pull changed the deploy scripts, run the new version.
    if ! git -C "$MAIN_REPO" diff --quiet "$before" HEAD -- deploy.sh deploy/; then
      say "Deploy scripts changed; continuing with the new version..."
      DEPLOY_PULLED=1 exec "$MAIN_REPO/deploy.sh" code
    fi
  fi

  lock_releases
  sha=$(resolve_commit HEAD)
  deploy_commit "$sha" "main"

  echo ""
  echo "Done! Redeployed."
  pm2 status
}

cmd_rebuild() {
  require_nginx_real_ip
  lock_releases
  rebuild_current
  echo "Done! Rebuilt with the current $ENV_SOURCE."
}

cmd_rollback() {
  lock_releases
  rollback_release "${1:-}"
  echo "Done! Rolled back."
}

render_nginx_config() {
  cat <<NGINX
# Redirect HTTP to HTTPS and www to bare domain
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://$DOMAIN\$request_uri;
}

# Redirect www HTTPS to bare domain
server {
    listen 443 ssl;
    server_name www.$DOMAIN;

    ssl_certificate /etc/ssl/cloudflare/$DOMAIN.pem;
    ssl_certificate_key /etc/ssl/cloudflare/$DOMAIN.key;

    return 301 https://$DOMAIN\$request_uri;
}

# Main server block
server {
    listen 443 ssl;
    server_name $DOMAIN;
    # Uploads go through the app server (images, documents, audio tracks).
    client_max_body_size 100m;

    ssl_certificate /etc/ssl/cloudflare/$DOMAIN.pem;
    ssl_certificate_key /etc/ssl/cloudflare/$DOMAIN.key;

    # The site is behind Cloudflare: take the visitor IP from
    # CF-Connecting-IP, only for connections from Cloudflare's ranges.
    include $CLOUDFLARE_SNIPPET;

    location /_next/static {
        proxy_pass http://localhost:$APP_PORT;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        # Both carry only the address nginx trusts. Never append to a
        # client-sent X-Forwarded-For: its first entry is client-controlled.
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX
}

case "${1:-}" in
  full) cmd_full ;;
  ssl) cmd_ssl ;;
  code) cmd_code ;;
  rebuild) cmd_rebuild ;;
  rollback) cmd_rollback "${2:-}" ;;
  releases) list_releases ;;
  nginx-config) render_nginx_config ;;
  *)
    echo "Usage: ./deploy.sh [full|ssl|code|rebuild|rollback [release]|releases|nginx-config]"
    echo ""
    echo "  full          First-time setup: build a release, nginx, pm2"
    echo "  ssl           Request certificates with Certbot (prod uses Cloudflare origin certs)"
    echo "  code          Pull main, build a new release, switch to it if the build succeeds"
    echo "  rebuild       Rebuild the live commit with the current .env.local"
    echo "  rollback      Switch back to the previous release (or the one named)"
    echo "  releases      List releases (* = live)"
    echo "  nginx-config  Print the nginx vhost 'full' would write"
    echo ""
    echo "Releases live in $RELEASES_DIR; pm2 serves $CURRENT_LINK."
    echo "The prod env is $ENV_SOURCE, copied into each release. See deploy/README.md."
    exit 1
    ;;
esac
