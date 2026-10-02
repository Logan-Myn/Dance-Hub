# nginx: real visitor IP behind Cloudflare

## Why

dance-hub.io is behind Cloudflare, so the address that connects to nginx
(`$remote_addr`) is a Cloudflare edge server, not the visitor. Two problems
followed from that:

- `X-Real-IP` (which the app uses as the client IP, see `lib/client-ip.ts`
  and better-auth's `ipAddressHeaders`) was a Cloudflare address. Rate limits
  were shared by everyone coming through the same edge.
- `X-Forwarded-For $proxy_add_x_forwarded_for` *appends* to whatever the
  client sent, so its first entry is client-controlled.

The fix:

- `cloudflare-real-ip.conf` lists Cloudflare's ranges with `set_real_ip_from`
  and sets `real_ip_header CF-Connecting-IP; real_ip_recursive off;`. For a
  connection from a Cloudflare address, nginx replaces `$remote_addr` with the
  visitor IP from `CF-Connecting-IP`. A connection from anywhere else (someone
  hitting the origin directly) keeps its own address, so a forged
  `CF-Connecting-IP` is ignored.
- `proxy_set_header X-Forwarded-For $remote_addr;` overwrites the header
  instead of appending to it.

Preprod is not behind Cloudflare, so it only gets the `X-Forwarded-For` change.

**Order: nginx first, then the app.** The new app takes the client IP only
from `X-Real-IP`, so this nginx change must be live BEFORE the app deploy
that contains it. Otherwise the app sees Cloudflare's address for every
visitor, and everyone coming through the same Cloudflare edge shares one
rate-limit bucket. The nginx change is backward compatible with the app
running now: that app reads the first `X-Forwarded-For` entry, which after
this change is the visitor IP as well (and can no longer be forged).

`./deploy.sh code` and `./deploy.sh rebuild` refuse to run until the live
vhost has the include and `X-Forwarded-For $remote_addr`. `SKIP_NGINX_CHECK=1`
overrides that, for example for an urgent fix before nginx is done.

`deploy.sh nginx-config` and `deploy-preprod.sh nginx-config` print the full
vhost the scripts would write; it matches the live files apart from these
changes and comments.

## Apply on the live server (prod, dance-hub.io)

Do this before deploying the app. Run as `debian` from the main repo after
`git pull --ff-only origin main` there (pulling alone changes nothing that
is served; the next `./deploy.sh code` does).

1. Back up the current vhost:

   ```bash
   cp /etc/nginx/sites-available/dance-hub.io ~/dance-hub.io.nginx.bak-$(date +%F)
   ```

2. Install the Cloudflare include (optionally refresh it first, see below):

   ```bash
   cd /home/debian/apps/dance-hub
   sudo install -m 644 deploy/nginx/cloudflare-real-ip.conf /etc/nginx/snippets/cloudflare-real-ip.conf
   ```

3. Edit `/etc/nginx/sites-available/dance-hub.io`
   (`sudo nano /etc/nginx/sites-available/dance-hub.io`). In the main
   `server` block (`server_name dance-hub.io;`, `listen 443 ssl;`):

   - after the `ssl_certificate_key` line, add

     ```nginx
     include /etc/nginx/snippets/cloudflare-real-ip.conf;
     ```

   - in `location /`, replace

     ```nginx
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     ```

     with

     ```nginx
     proxy_set_header X-Forwarded-For $remote_addr;
     ```

   Alternative: write the whole template and check the diff shows only those
   two changes plus comments:

   ```bash
   ./deploy.sh nginx-config | sudo tee /etc/nginx/sites-available/dance-hub.io > /dev/null
   diff ~/dance-hub.io.nginx.bak-$(date +%F) /etc/nginx/sites-available/dance-hub.io
   ```

4. Test the config: `sudo nginx -t`
5. Reload: `sudo systemctl reload nginx`

For preprod, make the same `X-Forwarded-For` change in
`/etc/nginx/sites-available/preprod.dance-hub.io` (no include), then
`sudo nginx -t && sudo systemctl reload nginx`. `./deploy-preprod.sh deploy <branch>`
also writes it.

## Verify

1. The per-site visit log (`/var/log/nginx/sites.log`, readable by the `adm`
   group) records both `$remote_addr` (`ip`) and `CF-Connecting-IP` (`cf_ip`).
   Before the change `ip` was a Cloudflare address for every dance-hub.io
   request; after it the two must match:

   ```bash
   tail -n 5000 /var/log/nginx/sites.log | grep '"host":"dance-hub.io"' | tail -n 200 \
     | jq -r '.ip == .cf_ip' | sort | uniq -c
   ```

   Expect only `true` for requests made after the reload.

2. Your own visit shows your IP. Find it with
   `curl -s https://www.cloudflare.com/cdn-cgi/trace | grep ^ip=`, load
   https://dance-hub.io, and look for that IP as `ip` in the log above. A
   spoofed header changes nothing:
   `curl -s -o /dev/null -H 'X-Forwarded-For: 1.2.3.4' https://dance-hub.io/`
   still logs your IP.

3. A forged `CF-Connecting-IP` that does not come through Cloudflare is
   ignored. On the server:

   ```bash
   curl -sk -o /dev/null --resolve dance-hub.io:443:127.0.0.1 -H 'CF-Connecting-IP: 9.9.9.9' https://dance-hub.io/
   tail -n 50 /var/log/nginx/sites.log | grep '"cf_ip":"9.9.9.9"'
   ```

   The line must show `"ip":"127.0.0.1"`, not `9.9.9.9`.

4. Optional, app side: the sign-in rate limit (3 per 10 s) now holds even
   with a changing `X-Forwarded-For`. Expect `401 401 401 429`:

   ```bash
   for i in 1 2 3 4; do
     curl -s -o /dev/null -w '%{http_code}\n' -X POST https://dance-hub.io/api/auth/sign-in/email \
       -H 'Content-Type: application/json' -H 'Origin: https://dance-hub.io' \
       -H "X-Forwarded-For: 10.0.0.$i" \
       --data '{"email":"delivered+ratelimit@resend.dev","password":"not-the-password"}'
   done
   ```

## Roll back

```bash
sudo cp ~/dance-hub.io.nginx.bak-<date> /etc/nginx/sites-available/dance-hub.io
sudo nginx -t && sudo systemctl reload nginx
```

The snippet in `/etc/nginx/snippets/` is harmless once nothing includes it;
remove it with `sudo rm /etc/nginx/snippets/cloudflare-real-ip.conf` if you
like.

## Refreshing Cloudflare's ranges

Cloudflare changes its ranges rarely and announces it in advance. To refresh:

```bash
cd /home/debian/apps/dance-hub
deploy/nginx/update-cloudflare-ips.sh          # rewrites deploy/nginx/cloudflare-real-ip.conf
git diff deploy/nginx/cloudflare-real-ip.conf
sudo install -m 644 deploy/nginx/cloudflare-real-ip.conf /etc/nginx/snippets/cloudflare-real-ip.conf
sudo nginx -t && sudo systemctl reload nginx
```

The script refuses to write anything if a list looks wrong. A missing range
fails safe: requests through it are attributed to the Cloudflare edge address,
which nobody can forge.
