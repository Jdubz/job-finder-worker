#!/bin/bash

# Start Firebase Emulators with Persistence
# This script starts emulators (auth, firestore, functions, storage, ui) with data persistence enabled
# NOTE: Hosting emulator is explicitly excluded - not needed for backend development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXPORT_DIR="$PROJECT_ROOT/.firebase/emulator-data"

echo "🔥 Starting Firebase Emulators with Persistence"
echo "   Export/Import directory: $EXPORT_DIR"
echo ""

cd "$PROJECT_ROOT"

# Check if export directory exists
if [ ! -d "$EXPORT_DIR" ]; then
  echo "⚠️  Creating export directory: $EXPORT_DIR"
  mkdir -p "$EXPORT_DIR"
fi

# Check if we have existing data to import
if [ -d "$EXPORT_DIR/firestore_export" ] || [ -d "$EXPORT_DIR/auth_export" ]; then
  echo "✅ Found existing emulator data - will import on startup"
  firebase emulators:start \
    --only auth,firestore,functions,storage,ui \
    --import="$EXPORT_DIR" \
    --export-on-exit="$EXPORT_DIR"
else
  echo "ℹ️  No existing data found - starting fresh"
  firebase emulators:start \
    --only auth,firestore,functions,storage,ui \
    --export-on-exit="$EXPORT_DIR"
fi
