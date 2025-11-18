#!/bin/bash
set -e

PRODUCTION_URL="https://us-central1-static-sites-257923.cloudfunctions.net"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "PRODUCTION SMOKE TESTS"
echo "========================================="
echo ""
echo -e "${RED}⚠️  Running against PRODUCTION environment${NC}"
echo -e "${YELLOW}URL: $PRODUCTION_URL${NC}"
echo ""

# Check if AUTH_TOKEN is set
if [ -z "$PRODUCTION_AUTH_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  PRODUCTION_AUTH_TOKEN not set${NC}"
  echo "Some tests require authentication and will be skipped."
  echo "To run full tests: export PRODUCTION_AUTH_TOKEN=<your-token>"
  echo ""
fi

FAILED_TESTS=0
PASSED_TESTS=0

# Test 1: manageJobQueue - Health check (unauthenticated endpoint)
echo "Test 1: Job Queue Function Availability..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$PRODUCTION_URL/manageJobQueue" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
  echo -e "${GREEN}✓ manageJobQueue is reachable (HTTP $HTTP_CODE)${NC}"
  ((PASSED_TESTS++))
else
  echo -e "${RED}✗ manageJobQueue failed (HTTP $HTTP_CODE)${NC}"
  ((FAILED_TESTS++))
fi
echo ""

# Test 2: manageGenerator - Health check
echo "Test 2: Generator Function Availability..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$PRODUCTION_URL/manageGenerator" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
  echo -e "${GREEN}✓ manageGenerator is reachable (HTTP $HTTP_CODE)${NC}"
  ((PASSED_TESTS++))
else
  echo -e "${RED}✗ manageGenerator failed (HTTP $HTTP_CODE)${NC}"
  ((FAILED_TESTS++))
fi
echo ""

# Test 3: uploadResume - Health check
echo "Test 3: Resume Upload Function Availability..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$PRODUCTION_URL/uploadResume" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
  echo -e "${GREEN}✓ uploadResume is reachable (HTTP $HTTP_CODE)${NC}"
  ((PASSED_TESTS++))
else
  echo -e "${RED}✗ uploadResume failed (HTTP $HTTP_CODE)${NC}"
  ((FAILED_TESTS++))
fi
echo ""

# Test 4: manageContentItems - Health check
echo "Test 4: Content Items Function Availability..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$PRODUCTION_URL/manageContentItems" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
  echo -e "${GREEN}✓ manageContentItems is reachable (HTTP $HTTP_CODE)${NC}"
  ((PASSED_TESTS++))
else
  echo -e "${RED}✗ manageContentItems failed (HTTP $HTTP_CODE)${NC}"
  ((FAILED_TESTS++))
fi
echo ""

# Test 5: manageExperience - Health check
echo "Test 5: Experience Function Availability..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$PRODUCTION_URL/manageExperience" 2>&1 || echo "000")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
  echo -e "${GREEN}✓ manageExperience is reachable (HTTP $HTTP_CODE)${NC}"
  ((PASSED_TESTS++))
else
  echo -e "${RED}✗ manageExperience failed (HTTP $HTTP_CODE)${NC}"
  ((FAILED_TESTS++))
fi
echo ""

# Authenticated tests (if token available)
if [ -n "$PRODUCTION_AUTH_TOKEN" ]; then
  echo "Running authenticated tests..."
  echo ""

  # Test 6: Content Items GET (authenticated)
  echo "Test 6: Content Items GET (authenticated)..."
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $PRODUCTION_AUTH_TOKEN" \
    "$PRODUCTION_URL/manageContentItems" 2>&1 || echo "000")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Authenticated content retrieval successful${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ Authenticated content retrieval failed (HTTP $HTTP_CODE)${NC}"
    ((FAILED_TESTS++))
  fi
  echo ""

  # Test 7: Experience GET (authenticated)
  echo "Test 7: Experience GET (authenticated)..."
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $PRODUCTION_AUTH_TOKEN" \
    "$PRODUCTION_URL/manageExperience" 2>&1 || echo "000")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Authenticated experience retrieval successful${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ Authenticated experience retrieval failed (HTTP $HTTP_CODE)${NC}"
    ((FAILED_TESTS++))
  fi
  echo ""
fi

# Summary
echo "========================================="
TOTAL_TESTS=$((PASSED_TESTS + FAILED_TESTS))

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED ($PASSED_TESTS/$TOTAL_TESTS)${NC}"
  echo "========================================="
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
  echo -e "${RED}Failed: $FAILED_TESTS${NC}"
  echo "========================================="
  echo ""
  echo "Check function logs for details:"
  echo "  gcloud functions logs read --project=static-sites-257923 --limit=50"
  exit 1
fi
