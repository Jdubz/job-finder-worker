#!/bin/bash
#
# Start Firebase Emulators with Data Import/Export
#
# This script ensures emulator data persists across restarts
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXPORT_DIR="$PROJECT_DIR/.firebase/emulator-data"

cd "$PROJECT_DIR"

echo "🔥 Starting Firebase Emulators..."
echo "📂 Data directory: $EXPORT_DIR"

# Check if export directory exists
if [ -d "$EXPORT_DIR" ]; then
  echo "✅ Found existing emulator data - will import"
  firebase emulators:start \
    --import="$EXPORT_DIR" \
    --export-on-exit="$EXPORT_DIR"
else
  echo "ℹ️  No existing data found - starting fresh"
  echo "📝 Data will be exported to $EXPORT_DIR on exit"
  firebase emulators:start \
    --export-on-exit="$EXPORT_DIR"
fi

