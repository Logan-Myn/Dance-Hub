#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dance-hub-preprod"
APP_PORT=3009
DOMAIN="preprod.dance-hub.io"
BRANCH="${2:-main}"

# Main repo (canonical source of .env.preprod, where you edit it).
MAIN_REPO="$(cd "$(dirname "$0")" && pwd)"
# Dedicated worktree where preprod is built and served from. Detached HEAD
# at origin/$BRANCH; this gives preprod its own cwd / .env.local / .next so it
# never fights with prod over /home/debian/apps/dance-hub/.env.local.
PREPROD_DIR="/home/debian/apps/dance-hub-preprod"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

require_preprod_dir() {
  if [ ! -d "$PREPROD_DIR/.git" ] && [ ! -f "$PREPROD_DIR/.git" ]; then
    echo "ERROR: $PREPROD_DIR is not a git worktree. Create it with:"
    echo "  cd $MAIN_REPO && git worktree add $PREPROD_DIR --detach"
    exit 1
  fi
}

sync_preprod_code() {
  cd "$PREPROD_DIR"
  echo "==> Fetching origin..."
  git fetch origin
  echo "==> Checking out origin/$BRANCH (detached)..."
  git checkout --detach "origin/$BRANCH"
}

sync_preprod_env() {
  echo "==> Syncing preprod env from main repo..."
  cp "$MAIN_REPO/.env.preprod" "$PREPROD_DIR/.env.local"
}

build_preprod() {
  cd "$PREPROD_DIR"
  echo "==> Installing dependencies..."
  bun install
  echo "==> Building..."
  bun run build
}

start_pm2() {
  echo "==> (Re)starting PM2 $APP_NAME from $PREPROD_DIR..."
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 start "npx" --name "$APP_NAME" --cwd "$PREPROD_DIR" -- next start -p "$APP_PORT"
  pm2 save
}

cmd_deploy() {
  require_preprod_dir
  sync_preprod_code
  sync_preprod_env
  build_preprod

  echo "==> Updating Nginx..."
  write_nginx_config
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
  sudo nginx -t && sudo nginx -s reload

  start_pm2

  echo ""
  echo "Done! Preprod running at https://$DOMAIN (port $APP_PORT)"
  pm2 status
}

cmd_restart() {
  require_preprod_dir
  sync_preprod_code
  sync_preprod_env
  build_preprod
  start_pm2
  echo "Done! Preprod restarted."
}

cmd_stop() {
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 save
  echo "Preprod stopped."
}

write_nginx_config() {
  sudo tee "$NGINX_CONF" > /dev/null <<NGINX
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
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
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
  deploy)  cmd_deploy ;;
  restart) cmd_restart ;;
  stop)    cmd_stop ;;
  *)
    echo "Usage: ./deploy-preprod.sh [deploy|restart|stop] [branch]"
    echo ""
    echo "  deploy  [branch]  — Full setup: nginx + pm2 + build in $PREPROD_DIR (default: main)"
    echo "  restart [branch]  — Pull latest, rebuild, restart pm2 in $PREPROD_DIR (default: main)"
    echo "  stop              — Stop preprod process"
    echo ""
    echo "Preprod runs from $PREPROD_DIR (detached HEAD), separate from prod cwd."
    echo "Edit the canonical preprod env at $MAIN_REPO/.env.preprod — the script syncs it on each run."
    exit 1
    ;;
esac
