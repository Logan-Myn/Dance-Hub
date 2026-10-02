# shellcheck shell=bash
#
# Shared by deploy.sh (prod) and deploy-preprod.sh, so that a
# preprod deploy runs exactly the code a prod deploy will run.
#
# Every deploy is built in its own release directory, and the live app is
# only switched to it once the build has succeeded:
#
#   $RELEASES_ROOT/<app>/<UTC yyyymmdd-hhmmss>-<short sha>/   a git worktree of one commit
#   $RELEASES_ROOT/<app>/current -> <release>                 what pm2 serves
#
# A failed build never touches the running release. The last $KEEP_RELEASES
# good releases are kept for `rollback`.
#
# The caller sets APP_NAME, APP_PORT, MAIN_REPO (the main git checkout) and
# ENV_SOURCE (the env file copied into each release as .env.local), then
# calls init_releases. See deploy/README.md.

RELEASES_ROOT="${DEPLOY_RELEASES_ROOT:-/home/debian/apps/releases}"
KEEP_RELEASES="${DEPLOY_KEEP_RELEASES:-3}"
# How long to wait for the new server to take the port.
PORT_CHECK_TIMEOUT="${DEPLOY_PORT_CHECK_TIMEOUT:-30}"

say() { echo "==> $*"; }
die() { echo "!! $*" >&2; exit 1; }

init_releases() {
  : "${APP_NAME:?APP_NAME not set}" "${APP_PORT:?APP_PORT not set}" "${MAIN_REPO:?MAIN_REPO not set}"
  RELEASES_DIR="$RELEASES_ROOT/$APP_NAME"
  CURRENT_LINK="$RELEASES_DIR/current"
  # A copy of this script inside a release would treat that release as the
  # main repo (wrong env file, wrong git checkout).
  case "$MAIN_REPO/" in
    "$RELEASES_ROOT"/*) die "Run this from the main repo, not from a release ($MAIN_REPO)." ;;
  esac
}

# One deploy at a time per app. The lock is released when the script exits.
lock_releases() {
  mkdir -p "$RELEASES_DIR"
  exec 9>"$RELEASES_DIR/.deploy.lock"
  flock -n 9 || die "Another deploy of $APP_NAME is running."
}

# pm2 may start its daemon, which must not inherit the lock (fd 9) and hold
# it for as long as the daemon lives.
pm2() { command pm2 "$@" 9>&-; }

# --- releases -----------------------------------------------------------

# Release directories, oldest first (names start with a UTC timestamp).
list_release_dirs() {
  local d
  for d in "$RELEASES_DIR"/[0-9]*; do
    if [[ -d "$d" && ! -L "$d" ]]; then echo "$d"; fi
  done | LC_ALL=C sort
}

release_ok() { [[ -f "$1/.release-ok" ]]; }

release_info() { sed -n "s/^$2=//p" "$1/.release-info" 2>/dev/null | tail -n 1; }

# Absolute path of the release `current` points at (empty if none).
current_release() {
  [[ -L "$CURRENT_LINK" ]] || return 0
  local target
  target=$(readlink "$CURRENT_LINK")
  [[ "$target" == /* ]] || target="$RELEASES_DIR/$target"
  echo "$target"
}

resolve_commit() {
  git -C "$MAIN_REPO" rev-parse --verify --quiet "$1^{commit}" \
    || die "Cannot resolve '$1' to a commit."
}

remove_release() {
  local dir="$1"
  case "$dir" in
    "$RELEASES_DIR"/[0-9]*) ;;
    *) die "Refusing to remove '$dir': not a release of $APP_NAME." ;;
  esac
  git -C "$MAIN_REPO" worktree remove --force "$dir" 2>/dev/null || rm -rf -- "$dir"
  git -C "$MAIN_REPO" worktree prune
}

# Build commit $1 (described as $2, e.g. origin/main) into a new release and
# set BUILT_RELEASE to its path. On failure the half-built directory is
# removed and the function returns non-zero; nothing live is touched.
build_release() {
  local sha="$1" ref="$2" dir
  BUILT_RELEASE=""
  [[ -f "$ENV_SOURCE" ]] || die "Env file $ENV_SOURCE not found."
  mkdir -p "$RELEASES_DIR"
  dir="$RELEASES_DIR/$(date -u +%Y%m%d-%H%M%S)-${sha:0:7}"
  say "Creating release $(basename "$dir") from $ref (${sha:0:7})..."
  git -C "$MAIN_REPO" worktree add --detach "$dir" "$sha" > /dev/null || return 1
  # Explicit && chain: errexit does not apply inside a function called from `if`.
  if ! (
    cd "$dir" &&
      install -m 600 "$ENV_SOURCE" .env.local &&
      say "Installing dependencies..." &&
      bun install --frozen-lockfile &&
      say "Building..." &&
      bun run build
  ); then
    echo "!! Build failed. The running release was not touched." >&2
    remove_release "$dir"
    return 1
  fi
  printf 'commit=%s\nref=%s\nbuilt_at=%s\nenv_source=%s\n' \
    "$sha" "$ref" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ENV_SOURCE" > "$dir/.release-info"
  touch "$dir/.release-ok"
  BUILT_RELEASE="$dir"
}

# Point `current` at release $1. ln + mv -T replaces the link atomically.
activate_release() {
  local tmp="$RELEASES_DIR/.current.tmp"
  ln -sfn "$(basename "$1")" "$tmp"
  mv -Tf "$tmp" "$CURRENT_LINK"
  say "current -> $(basename "$1")"
}

# Keep `current` plus the newest KEEP_RELEASES-1 other good releases.
# Unfinished builds (no .release-ok) are always removed.
prune_releases() {
  local cur kept=0 d
  cur=$(current_release)
  while IFS= read -r d; do
    [[ "$d" == "$cur" ]] && continue
    if release_ok "$d" && ((kept < KEEP_RELEASES - 1)); then
      kept=$((kept + 1))
      continue
    fi
    say "Removing old release $(basename "$d")..."
    remove_release "$d"
  done < <(list_release_dirs | LC_ALL=C sort -r)
}

list_releases() {
  local cur d mark status
  cur=$(current_release)
  while IFS= read -r d; do
    mark=" "
    [[ "$d" == "$cur" ]] && mark="*"
    status="ok"
    release_ok "$d" || status="unfinished"
    printf '%s %-24s %-10s %-28s %s\n' "$mark" "$(basename "$d")" "$status" \
      "$(release_info "$d" ref)" "$(release_info "$d" built_at)"
  done < <(list_release_dirs | LC_ALL=C sort -r)
}

# --- pm2 ----------------------------------------------------------------

port_holder_pid() {
  ss -ltnp 2> /dev/null | grep ":$APP_PORT " | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2 || true
}

# Fail loudly unless PM2's own process holds the port and serves from
# release $1. An orphaned server left over from an earlier start would keep
# serving old code while PM2 crash-loops on EADDRINUSE.
check_port_owner() {
  local expected holder managed cwd waited=0
  expected=$(readlink -f "$1")
  while :; do
    sleep 2
    waited=$((waited + 2))
    holder=$(port_holder_pid)
    managed=$(pm2 pid "$APP_NAME" 2> /dev/null || true)
    [[ -n "$holder" && "$holder" == "$managed" ]] && break
    if ((waited >= PORT_CHECK_TIMEOUT)); then
      echo "!! Port $APP_PORT is held by pid '${holder:-none}', PM2 runs '${managed:-none}'."
      echo "!! An orphaned server may still be serving old code. Kill it, then rerun."
      echo "!! To go back to the previous release: $(basename "$0") rollback"
      exit 1
    fi
  done
  cwd=$(readlink -f "/proc/$holder/cwd" 2> /dev/null || true)
  if [[ "$cwd" != "$expected" ]]; then
    echo "!! Port $APP_PORT is served from '${cwd:-unknown}', expected '$expected'."
    exit 1
  fi
  say "Port $APP_PORT served by PM2 pid $managed from $(basename "$expected")."
}

# Run the Next.js server directly under PM2. Starting it through `npm start`
# or `npx next` left the real server orphaned when the wrapper exited: PM2
# then crash-looped on EADDRINUSE while the orphan kept serving with a dead
# stdout/stderr, and froze at 100% CPU on its first logged error.
# PM2 is pointed at the `current` symlink, so `pm2 resurrect` after a reboot
# starts whatever release is current.
start_current() {
  say "(Re)starting PM2 $APP_NAME from $CURRENT_LINK..."
  pm2 delete "$APP_NAME" 2> /dev/null || true
  pm2 start "$CURRENT_LINK/node_modules/next/dist/bin/next" --name "$APP_NAME" \
    --cwd "$CURRENT_LINK" --interpreter node -- start -p "$APP_PORT"
  pm2 save
  check_port_owner "$CURRENT_LINK"
}

# Switch the live app to release $1, then drop old releases.
switch_to_release() {
  local previous
  previous=$(current_release)
  activate_release "$1"
  start_current
  prune_releases
  if [[ -n "$previous" && "$previous" != "$1" ]]; then
    say "Previous release: $(basename "$previous") (go back with: $(basename "$0") rollback)"
  fi
}

deploy_commit() {
  build_release "$1" "$2" || exit 1
  switch_to_release "$BUILT_RELEASE"
}

# Rebuild the live commit with the current env file (after an env change;
# NEXT_PUBLIC_* values are compiled into the browser bundle).
rebuild_current() {
  local cur sha ref
  cur=$(current_release)
  [[ -n "$cur" ]] || die "No current release of $APP_NAME to rebuild."
  sha=$(release_info "$cur" commit)
  ref=$(release_info "$cur" ref)
  [[ -n "$sha" ]] || die "$(basename "$cur") has no recorded commit."
  deploy_commit "$sha" "${ref:-$sha}"
}

# Go back to release $1, or to the newest good release before current.
rollback_release() {
  local cur target="" d
  local -a dirs
  cur=$(current_release)
  if [[ -n "${1:-}" ]]; then
    target="$RELEASES_DIR/$(basename "$1")"
    if [[ "$(basename "$1")" != [0-9]* || -L "$target" || ! -d "$target" ]]; then
      die "No release $(basename "$1") in $RELEASES_DIR."
    fi
  else
    mapfile -t dirs < <(list_release_dirs)
    local i start=$((${#dirs[@]} - 1))
    for ((i = 0; i < ${#dirs[@]}; i++)); do
      [[ "${dirs[i]}" == "$cur" ]] && start=$((i - 1))
    done
    for ((i = start; i >= 0; i--)); do
      d="${dirs[i]}"
      if [[ "$d" != "$cur" ]] && release_ok "$d"; then
        target="$d"
        break
      fi
    done
    [[ -n "$target" ]] || die "No earlier release of $APP_NAME to roll back to."
  fi
  release_ok "$target" || die "$(basename "$target") never finished building."
  [[ "$target" != "$cur" ]] || die "$(basename "$target") is already current."
  say "Switching $APP_NAME to $(basename "$target") ($(release_info "$target" ref))..."
  activate_release "$target"
  start_current
}

# --- nginx --------------------------------------------------------------

# Write vhost $1 with content $2, enable it, and reload nginx. If the new
# config fails `nginx -t`, the previous file is put back.
install_nginx_vhost() {
  local conf="$1" content="$2" backup=""
  if [[ -f "$conf" ]]; then
    backup=$(mktemp)
    cat "$conf" > "$backup"
  fi
  printf '%s\n' "$content" | sudo tee "$conf" > /dev/null
  sudo ln -sf "$conf" /etc/nginx/sites-enabled/
  if ! sudo nginx -t; then
    if [[ -n "$backup" ]]; then
      sudo cp "$backup" "$conf"
      rm -f "$backup"
      die "nginx -t failed. Restored the previous $conf."
    fi
    sudo rm -f "$conf" "/etc/nginx/sites-enabled/$(basename "$conf")"
    die "nginx -t failed. Removed the new $conf."
  fi
  rm -f "$backup"
  sudo nginx -s reload
}
