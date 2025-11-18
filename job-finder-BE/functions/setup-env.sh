#!/bin/bash

# Environment Setup Script for Document Generation Pipeline
# This script sets up the required environment variables to fix 500 errors

echo "🔧 Setting up environment variables for document generation pipeline..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if we're in the functions directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "❌ Please run this script from the functions directory"
    exit 1
fi

echo "📋 Setting up Firebase Functions configuration..."

# Set project ID
echo "Setting project ID..."
firebase functions:config:set app.project_id="static-sites-257923"

# Set environment
echo "Setting environment..."
firebase functions:config:set app.environment="development"

# Set database ID
echo "Setting database ID..."
firebase functions:config:set app.database_id="(default)"

echo ""
echo "🔑 API Keys Setup"
echo "================"
echo "You need to set your API keys from 1Password:"
echo ""
echo "1. GEMINI_API_KEY - Get from 1Password"
echo "2. OPENAI_API_KEY - Get from 1Password"
echo ""
echo "Run these commands with your actual API keys:"
echo ""
echo "firebase functions:config:set ai.gemini_api_key=\"YOUR_GEMINI_API_KEY_HERE\""
echo "firebase functions:config:set ai.openai_api_key=\"YOUR_OPENAI_API_KEY_HERE\""
echo ""

# Check if API keys are already set
echo "🔍 Checking current configuration..."
firebase functions:config:get

echo ""
echo "📝 Next Steps:"
echo "============="
echo "1. Get your API keys from 1Password"
echo "2. Run the firebase functions:config:set commands above"
echo "3. Restart Firebase emulators"
echo "4. Test document generation"
echo ""
echo "🧪 Test the fix:"
echo "curl -X POST \"http://localhost:5001/static-sites-257923/us-central1/manageGenerator/generator/start\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"generateType\": \"resume\", \"job\": {\"role\": \"Software Engineer\", \"company\": \"Test Corp\", \"jobDescriptionText\": \"Test job description\"}}'"
echo ""
echo "✅ Environment setup complete!"
