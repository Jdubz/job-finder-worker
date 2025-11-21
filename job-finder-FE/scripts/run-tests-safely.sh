#!/usr/bin/env bash

# Single entrypoint for the frontend Vitest suite.
# Delegates to Vitest directly so that new tests are picked up automatically.

set -euo pipefail

MODE="${1:-all}"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

header() {
  echo -e "${YELLOW}$1${NC}"
}

run_vitest() {
  local scope_label=$1
  local with_coverage=$2
  shift 2
  local paths=("$@")

  header "▶️  ${scope_label}"

  local cmd=(env NODE_OPTIONS='--max-old-space-size=4096' npx vitest run --silent --no-watch --reporter=default)
  if [[ "${with_coverage}" == "true" ]]; then
    cmd+=("--coverage")
  fi
  if [[ "${#paths[@]}" -gt 0 ]]; then
    cmd+=("${paths[@]}")
  fi

  if "${cmd[@]}"; then
    echo -e "${GREEN}✅ ${scope_label} passed${NC}"
    return 0
  fi

  echo -e "${RED}❌ ${scope_label} failed${NC}"
  return 1
}

case "${MODE}" in
  unit)
    run_vitest "Unit tests (src)" "false" "src"
    ;;
  integration)
    run_vitest "Integration tests (tests/integration)" "false" "tests/integration"
    ;;
  smoke)
    SMOKE_TESTS=(
      "src/lib/__tests__/utils.test.ts"
      "src/services/logging/__tests__/CloudLogger.test.ts"
      "src/pages/content-items/__tests__/content-items.helpers.test.ts"
      "src/api/__tests__/job-matches-client.test.ts"
      "src/hooks/__tests__/useQueueItems.test.ts"
      "src/__tests__/config-validation.test.ts"
      "tests/integration/authentication.test.ts"
    )
    header "⚡ Running smoke tests"
    mapfile -t SELECTED < <(
      for test_file in "${SMOKE_TESTS[@]}"; do
        if [[ -f "${test_file}" ]]; then
          echo "${test_file}"
        else
          echo -e "${YELLOW}⚠️  Skipping missing smoke test: ${test_file}${NC}" >&2
        fi
      done
    )
    if [[ ${#SELECTED[@]} -eq 0 ]]; then
      echo -e "${RED}No smoke tests found. Update SMOKE_TESTS in scripts/run-tests-safely.sh${NC}"
      exit 1
    fi
    run_vitest "Smoke tests" "false" "${SELECTED[@]}"
    ;;
  all)
    header "🚀 Running full Vitest suite with coverage"
    run_vitest "Full suite" "true"
    ;;
  *)
    echo "Usage: $0 [unit|integration|smoke|all]"
    exit 1
    ;;
esac
