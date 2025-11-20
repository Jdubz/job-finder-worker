#!/bin/bash

# Safe Test Runner Script
# Runs tests in smaller batches to prevent memory issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Running tests safely to prevent memory issues...${NC}"

# Test file groups (smaller batches) - Only include existing test files
UNIT_TESTS=(
  "src/lib/__tests__/utils.test.ts"
  "src/components/ui/__tests__/button.test.ts"
  "src/components/auth/__tests__/AuthIcon.test.ts"
  "src/components/layout/__tests__/MainLayout.test.ts"
  "src/__tests__/components/DocumentHistoryList.test.ts"
  "src/services/logging/__tests__/CloudLogger.test.ts"
  "src/pages/content-items/__tests__/buildHierarchy.test.ts"
  "src/utils/__tests__/dateFormat.test.ts"
  "src/types/__tests__/routes.test.ts"
  "src/api/__tests__/job-matches-client.test.ts"
)

INTEGRATION_TESTS=(
  "tests/integration/jobQueue.test.ts"
  "tests/integration/contentItems.test.ts"
  "tests/integration/generator.test.ts"
  "tests/integration/jobMatches.test.ts"
  "tests/integration/errorHandling.test.ts"
  "tests/integration/authentication.test.ts"
)

# Function to run a single test file
run_single_test() {
  local test_file=$1
  echo -e "${YELLOW}Running: ${test_file}${NC}"
  
  if NODE_OPTIONS='--max-old-space-size=4096' npx vitest run "$test_file" --no-coverage --reporter=verbose --no-isolate; then
    echo -e "${GREEN}✅ ${test_file} passed${NC}"
    return 0
  else
    echo -e "${RED}❌ ${test_file} failed${NC}"
    return 1
  fi
}

# Function to run unit tests
run_unit_tests() {
  echo -e "${YELLOW}📦 Running unit tests...${NC}"
  local failed_tests=()
  local executed_any=false

  for test_file in "${UNIT_TESTS[@]}"; do
    if [ ! -f "$test_file" ]; then
      echo -e "${YELLOW}⚠️  Skipping missing test file: ${test_file}${NC}"
      continue
    fi

    executed_any=true
    if ! run_single_test "$test_file"; then
      failed_tests+=("$test_file")
    fi
    sleep 1
  done

  if [ "$executed_any" = false ]; then
    echo -e "${YELLOW}⚠️  No unit test files found; nothing to run.${NC}"
    return 0
  fi
  
  if [ ${#failed_tests[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All unit tests passed!${NC}"
    return 0
  else
    echo -e "${RED}❌ Failed unit tests:${NC}"
    printf '%s\n' "${failed_tests[@]}"
    return 1
  fi
}

# Function to run integration tests
run_integration_tests() {
  echo -e "${YELLOW}🔗 Running integration tests...${NC}"
  
  if [ ${#INTEGRATION_TESTS[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No integration tests configured yet${NC}"
    echo -e "${GREEN}✅ Integration tests skipped (none configured)${NC}"
    return 0
  fi
  
  # Check if Firebase emulators are running
  if ! curl -f -m 1 http://localhost:9099 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Firebase emulators not running, skipping integration tests${NC}"
    echo -e "${GREEN}✅ Integration tests skipped (emulators not available)${NC}"
    return 0
  fi
  
  # Check if we're in CI environment - skip integration tests in CI
  if [ "$CI" = "true" ] || [ "$GITHUB_ACTIONS" = "true" ]; then
    echo -e "${YELLOW}⚠️  CI environment detected, skipping integration tests${NC}"
    echo -e "${GREEN}✅ Integration tests skipped (CI environment)${NC}"
    return 0
  fi
  
  local failed_tests=()
  local executed_any=false

  for test_file in "${INTEGRATION_TESTS[@]}"; do
    if [ ! -f "$test_file" ]; then
      echo -e "${YELLOW}⚠️  Skipping missing integration test: ${test_file}${NC}"
      continue
    fi

    executed_any=true
    if ! run_single_test "$test_file"; then
      failed_tests+=("$test_file")
    fi
    sleep 2
  done

  if [ "$executed_any" = false ]; then
    echo -e "${YELLOW}⚠️  No integration test files found; nothing to run.${NC}"
    return 0
  fi
  
  if [ ${#failed_tests[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All integration tests passed!${NC}"
    return 0
  else
    echo -e "${RED}❌ Failed integration tests:${NC}"
    printf '%s\n' "${failed_tests[@]}"
    return 1
  fi
}

# Main execution
case "${1:-all}" in
  "unit")
    run_unit_tests
    ;;
  "integration")
    run_integration_tests
    ;;
  "all")
    echo -e "${YELLOW}🚀 Running all tests in safe batches...${NC}"
    if run_unit_tests && run_integration_tests; then
      echo -e "${GREEN}🎉 All tests passed!${NC}"
      exit 0
    else
      echo -e "${RED}💥 Some tests failed!${NC}"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 [unit|integration|all]"
    echo "  unit       - Run only unit tests"
    echo "  integration - Run only integration tests"
    echo "  all        - Run all tests (default)"
    exit 1
    ;;
esac
