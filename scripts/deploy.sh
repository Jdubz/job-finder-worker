#!/usr/bin/env bash
#
# deploy.sh - Sync config files and manage the production stack
#
# DEPLOY ARCHITECTURE:
# This project runs on the same machine where development happens.
# - CI builds images and pushes to GHCR
# - Watchtower (running locally) detects new images and recreates containers
# - This script syncs compose/config changes (run manually or via git hook)
#
# USAGE:
#   ./scripts/deploy.sh              # Sync config, verify Ollama models
#   ./scripts/deploy.sh --recreate   # Sync, recreate containers, verify, health check
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="${DEPLOY_PATH:-/srv/job-finder}"
COMPOSE_SRC="${REPO_ROOT}/infra/docker-compose.prod.yml"
COMPOSE_DST="${PROD_DIR}/docker-compose.yml"
LITELLM_CFG_SRC="${REPO_ROOT}/infra/litellm-config.yaml"
LITELLM_CFG_DST="${PROD_DIR}/infra/litellm-config.yaml"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"

LITELLM_CONFIG_CHANGED=false

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
  LITELLM_CONFIG_CHANGED=true
  echo "[deploy] Syncing litellm-config.yaml..."
  cp "${LITELLM_CFG_SRC}" "${LITELLM_CFG_DST}"
  echo "[deploy] Synced: ${LITELLM_CFG_SRC} -> ${LITELLM_CFG_DST}"
fi

# Auto-restart LiteLLM when config changed (so it picks up new models/settings)
if [[ "$LITELLM_CONFIG_CHANGED" == true && "${1:-}" != "--recreate" ]]; then
  if docker inspect --format '{{.State.Status}}' job-finder-litellm 2>/dev/null | grep -q running; then
    echo "[deploy] LiteLLM config changed — restarting container..."
    cd "${PROD_DIR}"
    docker compose restart litellm
    echo "[deploy] LiteLLM restarted"
  else
    echo "[deploy] LiteLLM config changed but container is not running, skipping restart"
  fi
fi

# Recreate containers if requested
if [[ "${1:-}" == "--recreate" ]]; then
  echo "[deploy] Recreating containers with new config..."
  cd "${PROD_DIR}"
  docker compose up -d --force-recreate ollama litellm api worker
  echo "[deploy] Containers recreated"

  # Wait for Ollama container to be ready before checking/pulling models
  echo "[deploy] Waiting for Ollama container to be ready..."
  for i in $(seq 1 30); do
    if docker exec job-finder-ollama ollama list >/dev/null 2>&1; then
      echo "[deploy] Ollama container is ready"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "[deploy] ERROR: Ollama container not ready after 30s" >&2
      exit 1
    fi
    sleep 1
  done
fi

# Always verify Ollama models (not just on --recreate)
if docker exec job-finder-ollama ollama list >/dev/null 2>&1; then
  for model in "${OLLAMA_MODEL}" "${OLLAMA_EMBED_MODEL}"; do
    echo "[deploy] Ensuring Ollama model '${model}' is available..."
    if docker exec job-finder-ollama ollama list 2>/dev/null | awk '{print $1}' | grep -Fxq "${model}"; then
      echo "[deploy] Model '${model}' already present"
    else
      echo "[deploy] Pulling '${model}' (this may take several minutes)..."
      docker exec job-finder-ollama ollama pull "${model}"
      echo "[deploy] Model '${model}' pulled successfully"
    fi
  done
else
  echo "[deploy] WARNING: Ollama container not reachable, skipping model verification"
fi

# Run health check after --recreate to verify everything came up
if [[ "${1:-}" == "--recreate" ]]; then
  echo ""
  echo "[deploy] Running post-deploy health check..."
  if ! "${REPO_ROOT}/scripts/health-check.sh"; then
    echo "[deploy] WARNING: Health check reported failures (see above)" >&2
    exit 1
  fi
fi

echo "[deploy] Done"
