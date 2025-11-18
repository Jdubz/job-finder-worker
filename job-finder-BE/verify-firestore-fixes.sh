#!/bin/bash

# Firestore Health Check Script
# Verifies that the Firestore fixes are working correctly

echo "🔍 Firestore Health Check"
echo "========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_passed=0
check_failed=0

# Function to print check result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        ((check_passed++))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        ((check_failed++))
    fi
}

echo "1. Checking Firestore configuration files..."
echo ""

# Check if firestore.rules exists
if [ -f "firestore.rules" ]; then
    print_result 0 "firestore.rules exists"
else
    print_result 1 "firestore.rules not found"
fi

# Check if firestore.indexes.json exists
if [ -f "firestore.indexes.json" ]; then
    print_result 0 "firestore.indexes.json exists"
else
    print_result 1 "firestore.indexes.json not found"
fi

# Validate JSON syntax
if command -v python3 >/dev/null 2>&1; then
    if python3 -m json.tool firestore.indexes.json > /dev/null 2>&1; then
        print_result 0 "firestore.indexes.json is valid JSON"
    else
        print_result 1 "firestore.indexes.json has invalid JSON syntax"
    fi
else
    print_result 1 "python3 is not installed; cannot validate firestore.indexes.json syntax"
fi

echo ""
echo "2. Checking index completeness..."
echo ""

expected_index_count="${EXPECTED_INDEX_COUNT:-8}"
if [ $# -ge 1 ]; then
    expected_index_count="$1"
fi

# Count indexes
jq_available=1
if command -v jq >/dev/null 2>&1; then
    index_count=$(jq '.indexes | length' firestore.indexes.json 2>/dev/null || echo "0")
else
    jq_available=0
fi

if [ "$jq_available" -eq 1 ]; then
    if [ "$index_count" -ge "$expected_index_count" ]; then
        print_result 0 "Found $index_count indexes (expected >= $expected_index_count)"
    else
        print_result 1 "Found only $index_count indexes (expected >= $expected_index_count)"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping index count threshold check because jq is unavailable${NC}"
fi

# Check for critical indexes
critical_indexes=(
    "job-queue"
    "content-items"
    "generator-documents"
    "experiences"
)

for collection in "${critical_indexes[@]}"; do
    if grep -q "\"$collection\"" firestore.indexes.json; then
        print_result 0 "Indexes for $collection collection found"
    else
        print_result 1 "No indexes for $collection collection"
    fi
done

echo ""
echo "3. Checking Firebase configuration..."
echo ""

# Check firebase.json
if [ -f "firebase.json" ]; then
    print_result 0 "firebase.json exists"
    
    # Check for database configurations
    if grep -q "portfolio-staging" firebase.json && grep -q "portfolio" firebase.json; then
        print_result 0 "Both staging and production databases configured"
    else
        print_result 1 "Missing database configurations"
    fi
else
    print_result 1 "firebase.json not found"
fi

echo ""
echo "4. Checking Firebase CLI and tooling..."
echo ""

if command -v firebase &> /dev/null; then
    print_result 0 "Firebase CLI is installed"
    
    # Check if logged in
    if firebase projects:list &> /dev/null; then
        print_result 0 "Logged in to Firebase"
    else
        print_result 1 "Not logged in to Firebase (run: firebase login)"
    fi
else
    print_result 1 "Firebase CLI not installed (run: npm install -g firebase-tools)"
fi

if command -v jq >/dev/null 2>&1; then
    print_result 0 "jq is installed"
else
    print_result 1 "jq is not installed. Please install jq to continue."
    jq_available=0
fi

echo ""
echo "5. Checking frontend code..."
echo ""

FE_DIR="${JOB_FINDER_FE_DIR:-../job-finder-FE}"

if [ ! -d "$FE_DIR" ]; then
    print_result 1 "Frontend directory not found at $FE_DIR (override with JOB_FINDER_FE_DIR)"
else
    # Check if reference counting was added to types
    if [ -f "$FE_DIR/src/services/firestore/types.ts" ]; then
        if grep -q "subscriberCount" "$FE_DIR/src/services/firestore/types.ts"; then
            print_result 0 "Reference counting types added"
        else
            print_result 1 "Reference counting types missing"
        fi
    else
        print_result 1 "Firestore types file not found"
    fi

    # Check if persistence was added to firebase.ts
    if [ -f "$FE_DIR/src/config/firebase.ts" ]; then
        if grep -q "enableIndexedDbPersistence\|enableMultiTabIndexedDbPersistence" "$FE_DIR/src/config/firebase.ts"; then
            print_result 0 "Offline persistence configured"
        else
            print_result 1 "Offline persistence not configured"
        fi
    else
        print_result 1 "Firebase config file not found"
    fi

    # Check if FirestoreContext was updated
    if [ -f "$FE_DIR/src/contexts/FirestoreContext.tsx" ]; then
        if grep -q "subscriberCount" "$FE_DIR/src/contexts/FirestoreContext.tsx"; then
            print_result 0 "FirestoreContext reference counting implemented"
        else
            print_result 1 "FirestoreContext reference counting missing"
        fi
    else
        print_result 1 "FirestoreContext file not found"
    fi
fi

echo ""
echo "========================="
echo "Summary"
echo "========================="
echo -e "${GREEN}Passed: $check_passed${NC}"
echo -e "${RED}Failed: $check_failed${NC}"
echo ""

if [ $check_failed -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready to deploy.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. cd /path/to/job-finder-BE"
    echo "  2. ./deploy-firestore-config.sh"
    echo "  3. cd ../job-finder-FE"
    echo "  4. npm run build && npm run deploy:staging"
    echo "  5. Test in staging, then deploy to production"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some checks failed. Please fix the issues above.${NC}"
    exit 1
fi
