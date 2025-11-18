#!/bin/bash
set -e

echo "========================================="
echo "PRODUCTION DEPLOYMENT"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Pre-deployment confirmation
echo -e "${YELLOW}Pre-Deployment Checks${NC}"
echo ""
read -p "Have you completed all staging tests? (yes/no): " staging_confirm
if [ "$staging_confirm" != "yes" ]; then
  echo -e "${RED}❌ Please complete staging tests first${NC}"
  exit 1
fi

read -p "Have you backed up production data? (yes/no): " backup_confirm
if [ "$backup_confirm" != "yes" ]; then
  echo -e "${RED}❌ Please backup production data first${NC}"
  echo "Run: ./scripts/backup-production.sh"
  exit 1
fi

read -p "Are stakeholders notified of this deployment? (yes/no): " stakeholder_confirm
if [ "$stakeholder_confirm" != "yes" ]; then
  echo -e "${RED}❌ Please notify stakeholders first${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Pre-deployment checks confirmed${NC}"
echo ""

# Pre-deployment validation
echo "Step 1: Running pre-deployment validation..."
echo ""

echo "  Running linter..."
npm run lint || {
  echo -e "${RED}❌ Linter failed${NC}"
  exit 1
}
echo -e "${GREEN}  ✓ Linter passed${NC}"

echo "  Running tests..."
npm test || {
  echo -e "${RED}❌ Tests failed${NC}"
  exit 1
}
echo -e "${GREEN}  ✓ Tests passed${NC}"

echo "  Building functions..."
npm run build || {
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
}
echo -e "${GREEN}  ✓ Build successful${NC}"
echo ""

# Deployment
echo "Step 2: Deploying to production..."
echo ""

# The deployment is handled by merging staging to main, which triggers CI/CD
echo -e "${YELLOW}To complete deployment:${NC}"
echo "1. Review the staging branch: git diff main staging"
echo "2. Merge staging to main: git checkout main && git merge staging"
echo "3. Push to trigger CI/CD: git push origin main"
echo ""
echo "The CI/CD pipeline will automatically deploy all functions to production."
echo ""

read -p "Do you want to proceed with merging staging to main? (yes/no): " merge_confirm
if [ "$merge_confirm" != "yes" ]; then
  echo -e "${YELLOW}Deployment cancelled. You can manually merge when ready.${NC}"
  exit 0
fi

echo ""
echo "Merging staging to main..."

# Save current branch
CURRENT_BRANCH=$(git branch --show-current)

# Checkout main and merge
git checkout main
git merge staging --no-edit || {
  echo -e "${RED}❌ Merge failed. Please resolve conflicts manually.${NC}"
  git checkout "$CURRENT_BRANCH"
  exit 1
}

echo -e "${GREEN}✓ Merged staging to main${NC}"
echo ""

# Push to trigger deployment
echo "Pushing to origin/main to trigger production deployment..."
git push origin main || {
  echo -e "${RED}❌ Push failed${NC}"
  git checkout "$CURRENT_BRANCH"
  exit 1
}

echo -e "${GREEN}✓ Push successful${NC}"
echo ""

# Return to original branch
git checkout "$CURRENT_BRANCH"

echo "========================================="
echo -e "${GREEN}✅ PRODUCTION DEPLOYMENT INITIATED${NC}"
echo "========================================="
echo ""
echo "CI/CD is now deploying to production."
echo ""
echo "Next steps:"
echo "1. Monitor GitHub Actions: https://github.com/Jdubz/job-finder-BE/actions"
echo "2. Wait for deployment to complete (~5-10 minutes)"
echo "3. Run production smoke tests: ./scripts/smoke-tests-production.sh"
echo "4. Monitor logs for 1-2 hours"
echo "5. Verify frontend integration"
echo "6. Update documentation"
echo ""
echo "If issues arise, run: ./scripts/rollback-production.sh"
echo ""
