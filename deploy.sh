#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dance-hub"
APP_PORT=3007
DOMAIN="dance-hub.io"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"

cd "$PROJECT_DIR"

cmd_full() {
  echo "==> Installing dependencies..."
  npm install

  echo "==> Building..."
  npm run build

  echo "==> Configuring Nginx..."
  write_nginx_config
  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
  sudo nginx -t && sudo nginx -s reload

  echo "==> Starting app with PM2..."
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 start npm --name "$APP_NAME" -- start -- -p $APP_PORT
  pm2 save

  echo ""
  echo "Done! App running on port $APP_PORT behind Nginx."
  pm2 status
}

cmd_ssl() {
  echo "==> Requesting SSL certificates..."
  sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN"
  sudo nginx -s reload
  echo "Done! HTTPS enabled."
}

cmd_code() {
  echo "==> Pulling latest code..."
  git pull origin main

  echo "==> Installing dependencies..."
  npm install

  echo "==> Building..."
  npm run build

  echo "==> Reloading app..."
  pm2 restart "$APP_NAME" 2>/dev/null || pm2 start npm --name "$APP_NAME" -- start -- -p $APP_PORT
  pm2 save

  echo ""
  echo "Done! Redeployed."
  pm2 status
}

write_nginx_config() {
  sudo tee "$NGINX_CONF" > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

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
  full) cmd_full ;;
  ssl)  cmd_ssl  ;;
  code) cmd_code ;;
  *)
    echo "Usage: ./deploy.sh [full|ssl|code]"
    echo ""
    echo "  full  — First-time setup (install, build, nginx, pm2)"
    echo "  ssl   — Request SSL certificates with Certbot"
    echo "  code  — Pull, build, and reload"
    exit 1
    ;;
esac
