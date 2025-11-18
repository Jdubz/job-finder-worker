#!/bin/bash

# Clear Firebase Emulator Persistent Data
# This script removes all persisted emulator data

set -e

# Detect non-interactive execution (when run via dev-monitor or CI)
if [ -t 0 ]; then
  INTERACTIVE=true
else
  INTERACTIVE=false
  echo "ℹ️  Running in non-interactive mode - auto-confirming"
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXPORT_DIR="$PROJECT_ROOT/.firebase/emulator-data"

echo "🧹 Clearing Firebase Emulator Data"
echo "   Directory: $EXPORT_DIR"
echo ""

if [ ! -d "$EXPORT_DIR" ]; then
  echo "✅ No emulator data directory found - nothing to clear"
  exit 0
fi

# Check if there's actually data to clear
if [ ! "$(ls -A "$EXPORT_DIR")" ]; then
  echo "✅ Emulator data directory is already empty"
  exit 0
fi

# Prompt for confirmation
if [ "$INTERACTIVE" = true ] && [ "$AUTO_CONFIRM" = false ]; then
  read -p "⚠️  This will delete all persisted emulator data. Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
  fi
else
  echo "✓ Auto-confirming data clear (non-interactive mode)"
fi

# Clear the data (keep .gitkeep)
cd "$EXPORT_DIR"
find . -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +

echo "✅ Emulator data cleared"
echo "   Run 'npm run emulators:start' to start fresh"
