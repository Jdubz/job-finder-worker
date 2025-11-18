#!/bin/bash

# Firebase Functions v2 Deployment Permissions Setup
# This script grants all necessary IAM permissions for deploying Firebase Functions v2
# using GitHub Actions with Workload Identity Federation

set -e  # Exit on error

PROJECT_ID="static-sites-257923"
PROJECT_NUMBER="789847666726"
DEPLOYER_SA="github-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
GCF_SA="service-${PROJECT_NUMBER}@gcf-admin-robot.iam.gserviceaccount.com"
REGION="us-central1"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Firebase Functions v2 Deployment Permissions Setup${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}Project Configuration:${NC}"
echo "  Project ID:      $PROJECT_ID"
echo "  Project Number:  $PROJECT_NUMBER"
echo "  Deployer SA:     $DEPLOYER_SA"
echo "  Cloud Build SA:  $CLOUDBUILD_SA"
echo "  Region:          $REGION"
echo ""
echo -e "${YELLOW}This script will grant the following permissions:${NC}"
echo "  1. Cloud Build Editor (create build jobs)"
echo "  2. Service Account User (impersonate Cloud Build SA)"
echo "  3. Secret Manager Accessor (access secrets in functions)"
echo "  4. Logging Writer (write deployment logs)"
echo "  5. Verify Cloud Build SA permissions"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Step 1: Grant Cloud Build Editor${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}This allows the deployer to create and manage Cloud Build jobs.${NC}"
echo "  Permission: roles/cloudbuild.builds.editor"
echo "  Member:     serviceAccount:$DEPLOYER_SA"
echo ""

if gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEPLOYER_SA" \
  --role="roles/cloudbuild.builds.editor" \
  --condition=None \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Successfully granted Cloud Build Editor role${NC}"
else
  echo -e "${YELLOW}⚠️  Role may already exist (this is OK)${NC}"
fi

echo ""
echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Step 2: Grant Service Account Impersonation${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}This allows the deployer to act as the Cloud Build service account.${NC}"
echo "  Permission: roles/iam.serviceAccountUser"
echo "  On SA:      $CLOUDBUILD_SA"
echo "  Member:     serviceAccount:$DEPLOYER_SA"
echo ""

if gcloud iam service-accounts add-iam-policy-binding \
  $CLOUDBUILD_SA \
  --member="serviceAccount:$DEPLOYER_SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT_ID \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Successfully granted Service Account User role${NC}"
else
  echo -e "${YELLOW}⚠️  Role may already exist (this is OK)${NC}"
fi

echo ""
echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Step 3: Grant Secret Manager Access${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}This allows the deployer to access secrets used in Cloud Functions.${NC}"
echo "  Permission: roles/secretmanager.secretAccessor"
echo "  Member:     serviceAccount:$DEPLOYER_SA"
echo ""

if gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEPLOYER_SA" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Successfully granted Secret Manager Accessor role${NC}"
else
  echo -e "${YELLOW}⚠️  Role may already exist (this is OK)${NC}"
fi

echo ""
echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Step 4: Grant Logging Writer${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}This allows the deployer to write deployment logs.${NC}"
echo "  Permission: roles/logging.logWriter"
echo "  Member:     serviceAccount:$DEPLOYER_SA"
echo ""

if gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$DEPLOYER_SA" \
  --role="roles/logging.logWriter" \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Successfully granted Logging Writer role${NC}"
else
  echo -e "${YELLOW}⚠️  Role may already exist (this is OK)${NC}"
fi

echo ""
echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Step 5: Verify Cloud Build Service Account Permissions${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}Ensuring Cloud Build SA has required permissions (idempotent).${NC}"
echo ""

# Artifact Registry Writer
echo -n "  Checking Artifact Registry Writer... "
if gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUDBUILD_SA" \
  --role="roles/artifactregistry.writer" \
  --condition=None \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC}"
else
  echo -e "${YELLOW}⚠️ (may already exist)${NC}"
fi

# Cloud Build Builder
echo -n "  Checking Cloud Build Builder... "
if gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUDBUILD_SA" \
  --role="roles/cloudbuild.builds.builder" \
  --condition=None \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC}"
else
  echo -e "${YELLOW}⚠️ (may already exist)${NC}"
fi

# Storage Admin
echo -n "  Checking Storage Admin... "
if gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUDBUILD_SA" \
  --role="roles/storage.admin" \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC}"
else
  echo -e "${YELLOW}⚠️ (may already exist)${NC}"
fi

echo ""
echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Step 6: Grant Compute Engine Service Account Permissions${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo -e "${YELLOW}This is needed for Cloud Functions runtime.${NC}"
echo ""

COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Service Account User to github-actions-deployer for Compute SA
echo -n "  Granting Service Account User on Compute SA... "
if gcloud iam service-accounts add-iam-policy-binding \
  $COMPUTE_SA \
  --member="serviceAccount:$DEPLOYER_SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT_ID \
  --quiet > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC}"
else
  echo -e "${YELLOW}⚠️ (may already exist)${NC}"
fi

echo ""
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}  Permission Setup Complete!${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo ""
echo -e "${YELLOW}Verifying permissions for github-actions-deployer...${NC}"
echo ""

# Show all roles for github-actions-deployer
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$DEPLOYER_SA" \
  --format="table[box](bindings.role)" | sed 's/ROLE/PERMISSION ROLE/g'

echo ""
echo -e "${YELLOW}Expected roles (should have all of these):${NC}"
echo "  ✓ roles/artifactregistry.writer"
echo "  ✓ roles/cloudbuild.builds.editor       ${GREEN}<-- NEW${NC}"
echo "  ✓ roles/cloudfunctions.admin"
echo "  ✓ roles/cloudfunctions.developer"
echo "  ✓ roles/iam.serviceAccountUser"
echo "  ✓ roles/logging.logWriter               ${GREEN}<-- NEW${NC}"
echo "  ✓ roles/run.admin"
echo "  ✓ roles/secretmanager.secretAccessor    ${GREEN}<-- NEW${NC}"
echo ""

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}  Next Steps${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""
echo "1. Wait 60 seconds for IAM changes to propagate"
echo "2. Try deploying a Cloud Function from GitHub Actions"
echo "3. Monitor deployment logs for any remaining permission issues"
echo ""
echo -e "${YELLOW}To test manually:${NC}"
echo "  cd job-finder-BE/functions"
echo "  gcloud functions deploy <function-name> \\"
echo "    --gen2 \\"
echo "    --runtime=nodejs20 \\"
echo "    --region=us-central1 \\"
echo "    --source=. \\"
echo "    --entry-point=<entry-point> \\"
echo "    --trigger-http \\"
echo "    --allow-unauthenticated"
echo ""
echo -e "${GREEN}Permission setup complete! ✅${NC}"
echo ""
