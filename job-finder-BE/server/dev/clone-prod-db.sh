#!/usr/bin/env bash
set -euo pipefail

# Clone the production SQLite database (and WAL/SHM files) into the local
# dev environment so the generator workflow runs against realistic data.
#
# Required env:
#   PROD_SSH_HOST   - SSH host or alias that has /srv/job-finder/data/jobfinder.db
# Optional env:
#   PROD_DB_PATH    - Override remote DB path (default: /srv/job-finder/data/jobfinder.db)
#   SSH_OPTS        - Extra ssh/scp options (e.g., '-i ~/.ssh/prod-key')
#
# NOTE: Prefer using 'make dev-clone-db-scp' from the server directory instead.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
DEST_DIR="$SERVER_DIR/.dev/data"
DEST_DB="$DEST_DIR/jobfinder.db"
PROD_DB_PATH="${PROD_DB_PATH:-/srv/job-finder/data/jobfinder.db}"
SSH_HOST="${PROD_SSH_HOST:-}"

if [[ -z "$SSH_HOST" ]]; then
  echo "ERROR: Set PROD_SSH_HOST to the production box (e.g., prod-jobfinder)" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

copy_file() {
  local src="$1" dst="$2"
  echo "Copying $src -> $dst"
  if ! scp ${SSH_OPTS:-} "$SSH_HOST:$src" "$dst"; then
    echo "WARN: $src not found on remote; continuing" >&2
  fi
}

copy_file "$PROD_DB_PATH" "$DEST_DB"
copy_file "$PROD_DB_PATH-wal" "$DEST_DB-wal"
copy_file "$PROD_DB_PATH-shm" "$DEST_DB-shm"

chmod 600 "$DEST_DB"*
echo "Dev database ready at $DEST_DB"
