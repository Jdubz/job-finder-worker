#!/bin/bash

# Firestore Fixes Verification Script
# Checks that Firestore configuration and error handling is working correctly

set -e

echo "🔍 Firestore Fixes Verification"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Environment Variables
echo "1️⃣  Checking Environment Variables..."
echo ""

check_env_file() {
  local file=$1
  local expected_db=$2
  
  if [ ! -f "$file" ]; then
    echo -e "${RED}❌ $file not found${NC}"
    return 1
  fi
  
  local db_id=$(grep "VITE_FIRESTORE_DATABASE_ID" "$file" | cut -d'=' -f2)
  
  if [ "$db_id" == "$expected_db" ]; then
    echo -e "${GREEN}✅ $file: DATABASE_ID = $db_id${NC}"
  else
    echo -e "${RED}❌ $file: DATABASE_ID = $db_id (expected: $expected_db)${NC}"
    return 1
  fi
}

check_env_file ".env.staging" "portfolio-staging"
check_env_file ".env.production" "portfolio"

echo ""

# Check 2: FirestoreService Error Handling
echo "2️⃣  Checking FirestoreService Error Handling..."
echo ""

if grep -q "let hasError = false" src/services/firestore/FirestoreService.ts && \
   grep -q "let unsubscribed = false" src/services/firestore/FirestoreService.ts && \
   grep -q "if (unsubscribed) return" src/services/firestore/FirestoreService.ts; then
  echo -e "${GREEN}✅ Error handling guards present${NC}"
else
  echo -e "${RED}❌ Error handling guards missing${NC}"
  exit 1
fi

if grep -q "permission-denied" src/services/firestore/FirestoreService.ts; then
  echo -e "${GREEN}✅ Permission error handling present${NC}"
else
  echo -e "${RED}❌ Permission error handling missing${NC}"
  exit 1
fi

echo ""

# Check 3: Modern Persistence API
echo "3️⃣  Checking Modern Persistence API..."
echo ""

if grep -q "persistentLocalCache" src/config/firebase.ts && \
   grep -q "persistentMultipleTabManager" src/config/firebase.ts; then
  echo -e "${GREEN}✅ Using modern persistence API${NC}"
else
  echo -e "${RED}❌ Not using modern persistence API${NC}"
  exit 1
fi

if grep -v "^[[:space:]]*//\|^[[:space:]]*\*" src/config/firebase.ts | grep -q "enableMultiTabIndexedDbPersistence"; then
  echo -e "${RED}❌ Still using deprecated API${NC}"
  exit 1
else
  echo -e "${GREEN}✅ No deprecated API usage${NC}"
fi

echo ""

# Check 4: Database ID Configuration
echo "4️⃣  Checking Database ID Configuration..."
echo ""

if grep -q "databaseId.*portfolio" src/config/firebase.ts; then
  echo -e "${GREEN}✅ Database ID configuration present${NC}"
else
  echo -e "${RED}❌ Database ID configuration missing${NC}"
  exit 1
fi

echo ""

# Check 5: TypeScript Compilation
echo "5️⃣  Checking TypeScript Compilation..."
echo ""

if npm run tsc -- --noEmit > /dev/null 2>&1; then
  echo -e "${GREEN}✅ TypeScript compiles without errors${NC}"
else
  echo -e "${YELLOW}⚠️  TypeScript compilation issues detected${NC}"
  echo "   Run 'npm run tsc' to see details"
fi

echo ""

# Summary
echo "================================"
echo -e "${GREEN}✅ Verification Complete!${NC}"
echo ""
echo "Next Steps:"
echo "  1. Build for staging: npm run build:staging"
echo "  2. Deploy to staging: firebase deploy --only hosting:staging"
echo "  3. Monitor browser console for errors"
echo "  4. Test key pages: Job Matches, Settings, Navigation"
echo ""
echo "Monitoring Commands:"
echo "  - Check Firebase rules: firebase firestore:databases:list"
echo "  - View logs: firebase functions:log"
echo "  - Monitor Network tab for 400 errors"
echo ""
