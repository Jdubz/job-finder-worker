#!/bin/bash

# Deploy Firestore Rules and Indexes to Staging and Production
# This script ensures both databases have the correct configuration

set -e

echo "🔥 Deploying Firestore Configuration"
echo "===================================="
echo ""

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run: firebase login"
    exit 1
fi

echo "📋 Current Firebase project:"
firebase use

echo ""
echo "📦 Deploying Firestore rules and indexes..."
echo ""

# Deploy rules and indexes for both databases
firebase deploy --only firestore

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Firestore configuration deployed successfully!"
    echo ""
    echo "📊 Deployed to:"
    echo "  - portfolio-staging database"
    echo "  - portfolio database"
    echo ""
    echo "⚠️  Note: Indexes may take a few minutes to build."
    echo "    Check status at: https://console.firebase.google.com/project/static-sites-257923/firestore/indexes"
else
    echo ""
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi
