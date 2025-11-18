#!/bin/bash
set -e

PROJECT_ID="static-sites-257923"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
DATABASE_ID="portfolio"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "PRODUCTION DATA BACKUP"
echo "========================================="
echo ""
echo -e "${YELLOW}Project: $PROJECT_ID${NC}"
echo -e "${YELLOW}Database: $DATABASE_ID${NC}"
echo -e "${YELLOW}Backup directory: $BACKUP_DIR${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup Firestore data
echo "Step 1: Backing up Firestore data..."
echo "This may take several minutes depending on data size..."

# Export to GCS bucket
EXPORT_PREFIX="backups/manual/$(date +%Y%m%d_%H%M%S)"
gcloud firestore export "gs://${PROJECT_ID}.appspot.com/${EXPORT_PREFIX}" \
  --project="$PROJECT_ID" \
  --database="$DATABASE_ID" || {
  echo -e "${RED}❌ Firestore export failed${NC}"
  exit 1
}

echo -e "${GREEN}✓ Firestore data exported to GCS${NC}"
echo "  Location: gs://${PROJECT_ID}.appspot.com/${EXPORT_PREFIX}"
echo ""

# Save current function configurations
echo "Step 2: Backing up function configurations..."
gcloud functions list \
  --project="$PROJECT_ID" \
  --format=json > "$BACKUP_DIR/functions.json" || {
  echo "Warning: Could not backup function configurations"
}
echo -e "${GREEN}✓ Function configurations saved${NC}"
echo ""

# Save Firestore rules and indexes
echo "Step 3: Backing up Firestore configuration..."
if [ -f "firestore.rules" ]; then
  cp firestore.rules "$BACKUP_DIR/"
  echo -e "${GREEN}✓ Firestore rules saved${NC}"
fi

if [ -f "firestore.indexes.json" ]; then
  cp firestore.indexes.json "$BACKUP_DIR/"
  echo -e "${GREEN}✓ Firestore indexes saved${NC}"
fi
echo ""

# Save storage rules
echo "Step 4: Backing up storage rules..."
if [ -f "storage.rules" ]; then
  cp storage.rules "$BACKUP_DIR/"
  echo -e "${GREEN}✓ Storage rules saved${NC}"
fi
echo ""

# Save package.json for dependency tracking
echo "Step 5: Saving dependency information..."
cp package.json "$BACKUP_DIR/"
cp package-lock.json "$BACKUP_DIR/" 2>/dev/null || true
echo -e "${GREEN}✓ Dependencies saved${NC}"
echo ""

# Create backup manifest
echo "Step 6: Creating backup manifest..."
cat > "$BACKUP_DIR/MANIFEST.txt" <<EOF
Production Backup Manifest
==========================

Created: $(date)
Project: $PROJECT_ID
Database: $DATABASE_ID

GCS Firestore Export:
  gs://${PROJECT_ID}.appspot.com/${EXPORT_PREFIX}

Local Backup Files:
EOF

ls -lh "$BACKUP_DIR" >> "$BACKUP_DIR/MANIFEST.txt"

echo -e "${GREEN}✓ Manifest created${NC}"
echo ""

echo "========================================="
echo -e "${GREEN}✅ BACKUP COMPLETE${NC}"
echo "========================================="
echo ""
echo "Backup location: $BACKUP_DIR"
echo "GCS export: gs://${PROJECT_ID}.appspot.com/${EXPORT_PREFIX}"
echo ""
echo "To restore from this backup:"
echo "  Firestore: gcloud firestore import gs://${PROJECT_ID}.appspot.com/${EXPORT_PREFIX}"
echo "  Rules: firebase deploy --only firestore:rules,storage"
echo ""
