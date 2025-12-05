#!/usr/bin/env bash

# Simple deployment helper invoked by CI.
# If the required secrets are not configured the script logs a warning and exits successfully.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

missing_var() {
  local name="$1"
  [[ -z "${!name:-}" ]]
}

if missing_var DEPLOY_HOST || missing_var DEPLOY_PATH || missing_var DEPLOY_USER || missing_var DEPLOY_SSH_PRIVATE_KEY; then
  cat <<'EOF'
[deploy] Required deployment variables are not set (DEPLOY_HOST, DEPLOY_PATH, DEPLOY_USER, DEPLOY_SSH_PRIVATE_KEY).
[deploy] Skipping remote deployment. Configure the secrets in GitHub Settings → Secrets and rerun the workflow.
EOF
  exit 0
fi

echo "[deploy] Preparing workspace archive…"
ARCHIVE_PATH="$(mktemp "${REPO_ROOT}/job-finder-XXXXXX.tar.gz")"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='infra/sqlite/jobfinder.db' \
  --exclude='.github' \
  -czf "${ARCHIVE_PATH}" \
  -C "${REPO_ROOT}" .

SSH_DIR="${HOME}/.ssh"
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"
DEPLOY_KEY_PATH="${SSH_DIR}/deploy_key"
printf '%s\n' "${DEPLOY_SSH_PRIVATE_KEY}" > "${DEPLOY_KEY_PATH}"
chmod 600 "${DEPLOY_KEY_PATH}"

echo "[deploy] Adding ${DEPLOY_HOST} to known_hosts…"
ssh-keyscan -H "${DEPLOY_HOST}" >> "${SSH_DIR}/known_hosts"

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
REMOTE_ARCHIVE="${DEPLOY_PATH}/job-finder.tar.gz"

echo "[deploy] Uploading artifacts to ${REMOTE}…"
ssh -i "${DEPLOY_KEY_PATH}" -o StrictHostKeyChecking=yes "${REMOTE}" "mkdir -p '${DEPLOY_PATH}'"
scp -i "${DEPLOY_KEY_PATH}" "${ARCHIVE_PATH}" "${REMOTE}:${REMOTE_ARCHIVE}"

cat <<'EOF' > /tmp/deploy-commands.sh
set -euo pipefail
cd "$DEPLOY_PATH"
tar -xzf job-finder.tar.gz --strip-components=1
# Always refresh docker-compose.yml from the prod config to keep in sync.
# Uses docker-compose.prod.yml (not template) which has prod-specific settings
# like seed+volume pattern for CLI credentials.
cp infra/docker-compose.prod.yml docker-compose.yml
echo "[deploy] Synced docker-compose.yml from infra/docker-compose.prod.yml"

# --- Refresh Codex auth into seeds and volumes ---
CODEX_BASE="${CODEX_BASE:-$DEPLOY_PATH}"
SOURCE_AUTH="$HOME/.codex/auth.json"
if [ -f "$SOURCE_AUTH" ]; then
  echo "[deploy] Updating Codex auth from $SOURCE_AUTH"
  install -m 700 -d "$CODEX_BASE/codex-seed/.codex"
  install -m 600 "$SOURCE_AUTH" "$CODEX_BASE/codex-seed/.codex/auth.json"

  sync_volume_auth() {
    local volume_name="$1"
    docker run --rm \
      -v "${volume_name}:/data" \
      -v "$SOURCE_AUTH:/host/auth.json:ro" \
      alpine:3.20.2 \
      sh -c 'mkdir -p /data && cp /host/auth.json /data/auth.json && chmod 600 /data/auth.json'
  }

  sync_volume_auth job-finder_codex-home-api || echo "[deploy] WARNING: Failed to sync auth to volume job-finder_codex-home-api. Continuing..."
  sync_volume_auth job-finder_codex-home-worker || echo "[deploy] WARNING: Failed to sync auth to volume job-finder_codex-home-worker. Continuing..."
else
  echo "[deploy] WARNING: $SOURCE_AUTH not found; skipping Codex auth refresh"
fi

# --- Refresh Gemini auth into seeds and volumes ---
GEMINI_BASE="${GEMINI_BASE:-$DEPLOY_PATH}"
SOURCE_GEMINI="$HOME/.gemini/oauth_creds.json"
if [ -f "$SOURCE_GEMINI" ]; then
  echo "[deploy] Updating Gemini auth from $SOURCE_GEMINI"
  install -m 700 -d "$GEMINI_BASE/gemini-seed/.gemini"
  install -m 600 "$SOURCE_GEMINI" "$GEMINI_BASE/gemini-seed/.gemini/oauth_creds.json"

  sync_volume_gemini() {
    local volume_name="$1"
    docker run --rm \
      -v "${volume_name}:/data" \
      -v "$SOURCE_GEMINI:/host/oauth_creds.json:ro" \
      alpine:3.20.2 \
      sh -c 'mkdir -p /data && cp /host/oauth_creds.json /data/oauth_creds.json && chmod 600 /data/oauth_creds.json'
  }

  sync_volume_gemini job-finder_gemini-home-api || echo "[deploy] WARNING: Failed to sync auth to volume job-finder_gemini-home-api. Continuing..."
  sync_volume_gemini job-finder_gemini-home-worker || echo "[deploy] WARNING: Failed to sync auth to volume job-finder_gemini-home-worker. Continuing..."
else
  echo "[deploy] WARNING: $SOURCE_GEMINI not found; skipping Gemini auth refresh"
fi
# Pull and restart stack
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --remove-orphans

# --- Run config/data migrations ---
echo "[deploy] Waiting for API container to be healthy..."
for i in $(seq 1 30); do
  if docker exec job-finder-api curl -sf http://localhost:8080/healthz > /dev/null 2>&1; then
    echo "[deploy] API container is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[deploy] WARNING: API health check timed out after 30s, attempting migrations anyway..."
  fi
  sleep 1
done

echo "[deploy] Running config migrations..."
# ai-settings migration (AgentManager schema)
if docker exec job-finder-api node dist/scripts/migrate-ai-settings.js 2>&1; then
  echo "[deploy] ai-settings migration completed"
else
  echo "[deploy] WARNING: ai-settings migration failed (may already be migrated)"
fi

# tech-ranks migration (rank schema normalization)
if docker exec job-finder-api node dist/scripts/migrate-tech-ranks.js 2>&1; then
  echo "[deploy] tech-ranks migration completed"
else
  echo "[deploy] WARNING: tech-ranks migration failed (may already be migrated)"
fi

echo "[deploy] Config migrations complete"
EOF

echo "[deploy] Executing remote deployment…"
scp -i "${DEPLOY_KEY_PATH}" /tmp/deploy-commands.sh "${REMOTE}:${DEPLOY_PATH}/deploy.sh"
ssh -i "${DEPLOY_KEY_PATH}" "${REMOTE}" "DEPLOY_PATH='${DEPLOY_PATH}' bash '${DEPLOY_PATH}/deploy.sh'"

echo "[deploy] Deployment completed."
