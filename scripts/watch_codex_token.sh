#!/usr/bin/env bash
# Watch the canonical Codex token and propagate changes to seed + runtime volume.
# Intended to run on the host (systemd service/timer) without touching user ~/.codex.

set -euo pipefail

REFRESH_HOME="${CODEX_REFRESH_HOME:-/srv/job-finder/codex-refresh/.codex}"
SEED_DIR="${CODEX_SEED_DIR:-/srv/job-finder/codex-seed/.codex}"
COMPOSE_FILE="${COMPOSE_FILE:-/srv/job-finder/docker-compose.yml}"
VOLUME_NAME="${CODEX_VOLUME_NAME:-job-finder_codex-home-shared}"
SERVICES="${CODEX_SERVICES:-worker api}"

AUTH_PATH="$REFRESH_HOME/auth.json"

copy_auth() {
  install -m 700 -d "$SEED_DIR"
  install -m 600 "$AUTH_PATH" "$SEED_DIR/auth.json"
  docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE_FILE" up -d $SERVICES
  echo "[watch-codex] Propagated updated token at $(date -Is)"
}

hash_file() {
  sha256sum "$AUTH_PATH" | awk '{print $1}'
}

if [[ ! -f "$AUTH_PATH" ]]; then
  echo "[watch-codex] ERROR: $AUTH_PATH missing" >&2
  exit 1
fi

last_hash=$(hash_file)
copy_auth

while true; do
  new_hash=$(hash_file)
  if [[ "$new_hash" != "$last_hash" ]]; then
    last_hash="$new_hash"
    copy_auth
  fi
  sleep 30
done
