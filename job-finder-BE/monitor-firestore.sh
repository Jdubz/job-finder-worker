#!/bin/bash

# Firestore Production Monitor
# Quick script to check Firestore health in production

echo "🔍 Firestore Production Monitor"
echo "================================"
echo ""

PROJECT_ID="static-sites-257923"

echo "📊 Checking Firestore index status..."
echo ""

# Check if firebase CLI is available
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found"
    exit 1
fi

# List indexes for staging database
echo "📋 Portfolio-Staging Database Indexes:"
firebase firestore:indexes --database=portfolio-staging 2>&1 | grep -E "Index|Status|Building|Ready|Error" | head -20

echo ""
echo "📋 Portfolio Production Database Indexes:"
firebase firestore:indexes --database=portfolio 2>&1 | grep -E "Index|Status|Building|Ready|Error" | head -20

echo ""
echo "📈 Checking Firestore usage..."
echo ""
echo "Visit these URLs for detailed metrics:"
echo "  - Firestore Console: https://console.firebase.google.com/project/${PROJECT_ID}/firestore"
echo "  - Indexes: https://console.firebase.google.com/project/${PROJECT_ID}/firestore/indexes"
echo "  - Rules: https://console.firebase.google.com/project/${PROJECT_ID}/firestore/rules"
echo "  - Usage: https://console.firebase.google.com/project/${PROJECT_ID}/usage"
echo ""

echo "💡 To check for errors in production:"
echo "  1. Open Chrome DevTools on production site"
echo "  2. Filter console for: FIRESTORE"
echo "  3. Look for: INTERNAL ASSERTION FAILED"
echo ""

echo "✅ Monitor complete"
