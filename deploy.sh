#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TCFH News Aggregator — VPS deployment script
#
# Syncs this directory to the VPS over SSH (Ed25519) and rebuilds the Docker
# stack. The SQLite database lives in a named Docker volume, so it is never
# overwritten by rsync or by a container rebuild.
#
# Usage:
#   cp .env.example .env   # then edit ADMIN_PASSWORD and domain
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Optional overrides:
#   VPS_HOST=1.2.3.4 VPS_USER=root REMOTE_DIR=/opt/news ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
VPS_HOST="${VPS_HOST:?VPS_HOST is required (e.g. VPS_HOST=1.2.3.4 ./deploy.sh)}"
VPS_USER="${VPS_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/news}"

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PORT_VALUE="$(grep -E '^APP_PORT=' "$LOCAL_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"')"
APP_PORT_VALUE="${APP_PORT_VALUE:-3000}"
SITE_URL_VALUE="$(grep -E '^SITE_URL=' "$LOCAL_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"')"
SITE_URL_VALUE="${SITE_URL_VALUE:-${SITE_URL}}"
SITE_URL_VALUE="${SITE_URL_VALUE:-http://localhost:3000}"

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

command -v rsync >/dev/null 2>&1 || fail "rsync is not installed locally."
command -v ssh   >/dev/null 2>&1 || fail "ssh is not installed locally."
[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY
Create one with:
  ssh-keygen -t ed25519 -C 'news-deploy' -f $SSH_KEY
  ssh-copy-id -i $SSH_KEY.pub $VPS_USER@$VPS_HOST"

[ -f "$LOCAL_DIR/.env" ] || fail ".env is missing. Run: cp .env.example .env && edit it."

if ! grep -Eq '^ADMIN_PASSWORD=["'"'"']?[^"'"'"'[:space:]]+' "$LOCAL_DIR/.env"; then
  fail "ADMIN_PASSWORD is empty in .env. Set a strong password before deploying."
fi

if grep -Eq '^ADMIN_PASSWORD=["'"'"']?change-me-now' "$LOCAL_DIR/.env"; then
  fail "Refusing to deploy with the example ADMIN_PASSWORD. Change it in .env."
fi

SSH_OPTS=(
  -i "$SSH_KEY"
  -p "$SSH_PORT"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=15
)

log "Testing SSH connection to ${VPS_USER}@${VPS_HOST}:${SSH_PORT}..."
ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" "mkdir -p '${REMOTE_DIR}'"

log "Syncing ${LOCAL_DIR}/ → ${VPS_HOST}:${REMOTE_DIR}/"
rsync -az --delete --human-readable --info=progress2 \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'prisma/data/' \
  --exclude '*.db' \
  --exclude '*.db-journal' \
  --exclude '*.db-shm' \
  --exclude '*.db-wal' \
  --exclude '.DS_Store' \
  "${LOCAL_DIR}/" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

log "Building and starting containers on the VPS..."
ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" "bash -s" <<REMOTE
set -Eeuo pipefail
cd "${REMOTE_DIR}"

if [ ! -f .env ]; then
  echo "ERROR: .env was not found in ${REMOTE_DIR}" >&2
  exit 1
fi

chmod 600 .env
mkdir -p prisma/data

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --build --remove-orphans
else
  docker compose up -d --build --remove-orphans
fi

# Remove dangling images left behind by previous builds.
docker image prune -f >/dev/null 2>&1 || true

echo "--- container status ---"
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose ps
else
  docker compose ps
fi
REMOTE

log "Deployment complete."
log "Domain: ${SITE_URL_VALUE}/tr"
log "Direct: http://${VPS_HOST}:${APP_PORT_VALUE}/tr"
log "Admin:  ${SITE_URL_VALUE}/tr/admin"
