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
SOURCE_AUTH="$HOME/.codex/auth.json"
if [ -f "$SOURCE_AUTH" ]; then
  echo "[deploy] Updating Codex auth from $SOURCE_AUTH"
  install -m 700 -d /srv/job-finder/codex-seed/.codex
  install -m 600 "$SOURCE_AUTH" /srv/job-finder/codex-seed/.codex/auth.json

  sync_volume_auth() {
    local volume_name="$1"
    docker run --rm \
      -v "${volume_name}:/data" \
      -v "$SOURCE_AUTH:/host/auth.json:ro" \
      alpine:3.20 \
      sh -c 'mkdir -p /data && cp /host/auth.json /data/auth.json && chmod 600 /data/auth.json'
  }

  sync_volume_auth job-finder_codex-home-api || echo "[deploy] WARNING: Failed to sync auth to volume job-finder_codex-home-api. Continuing..."
  sync_volume_auth job-finder_codex-home-worker || echo "[deploy] WARNING: Failed to sync auth to volume job-finder_codex-home-worker. Continuing..."
else
  echo "[deploy] WARNING: $SOURCE_AUTH not found; skipping Codex auth refresh"
fi
# Pull and restart stack
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --remove-orphans
EOF

echo "[deploy] Executing remote deployment…"
scp -i "${DEPLOY_KEY_PATH}" /tmp/deploy-commands.sh "${REMOTE}:${DEPLOY_PATH}/deploy.sh"
ssh -i "${DEPLOY_KEY_PATH}" "${REMOTE}" "DEPLOY_PATH='${DEPLOY_PATH}' bash '${DEPLOY_PATH}/deploy.sh'"

echo "[deploy] Deployment completed."
