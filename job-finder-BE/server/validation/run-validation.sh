#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $SCRIPT_DIR/docker-compose.validation.yml"
ENV_FILE="$SCRIPT_DIR/.env.validation"
OUTPUT_DIR="$SCRIPT_DIR/output"
LOG_FILE="$OUTPUT_DIR/container.log"
RESPONSE_FILE="$OUTPUT_DIR/last-response.json"
PAYLOAD_FILE="${PAYLOAD_FILE:-$SCRIPT_DIR/sample-request.json}"
PROFILE="${PROFILE:-prod}"
SERVICE_NAME="api"
SERVICE_CONTAINER="generator-validation-api"
if [[ "$PROFILE" == "hotreload" ]]; then
  SERVICE_NAME="api-dev"
  SERVICE_CONTAINER="generator-validation-api-dev"
fi

mkdir -p "$SCRIPT_DIR/volumes/sqlite" "$SCRIPT_DIR/volumes/artifacts" "$SCRIPT_DIR/volumes/logs" "$OUTPUT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE is missing. Copy .env.validation.example and fill it." >&2
  exit 1
fi

# Load env vars (exports so compose sees them)
set -a
source "$ENV_FILE"
set +a

API_PORT="${API_PORT:-18080}"
AUTH_TOKEN="${GENERATOR_BYPASS_TOKEN:-${TEST_AUTH_BYPASS_TOKEN:-}}"
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "ERROR: Set GENERATOR_BYPASS_TOKEN or TEST_AUTH_BYPASS_TOKEN in $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${CODEX_DIR:-}" ]]; then
  echo "ERROR: CODEX_DIR must point to the credential mount you use in production (e.g., ~/.codex)" >&2
  exit 1
fi
if [[ ! -d "$CODEX_DIR" ]]; then
  echo "WARN: CODEX_DIR does not exist locally: $CODEX_DIR" >&2
fi

if [[ ! -s "$SCRIPT_DIR/volumes/sqlite/jobfinder.db" ]]; then
  echo "WARN: No DB copy found in volumes/sqlite. Run clone-prod-db.sh first." >&2
fi

echo "Starting validation stack (profile=$PROFILE)..."
$COMPOSE --profile "$PROFILE" up -d sqlite-migrator
$COMPOSE --profile "$PROFILE" up -d "$SERVICE_NAME"

# Copy Codex credentials into the running container (tmpfs) just like dev-bots
echo "Syncing Codex credentials into container..."
# Use trailing /. to copy CONTENTS of CODEX_DIR into the target directory
docker exec "$SERVICE_CONTAINER" rm -rf /home/node/.codex/* 2>/dev/null || true
for f in auth.json config.toml; do
  if [[ -f "$CODEX_DIR/$f" ]]; then
    docker cp "$CODEX_DIR/$f" "$SERVICE_CONTAINER":/home/node/.codex/ >/dev/null
  fi
done
docker exec "$SERVICE_CONTAINER" chown -R node:node /home/node/.codex
docker exec "$SERVICE_CONTAINER" ls -la /home/node/.codex || true

# Health check
HEALTH_URL="http://localhost:${API_PORT}/healthz"
echo "Waiting for API at $HEALTH_URL ..."
for _ in {1..30}; do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    break
  fi
  sleep 1
done
if ! curl -sf "$HEALTH_URL" >/dev/null; then
  echo "ERROR: API did not become healthy" >&2
  exit 1
fi

echo "Running generator request from $PAYLOAD_FILE ..."
if [[ ! -f "$PAYLOAD_FILE" ]]; then
  echo "ERROR: Payload file not found: $PAYLOAD_FILE" >&2
  exit 1
fi

curl -sS -X POST "http://localhost:${API_PORT}/api/generator/generate" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@${PAYLOAD_FILE}" \
  -o "$RESPONSE_FILE"

echo "Response saved to $RESPONSE_FILE"

REQUEST_ID=$(jq -r '.data.generationId // .data.requestId // empty' "$RESPONSE_FILE" || true)
RESUME_URL=$(jq -r '.data.resumeUrl // empty' "$RESPONSE_FILE" || true)
COVER_URL=$(jq -r '.data.coverLetterUrl // empty' "$RESPONSE_FILE" || true)

if [[ -z "$REQUEST_ID" ]]; then
  echo "ERROR: No requestId in response. See $RESPONSE_FILE" >&2
  exit 1
fi

echo "Generator request id: $REQUEST_ID"

# Verify DB state
if command -v sqlite3 >/dev/null; then
  DB_PATH="$SCRIPT_DIR/volumes/sqlite/jobfinder.db"
  if [[ -f "$DB_PATH" ]]; then
    echo "DB status for $REQUEST_ID:" >> "$OUTPUT_DIR/db-check.txt"
    sqlite3 "$DB_PATH" "SELECT id,status,resume_url,cover_letter_url,created_at FROM generator_requests WHERE id='$REQUEST_ID';" >> "$OUTPUT_DIR/db-check.txt"
    cat "$OUTPUT_DIR/db-check.txt"
  else
    echo "WARN: DB file missing at $DB_PATH" >&2
  fi
else
  echo "WARN: sqlite3 not installed; skipping DB validation" >&2
fi

# Verify artifacts landed on disk
check_artifact() {
  local url="$1"
  [[ -z "$url" ]] && return 0
  local rel="${url#/api/generator/artifacts/}"
  local abs="$SCRIPT_DIR/volumes/artifacts/$rel"
  if [[ -f "$abs" ]]; then
    echo "✔ Found artifact: $abs"
  else
    echo "✖ Missing artifact file for $url (expected at $abs)" >&2
  fi
}

check_artifact "$RESUME_URL"
check_artifact "$COVER_URL"

echo "Tailing container logs -> $LOG_FILE"
$COMPOSE logs --no-color --tail=100 "$SERVICE_NAME" > "$LOG_FILE" 2>&1 || true

cat <<SUMMARY

Validation run complete.
- Request ID: $REQUEST_ID
- Resume URL: ${RESUME_URL:-<none>}
- Cover URL: ${COVER_URL:-<none>}
- Response:   $RESPONSE_FILE
- Logs:       $LOG_FILE
- Artifacts:  $SCRIPT_DIR/volumes/artifacts

Open the generated PDFs to judge formatting.
SUMMARY
