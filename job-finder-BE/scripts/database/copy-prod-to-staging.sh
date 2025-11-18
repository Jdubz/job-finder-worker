#!/bin/bash

###############################################################################
# Copy Production Firestore to Staging
#
# This script exports Firestore data from production and imports it to staging.
#
# Prerequisites:
#   - gcloud CLI authenticated and configured
#   - Sufficient permissions for both production and staging projects
#   - gsutil for managing Cloud Storage
#
# Usage:
#   bash scripts/database/copy-prod-to-staging.sh [-y|--yes]
#
# Options:
#   -y, --yes    Auto-confirm all prompts (useful for non-interactive execution)
#
# Note:
#   The script automatically detects non-interactive execution (e.g., from
#   dev-monitor) and will auto-confirm prompts without requiring the -y flag.
###############################################################################

set -e  # Exit on error

# Detect non-interactive execution (when run via dev-monitor or CI)
if [ -t 0 ]; then
  INTERACTIVE=true
else
  INTERACTIVE=false
  echo "ℹ️  Running in non-interactive mode - auto-confirming all prompts"
fi

# Parse arguments
AUTO_CONFIRM=false
for arg in "$@"; do
  case $arg in
    -y|--yes)
      AUTO_CONFIRM=true
      shift
      ;;
  esac
done

# Configuration
PROD_PROJECT_ID="${PROD_PROJECT_ID:-static-sites-257923}"
STAGING_PROJECT_ID="${STAGING_PROJECT_ID:-static-sites-257923}"
PROD_DATABASE="${PROD_DATABASE_NAME:-portfolio}"
STAGING_DATABASE="${STAGING_DATABASE_NAME:-portfolio-staging}"
BUCKET_NAME="${FIRESTORE_BACKUP_BUCKET:-${STAGING_PROJECT_ID}-firestore-backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="gs://${BUCKET_NAME}/prod-to-staging-${TIMESTAMP}"

echo "🔄 Copying Firestore from Production to Staging"
echo "================================================"
echo "Production Project: ${PROD_PROJECT_ID}"
echo "Production Database: ${PROD_DATABASE}"
echo "Staging Project: ${STAGING_PROJECT_ID}"
echo "Staging Database: ${STAGING_DATABASE}"
echo "Backup Bucket: gs://${BUCKET_NAME}"
echo ""

# Step 1: Verify bucket exists or create it
echo "📦 Checking backup bucket..."
if ! gsutil ls -p "${STAGING_PROJECT_ID}" "gs://${BUCKET_NAME}" &>/dev/null; then
  echo "  Creating backup bucket: gs://${BUCKET_NAME}"
  gsutil mb -p "${STAGING_PROJECT_ID}" -l us-central1 "gs://${BUCKET_NAME}"
  echo "  ✓ Bucket created"
else
  echo "  ✓ Bucket exists"
fi

# Step 2: Export production database
echo ""
echo "📤 Exporting production database..."
echo "  Database: ${PROD_DATABASE}"
echo "  Destination: ${BACKUP_PATH}"

gcloud firestore export "${BACKUP_PATH}" \
  --project="${PROD_PROJECT_ID}" \
  --database="${PROD_DATABASE}" \
  --async

echo "  ⏳ Waiting for export to complete..."
sleep 5  # Give it a moment to start

# Poll for export completion
while true; do
  EXPORT_STATE=$(gcloud firestore operations list \
    --project="${PROD_PROJECT_ID}" \
    --database="${PROD_DATABASE}" \
    --filter="RUNNING" \
    --format="value(name)" \
    --limit=1)

  if [ -z "${EXPORT_STATE}" ]; then
    echo "  ✓ Export completed"
    break
  fi

  echo "  Still exporting... (checking again in 10s)"
  sleep 10
done

# Step 3: Import to staging database
echo ""
echo "📥 Importing to staging database..."
echo "  Database: ${STAGING_DATABASE}"
echo "  Source: ${BACKUP_PATH}"

echo "  ⚠️  WARNING: This will OVERWRITE all data in staging database: ${STAGING_DATABASE}"

if [ "$INTERACTIVE" = true ] && [ "$AUTO_CONFIRM" = false ]; then
  read -p "  Continue? (yes/no): " -r CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    echo "  ❌ Import cancelled by user"
    exit 1
  fi
else
  echo "  ✓ Auto-confirming import (non-interactive mode)"
fi

gcloud firestore import "${BACKUP_PATH}" \
  --project="${STAGING_PROJECT_ID}" \
  --database="${STAGING_DATABASE}" \
  --async

echo "  ⏳ Waiting for import to complete..."
sleep 5

# Poll for import completion
while true; do
  IMPORT_STATE=$(gcloud firestore operations list \
    --project="${STAGING_PROJECT_ID}" \
    --database="${STAGING_DATABASE}" \
    --filter="RUNNING" \
    --format="value(name)" \
    --limit=1)

  if [ -z "${IMPORT_STATE}" ]; then
    echo "  ✓ Import completed"
    break
  fi

  echo "  Still importing... (checking again in 10s)"
  sleep 10
done

# Step 4: Cleanup (optional)
echo ""
echo "🧹 Cleanup Options"
echo "  Backup stored at: ${BACKUP_PATH}"

if [ "$INTERACTIVE" = true ] && [ "$AUTO_CONFIRM" = false ]; then
  read -p "  Delete backup to save storage costs? (yes/no): " -r DELETE_BACKUP
else
  DELETE_BACKUP="yes"
  echo "  ✓ Auto-confirming backup deletion (non-interactive mode)"
fi

if [ "${DELETE_BACKUP}" = "yes" ]; then
  echo "  Deleting backup..."
  gsutil -m rm -r "${BACKUP_PATH}"
  echo "  ✓ Backup deleted"
else
  echo "  ℹ️  Backup retained. You can delete it manually with:"
  echo "     gsutil -m rm -r ${BACKUP_PATH}"
fi

echo ""
echo "✅ Production database successfully copied to staging!"
echo ""
echo "Summary:"
echo "  Source: ${PROD_PROJECT_ID}/${PROD_DATABASE}"
echo "  Destination: ${STAGING_PROJECT_ID}/${STAGING_DATABASE}"
echo "  Backup: ${BACKUP_PATH}"
echo ""
