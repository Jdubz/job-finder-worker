#!/usr/bin/env bash
set -euo pipefail

# Development test harness for the generator API
# Uses the main docker-compose.dev.yml and .dev/ directories

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE="docker compose -f $SERVER_DIR/docker-compose.dev.yml"
ENV_FILE="$SERVER_DIR/.env.dev"
DEV_DIR="$SERVER_DIR/.dev"
OUTPUT_DIR="$DEV_DIR/output"
LOG_FILE="$OUTPUT_DIR/container.log"
RESPONSE_FILE="$OUTPUT_DIR/last-response.json"
PAYLOAD_FILE="${PAYLOAD_FILE:-$SCRIPT_DIR/sample-request.json}"
PROFILE="${PROFILE:-prod}"
SERVICE_NAME="api"
SERVICE_CONTAINER="job-finder-api-dev"
if [[ "$PROFILE" == "hotreload" ]]; then
  SERVICE_NAME="api-hotreload"
  SERVICE_CONTAINER="job-finder-api-dev-hotreload"
fi

mkdir -p "$DEV_DIR/data" "$DEV_DIR/artifacts" "$DEV_DIR/logs" "$OUTPUT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE is missing. Copy .env.dev.example and fill it." >&2
  echo "Run: cd $SERVER_DIR && cp .env.dev.example .env.dev" >&2
  exit 1
fi

# Load env vars (exports so compose sees them)
set -a
source "$ENV_FILE"
set +a

API_PORT="${API_PORT:-18080}"
AUTH_TOKEN="${GENERATOR_BYPASS_TOKEN:-}"
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "ERROR: Set GENERATOR_BYPASS_TOKEN in $ENV_FILE" >&2
  exit 1
fi

if [[ ! -s "$DEV_DIR/data/jobfinder.db" ]]; then
  echo "WARN: No DB copy found in $DEV_DIR/data/. Run 'make dev-clone-db' first." >&2
fi

echo "Starting dev stack (profile=$PROFILE)..."
echo "Codex credentials: ~/.codex -> /home/node/.codex (bind mount)"
$COMPOSE --profile "$PROFILE" up -d sqlite-migrator
$COMPOSE --profile "$PROFILE" up -d "$SERVICE_NAME"

# Verify codex credentials are accessible (bind mount, runs as node user uid 1000)
echo "Verifying Codex credentials in container..."
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

START_RESPONSE=$(curl -sS -X POST "http://localhost:${API_PORT}/api/generator/start" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@${PAYLOAD_FILE}")

echo "$START_RESPONSE" > "$RESPONSE_FILE"

mapfile -t start_vals < <(echo "$START_RESPONSE" | jq -r '.data | (.requestId // ""), (.nextStep // ""), (.resumeUrl // ""), (.coverLetterUrl // "")')
REQUEST_ID="${start_vals[0]}"
NEXT_STEP="${start_vals[1]}"
RESUME_URL="${start_vals[2]}"
COVER_URL="${start_vals[3]}"

if [[ -z "$REQUEST_ID" ]]; then
  echo "ERROR: No requestId in response. See $RESPONSE_FILE" >&2
  exit 1
fi

echo "Generator request id: $REQUEST_ID"

# Execute remaining steps
while [[ -n "$NEXT_STEP" ]]; do
  STEP_RESPONSE=$(curl -sS -X POST "http://localhost:${API_PORT}/api/generator/step/${REQUEST_ID}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json")
  echo "$STEP_RESPONSE" > "$RESPONSE_FILE"
  mapfile -t step_vals < <(echo "$STEP_RESPONSE" | jq -r '.data | (.status // ""), (.nextStep // ""), (.resumeUrl // ""), (.coverLetterUrl // "")')
  STATUS="${step_vals[0]}"
  NEXT_STEP="${step_vals[1]}"
  RESUME_URL="${step_vals[2]}"
  COVER_URL="${step_vals[3]}"
  if [[ "$STATUS" == "failed" ]]; then
    echo "ERROR: Generation failed. See $RESPONSE_FILE" >&2
    exit 1
  fi
done

# Final response saved
echo "Response saved to $RESPONSE_FILE"

# Verify DB state
if command -v sqlite3 >/dev/null; then
  DB_PATH="$DEV_DIR/data/jobfinder.db"
  if [[ -f "$DB_PATH" ]]; then
    echo "DB status for $REQUEST_ID:" >> "$OUTPUT_DIR/db-check.txt"
    sqlite3 "$DB_PATH" "SELECT id,status,resume_url,cover_letter_url,created_at FROM generator_requests WHERE id='$REQUEST_ID';" >> "$OUTPUT_DIR/db-check.txt"
    cat "$OUTPUT_DIR/db-check.txt"
  else
    echo "WARN: DB file missing at $DB_PATH" >&2
  fi
else
  echo "WARN: sqlite3 not installed; skipping DB check" >&2
fi

# Verify artifacts landed on disk
check_artifact() {
  local url="$1"
  [[ -z "$url" ]] && return 0
  local rel="${url#*/api/generator/artifacts/}" # works for relative or absolute URLs
  local abs="$DEV_DIR/artifacts/$rel"
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

Development test complete.
- Request ID: $REQUEST_ID
- Resume URL: ${RESUME_URL:-<none>}
- Cover URL: ${COVER_URL:-<none>}
- Response:   $RESPONSE_FILE
- Logs:       $LOG_FILE
- Artifacts:  $DEV_DIR/artifacts

Open the generated PDFs to judge formatting.
SUMMARY
