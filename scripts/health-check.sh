#!/usr/bin/env bash
#
# health-check.sh - Verify the full production stack is healthy
#
# Checks containers, endpoints, models, and config sync.
# Exit code 0 = all healthy, non-zero = failures found.
#
# USAGE:
#   ./scripts/health-check.sh
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="${DEPLOY_PATH:-/srv/job-finder}"

# Load LiteLLM master key for authenticated endpoints
if [[ -z "${LITELLM_MASTER_KEY:-}" && -f "${PROD_DIR}/.env" ]]; then
  LITELLM_MASTER_KEY=$(sed -n 's/^LITELLM_MASTER_KEY=//p' "${PROD_DIR}/.env" 2>/dev/null | head -n1 || true)
fi

# ── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  ((PASS++))
}

fail() {
  echo -e "  ${RED}✗${NC} $1"
  ((FAIL++))
}

warn() {
  echo -e "  ${YELLOW}!${NC} $1"
  ((WARN++))
}

# ── Container checks ────────────────────────────────────────────────────────
echo -e "\n${BOLD}Containers${NC}"

EXPECTED_CONTAINERS=(
  job-finder-api
  job-finder-worker
  job-finder-litellm
  job-finder-ollama
  job-finder-cloudflared
  job-finder-watchtower
  job-finder-stack-guard
)

for cname in "${EXPECTED_CONTAINERS[@]}"; do
  status=$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null || true)
  if [[ "$status" == "running" ]]; then
    pass "$cname is running"
  elif [[ -n "$status" ]]; then
    fail "$cname exists but status is '${status}'"
  else
    fail "$cname not found"
  fi
done

# ── API health ───────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Endpoints${NC}"

api_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/healthz 2>/dev/null || true)
if [[ "$api_status" == "200" ]]; then
  pass "API /healthz returned 200"
else
  fail "API /healthz returned ${api_status:-timeout}"
fi

# ── LiteLLM readiness ───────────────────────────────────────────────────────
litellm_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:4000/health/readiness 2>/dev/null || true)
if [[ "$litellm_status" == "200" ]]; then
  pass "LiteLLM /health/readiness returned 200"
else
  fail "LiteLLM /health/readiness returned ${litellm_status:-timeout}"
fi

# ── LiteLLM models ──────────────────────────────────────────────────────────
echo -e "\n${BOLD}LiteLLM Models${NC}"

EXPECTED_LITELLM_MODELS=(claude-document gemini-general local-extract local-embed)

models_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H "Authorization: Bearer ${LITELLM_MASTER_KEY:-}" http://localhost:4000/v1/models 2>/dev/null || true)
if [[ "$models_status" == "401" || "$models_status" == "403" ]]; then
  fail "LiteLLM /v1/models unauthorized (status ${models_status}) — missing/invalid LITELLM_MASTER_KEY?"
elif [[ "$models_status" != "200" ]]; then
  fail "LiteLLM /v1/models returned ${models_status:-timeout}"
else
  models_json=$(curl -s --max-time 5 -H "Authorization: Bearer ${LITELLM_MASTER_KEY:-}" http://localhost:4000/v1/models 2>/dev/null || true)
  if [[ -z "$models_json" ]]; then
    fail "Could not reach LiteLLM /v1/models"
  else
    for model in "${EXPECTED_LITELLM_MODELS[@]}"; do
      if echo "$models_json" | grep -q "\"$model\""; then
        pass "LiteLLM model '$model' registered"
      else
        fail "LiteLLM model '$model' not found"
      fi
    done
  fi
fi

# ── Ollama models ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Ollama Models${NC}"

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
EXPECTED_OLLAMA_MODELS=("$OLLAMA_MODEL" "$OLLAMA_EMBED_MODEL")

ollama_list=$(docker exec job-finder-ollama ollama list 2>/dev/null || true)
if [[ -z "$ollama_list" ]]; then
  fail "Could not list Ollama models (container may not be running)"
else
  for model in "${EXPECTED_OLLAMA_MODELS[@]}"; do
    if echo "$ollama_list" | awk '{print $1}' | grep -Fxq "$model"; then
      pass "Ollama model '$model' pulled"
    else
      fail "Ollama model '$model' not found"
    fi
  done
fi

# ── Config sync ──────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Config Sync${NC}"

check_sync() {
  local src="$1" dst="$2" label="$3"
  if [[ ! -f "$dst" ]]; then
    fail "$label: $dst not found on disk"
  elif diff -q "$src" "$dst" >/dev/null 2>&1; then
    pass "$label is in sync"
  else
    warn "$label is OUT OF SYNC (repo differs from $dst)"
  fi
}

check_sync "${REPO_ROOT}/infra/docker-compose.prod.yml" "${PROD_DIR}/docker-compose.yml" "docker-compose.yml"
check_sync "${REPO_ROOT}/infra/litellm-config.yaml" "${PROD_DIR}/infra/litellm-config.yaml" "litellm-config.yaml"

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Summary${NC}"
echo -e "  ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  ${YELLOW}${WARN} warnings${NC}"

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}Health check failed${NC}"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}All checks passed${NC}"
  exit 0
fi
