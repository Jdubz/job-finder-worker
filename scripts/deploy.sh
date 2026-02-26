#!/usr/bin/env bash
#
# deploy.sh - Sync docker-compose.prod.yml to the production directory
#
# DEPLOY ARCHITECTURE:
# This project runs on the same machine where development happens.
# - CI builds images and pushes to GHCR
# - Watchtower (running locally) detects new images and recreates containers
# - This script syncs compose file changes (run manually or via git hook)
#
# The SSH deployment code was removed because CI runs on GitHub's servers
# but containers run locally. Watchtower handles image updates automatically.
#
# USAGE:
#   ./scripts/deploy.sh              # Sync compose file
#   ./scripts/deploy.sh --recreate   # Sync and recreate containers
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="${DEPLOY_PATH:-/srv/job-finder}"
COMPOSE_SRC="${REPO_ROOT}/infra/docker-compose.prod.yml"
COMPOSE_DST="${PROD_DIR}/docker-compose.yml"
LITELLM_CFG_SRC="${REPO_ROOT}/infra/litellm-config.yaml"
LITELLM_CFG_DST="${PROD_DIR}/infra/litellm-config.yaml"

# Verify source files exist
for src in "${COMPOSE_SRC}" "${LITELLM_CFG_SRC}"; do
  if [[ ! -f "${src}" ]]; then
    echo "[deploy] ERROR: ${src} not found" >&2
    exit 1
  fi
done

# Sync docker-compose.yml
if [[ -f "${COMPOSE_DST}" ]] && diff -q "${COMPOSE_SRC}" "${COMPOSE_DST}" >/dev/null 2>&1; then
  echo "[deploy] docker-compose.yml is already up to date"
else
  echo "[deploy] Syncing docker-compose.yml..."
  cp "${COMPOSE_SRC}" "${COMPOSE_DST}"
  echo "[deploy] Synced: ${COMPOSE_SRC} -> ${COMPOSE_DST}"
fi

# Sync litellm-config.yaml (mounted by the litellm service)
mkdir -p "${PROD_DIR}/infra"
if [[ -f "${LITELLM_CFG_DST}" ]] && diff -q "${LITELLM_CFG_SRC}" "${LITELLM_CFG_DST}" >/dev/null 2>&1; then
  echo "[deploy] litellm-config.yaml is already up to date"
else
  echo "[deploy] Syncing litellm-config.yaml..."
  cp "${LITELLM_CFG_SRC}" "${LITELLM_CFG_DST}"
  echo "[deploy] Synced: ${LITELLM_CFG_SRC} -> ${LITELLM_CFG_DST}"
fi

# Recreate containers if requested
if [[ "${1:-}" == "--recreate" ]]; then
  echo "[deploy] Recreating containers with new config..."
  cd "${PROD_DIR}"
  docker compose up -d --force-recreate api worker litellm
  echo "[deploy] Containers recreated"
fi

echo "[deploy] Done"
