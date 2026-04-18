#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dance-hub-preprod"
APP_PORT=3009
DOMAIN="preprod.dance-hub.io"
BRANCH="${2:-main}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

cd "$PROJECT_DIR"

cmd_deploy() {
  echo "==> Checking out branch $BRANCH..."
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"

  echo "==> Copying preprod env..."
  cp .env.preprod .env.local

  echo "==> Installing dependencies..."
  bun install

  echo "==> Building..."
  bun run build

  echo "==> Restoring production env..."
  git checkout main -- .env.local 2>/dev/null || true

  echo "==> Updating Nginx..."
  write_nginx_config
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
  sudo nginx -t && sudo nginx -s reload

  echo "==> Starting preprod with PM2..."
  pm2 delete "$APP_NAME" 2>/dev/null || true
  ENV_FILE="$PROJECT_DIR/.env.preprod" pm2 start bash --name "$APP_NAME" -- -c "
    cd $PROJECT_DIR && \
    git checkout $BRANCH 2>/dev/null && \
    cp .env.preprod .env.local && \
    npx next start -p $APP_PORT
  "
  pm2 save

  echo ""
  echo "Done! Preprod running at https://$DOMAIN (port $APP_PORT)"
  pm2 status
}

cmd_restart() {
  echo "==> Pulling latest..."
  git fetch origin
  git stash 2>/dev/null || true
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
  git stash pop 2>/dev/null || true

  echo "==> Copying preprod env..."
  cp .env.preprod .env.local

  echo "==> Installing & building..."
  bun install
  bun run build

  echo "==> Restarting PM2..."
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 start bash --name "$APP_NAME" -- -c "
    cd $PROJECT_DIR && \
    cp .env.preprod .env.local && \
    npx next start -p $APP_PORT
  "
  pm2 save

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
    echo "  deploy  [branch]  — Full setup: checkout branch, build, nginx, pm2 (default: main)"
    echo "  restart [branch]  — Pull latest, rebuild, restart pm2 (default: main)"
    echo "  stop              — Stop preprod process"
    exit 1
    ;;
esac
