#!/bin/bash

# Seed Firebase Emulators with Test Data
# This script populates the emulators with test users and data for development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🌱 Seeding Firebase Emulators with Test Data"
echo ""

# Check if emulators are running
if ! curl -s http://localhost:4000 > /dev/null 2>&1; then
  echo "❌ Error: Firebase Emulators are not running"
  echo "   Start them first with: npm run emulators:start"
  exit 1
fi

echo "✅ Emulators detected - proceeding with seed"
echo ""

# Run the seed script (will be created separately as TypeScript)
cd "$PROJECT_ROOT/functions"

if [ -f "src/scripts/seed-emulator.ts" ]; then
  echo "📝 Running seed script..."
  npx ts-node src/scripts/seed-emulator.ts
else
  echo "⚠️  Seed script not found at functions/src/scripts/seed-emulator.ts"
  echo "   You can create test data manually via the Emulator UI at http://localhost:4000"
fi

echo ""
echo "✅ Seed complete"
echo "   Emulator UI: http://localhost:4000"
