#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dance-hub-preprod"
APP_PORT=3009
DOMAIN="preprod.dance-hub.io"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Main repo: git source for releases, and home of the canonical preprod env
# (.env.preprod, where you edit it). Each release gets a copy as .env.local,
# so preprod never touches prod's /home/debian/apps/dance-hub/.env.local.
MAIN_REPO="${DEPLOY_MAIN_REPO:-$SCRIPT_DIR}"
ENV_SOURCE="$MAIN_REPO/.env.preprod"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/deploy/lib.sh"
init_releases

# Build origin/$1 (fetched fresh) into a new release; sets BUILT_RELEASE.
build_branch() {
  local branch="$1" sha
  echo "==> Fetching origin..."
  git -C "$MAIN_REPO" fetch origin
  sha=$(resolve_commit "origin/$branch")
  build_release "$sha" "origin/$branch" || exit 1
}

cmd_deploy() {
  lock_releases
  build_branch "$1"

  echo "==> Updating Nginx..."
  install_nginx_vhost "$NGINX_CONF" "$(render_nginx_config)"

  switch_to_release "$BUILT_RELEASE"

  echo ""
  echo "Done! Preprod running at https://$DOMAIN (port $APP_PORT)"
  pm2 status
}

cmd_restart() {
  lock_releases
  build_branch "$1"
  switch_to_release "$BUILT_RELEASE"
  echo "Done! Preprod restarted."
}

cmd_rebuild() {
  lock_releases
  rebuild_current
  echo "Done! Preprod rebuilt with the current $ENV_SOURCE."
}

cmd_rollback() {
  lock_releases
  rollback_release "${1:-}"
  echo "Done! Preprod rolled back."
}

cmd_stop() {
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 save
  echo "Preprod stopped."
}

# Preprod is not behind Cloudflare, so $remote_addr is already the visitor.
render_nginx_config() {
  cat <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Audio language tracks upload through the app server; allow a generous body size.
    client_max_body_size 100m;

    location /_next/static {
        proxy_pass http://localhost:$APP_PORT;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        # Both carry only the address nginx saw. Never append to a
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
  deploy)       cmd_deploy "${2:-main}" ;;
  restart)      cmd_restart "${2:-main}" ;;
  rebuild)      cmd_rebuild ;;
  rollback)     cmd_rollback "${2:-}" ;;
  releases)     list_releases ;;
  stop)         cmd_stop ;;
  nginx-config) render_nginx_config ;;
  *)
    echo "Usage: ./deploy-preprod.sh [deploy|restart|rebuild|rollback|releases|stop|nginx-config] [branch|release]"
    echo ""
    echo "  deploy  [branch]    Full setup: build origin/<branch> (default: main), nginx, pm2"
    echo "  restart [branch]    Build origin/<branch> (default: main) and switch to it"
    echo "  rebuild             Rebuild the live commit with the current .env.preprod"
    echo "  rollback [release]  Switch back to the previous release (or the one named)"
    echo "  releases            List releases (* = live)"
    echo "  stop                Stop preprod process"
    echo "  nginx-config        Print the nginx vhost 'deploy' would write"
    echo ""
    echo "Releases live in $RELEASES_DIR; pm2 serves $CURRENT_LINK."
    echo "Edit the canonical preprod env at $ENV_SOURCE; each build copies it in."
    exit 1
    ;;
esac
