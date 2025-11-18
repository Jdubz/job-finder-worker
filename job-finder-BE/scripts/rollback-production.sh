#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo -e "${RED}⚠️  PRODUCTION ROLLBACK${NC}"
echo "========================================="
echo ""
echo -e "${YELLOW}WARNING: This will revert production to the previous version${NC}"
echo ""

read -p "Are you sure you want to rollback production? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

echo ""
echo "Initiating rollback..."
echo ""

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Checkout main
echo "Step 1: Checking out main branch..."
git checkout main

# Get the previous commit
echo "Step 2: Finding previous deployment..."
PREVIOUS_COMMIT=$(git log --skip=1 --max-count=1 --format="%H")
echo "Previous commit: $PREVIOUS_COMMIT"
echo ""

# Show what will be rolled back
echo "Rollback will revert these changes:"
git log --oneline -1 HEAD
echo "↓"
git log --oneline -1 "$PREVIOUS_COMMIT"
echo ""

read -p "Proceed with rollback to $PREVIOUS_COMMIT? (yes/no): " proceed

if [ "$proceed" != "yes" ]; then
  echo "Rollback cancelled"
  git checkout "$CURRENT_BRANCH"
  exit 0
fi

# Create rollback commit
echo ""
echo "Step 3: Creating rollback commit..."
git revert HEAD --no-edit || {
  echo -e "${RED}❌ Rollback failed${NC}"
  echo "Manual intervention required"
  exit 1
}

echo -e "${GREEN}✓ Rollback commit created${NC}"
echo ""

# Push to trigger deployment
echo "Step 4: Pushing rollback to production..."
git push origin main || {
  echo -e "${RED}❌ Push failed${NC}"
  exit 1
}

echo -e "${GREEN}✓ Rollback pushed${NC}"
echo ""

# Return to original branch
git checkout "$CURRENT_BRANCH"

echo "========================================="
echo -e "${GREEN}✅ ROLLBACK INITIATED${NC}"
echo "========================================="
echo ""
echo "CI/CD is now deploying the rollback."
echo ""
echo "Next steps:"
echo "1. Monitor GitHub Actions: https://github.com/Jdubz/job-finder-BE/actions"
echo "2. Wait for deployment to complete (~5-10 minutes)"
echo "3. Run production smoke tests: ./scripts/smoke-tests-production.sh"
echo "4. Verify system functionality"
echo "5. Investigate root cause of the issue"
echo ""
