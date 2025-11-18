#!/bin/bash
#
# Export content-items from production Firestore
#
# This script uses gcloud CLI to export content-items from production
# Then you can import them to the local emulator
#
# Prerequisites:
# 1. gcloud CLI installed: https://cloud.google.com/sdk/docs/install
# 2. Authenticated: gcloud auth login
# 3. Project set: gcloud config set project static-sites-257923
#

set -e

PROJECT_ID="static-sites-257923"
DATABASE_ID="portfolio"
EXPORT_DIR="$(pwd)/.firebase/production-export"
COLLECTION="content-items"

echo "🌐 Exporting content-items from production..."
echo "   Project: $PROJECT_ID"
echo "   Database: $DATABASE_ID"
echo "   Collection: $COLLECTION"
echo ""

# Create export directory
mkdir -p "$EXPORT_DIR"

# Export using gcloud (requires gcloud CLI and authentication)
if command -v gcloud &> /dev/null; then
  echo "📦 Using gcloud to export..."
  
  # Export specific collection
  gcloud firestore export "gs://${PROJECT_ID}-firestore-export/content-items-$(date +%Y%m%d)" \
    --database="$DATABASE_ID" \
    --collection-ids="$COLLECTION" \
    --project="$PROJECT_ID"
  
  echo ""
  echo "✅ Export initiated!"
  echo "   This may take a few minutes..."
  echo "   Check status at: https://console.firebase.google.com/project/$PROJECT_ID/firestore"
  echo ""
  echo "📥 After export completes, download and import:"
  echo "   1. Download export from Cloud Storage"
  echo "   2. Extract to $EXPORT_DIR"
  echo "   3. Run: firebase emulators:start --import=$EXPORT_DIR"
  
else
  echo "❌ Error: gcloud CLI not found"
  echo ""
  echo "📝 Manual Export Instructions:"
  echo ""
  echo "1. Go to Firebase Console:"
  echo "   https://console.firebase.google.com/project/$PROJECT_ID/firestore"
  echo ""
  echo "2. Click 'Import/Export' tab"
  echo ""  
  echo "3. Click 'Export' button"
  echo ""
  echo "4. Select 'content-items' collection"
  echo ""
  echo "5. Choose export location (Cloud Storage bucket)"
  echo ""
  echo "6. After export, download the files"
  echo ""
  echo "7. Extract to: $EXPORT_DIR"
  echo ""
  echo "8. Import to emulator:"
  echo "   firebase emulators:start --import=$EXPORT_DIR"
  echo ""
  exit 1
fi

