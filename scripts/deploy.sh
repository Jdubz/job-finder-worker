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
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
EOF

echo "[deploy] Executing remote deployment…"
scp -i "${DEPLOY_KEY_PATH}" /tmp/deploy-commands.sh "${REMOTE}:${DEPLOY_PATH}/deploy.sh"
ssh -i "${DEPLOY_KEY_PATH}" "${REMOTE}" "DEPLOY_PATH='${DEPLOY_PATH}' bash '${DEPLOY_PATH}/deploy.sh'"

echo "[deploy] Deployment completed."
