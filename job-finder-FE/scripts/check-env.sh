#!/bin/bash
# Environment Variable Validation Script
# Validates that required environment variables are present

set -e

echo "🔍 Environment Variable Validation"
echo "=================================================="

# Required variables
REQUIRED_VARS=(
  "VITE_FIREBASE_API_KEY"
  "VITE_FIREBASE_AUTH_DOMAIN"
  "VITE_FIREBASE_PROJECT_ID"
  "VITE_FIREBASE_STORAGE_BUCKET"
  "VITE_FIREBASE_MESSAGING_SENDER_ID"
  "VITE_FIREBASE_APP_ID"
)

# Find env file
ENV_FILE=""
if [ -f ".env" ]; then
  ENV_FILE=".env"
elif [ -f ".env.local" ]; then
  ENV_FILE=".env.local"
elif [ -f ".env.development" ]; then
  ENV_FILE=".env.development"
else
  echo "❌ No environment file found!"
  echo "💡 Copy .env.template to .env.development and fill in the values:"
  echo "   cp .env.template .env.development"
  exit 1
fi

echo "📄 Checking $ENV_FILE..."
echo ""

# Check variables
MISSING=0
PRESENT=0

for var in "${REQUIRED_VARS[@]}"; do
  # Check if variable exists and has a real value (not placeholder)
  if grep -q "^${var}=" "$ENV_FILE"; then
    value=$(grep "^${var}=" "$ENV_FILE" | cut -d'=' -f2-)
    if [[ "$value" == *"your_"* ]] || [[ "$value" == *"_here"* ]] || [ -z "$value" ]; then
      echo "❌ $var (needs configuration)"
      ((MISSING++))
    else
      echo "✅ $var"
      ((PRESENT++))
    fi
  else
    echo "❌ $var (not found)"
    ((MISSING++))
  fi
done

echo ""
echo "=================================================="

if [ $MISSING -eq 0 ]; then
  echo "✅ All required environment variables are configured"
  exit 0
else
  echo "❌ $MISSING required variables need configuration"
  echo ""
  echo "💡 To fix this:"
  echo "   1. Check .env.template for required variables"
  echo "   2. Get Firebase config from Firebase Console:"
  echo "      https://console.firebase.google.com/project/static-sites-257923/settings/general"
  echo "   3. Add missing variables to $ENV_FILE"
  exit 1
fi
