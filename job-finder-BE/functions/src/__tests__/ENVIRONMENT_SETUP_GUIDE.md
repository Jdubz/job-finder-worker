# Environment Setup Guide for Document Generation Pipeline

## 🚨 **Root Cause of 500 Errors Identified**

The 500 errors are caused by **missing environment variables** in the Firebase Functions configuration. The functions are trying to access API keys from Secret Manager, but the required environment variables are not set.

## 🔧 **Required Environment Variables**

### **Critical Variables (Must Set)**
```bash
# Project Configuration
GOOGLE_CLOUD_PROJECT=static-sites-257923
GCP_PROJECT=static-sites-257923

# AI Provider API Keys (from 1Password)
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Alternative: Use Google API Key for Gemini
GOOGLE_API_KEY=your_google_api_key_here
```

### **Optional Variables (Recommended)**
```bash
# Environment
ENVIRONMENT=development
NODE_ENV=development

# Database
FIRESTORE_DATABASE_ID=(default)

# Mock Mode (for testing)
GEMINI_MOCK_MODE=false
OPENAI_MOCK_MODE=false
```

## 🛠️ **Setup Instructions**

### **Step 1: Set Environment Variables in Firebase Functions**

```bash
# Navigate to functions directory
cd job-finder-BE/functions

# Set project ID
firebase functions:config:set app.project_id="static-sites-257923"

# Set AI provider API keys (replace with actual keys from 1Password)
firebase functions:config:set ai.gemini_api_key="your_gemini_api_key_here"
firebase functions:config:set ai.openai_api_key="your_openai_api_key_here"

# Set environment
firebase functions:config:set app.environment="development"
```

### **Step 2: Alternative - Use .env File (Local Development)**

Create a `.env` file in the functions directory:

```bash
# .env file for local development
GOOGLE_CLOUD_PROJECT=static-sites-257923
GCP_PROJECT=static-sites-257923
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
ENVIRONMENT=development
NODE_ENV=development
FIRESTORE_DATABASE_ID=(default)
```

### **Step 3: Update Code to Use Environment Variables**

The current code tries to get API keys from Secret Manager, but we need to update it to use environment variables first. Here's the fix:

```typescript
// In ai-provider.factory.ts, update the getApiKey function:
async function getApiKey(secretName: string, logger?: SimpleLogger): Promise<string> {
  // Check cache first
  if (apiKeyCache.has(secretName)) {
    return apiKeyCache.get(secretName)!
  }

  // For testing, check environment variables first
  const envVarName = secretName.toUpperCase().replace(/-/g, "_")
  if (process.env[envVarName]) {
    const key = process.env[envVarName]!
    apiKeyCache.set(secretName, key)
    return key
  }

  // Check Firebase Functions config (for deployed functions)
  const functions = require('firebase-functions')
  const config = functions.config()
  if (config.ai && config.ai[secretName.replace('-', '_')]) {
    const key = config.ai[secretName.replace('-', '_')]
    apiKeyCache.set(secretName, key)
    return key
  }

  // Fall back to Secret Manager (for production)
  try {
    const client = new SecretManagerServiceClient()
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "static-sites-257923"
    const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`

    logger?.info(`Fetching API key from Secret Manager: ${secretName}`)

    const [version] = await client.accessSecretVersion({ name: secretPath })
    const payload = version.payload?.data

    if (!payload) {
      throw new Error(`Secret ${secretName} has no payload`)
    }

    const key = typeof payload === "string" ? payload : payload.toString()
    apiKeyCache.set(secretName, key)

    return key
  } catch (error) {
    logger?.error(`Failed to retrieve API key from Secret Manager: ${secretName}`, { error })
    throw new Error(`Failed to retrieve API key: ${secretName}`)
  }
}
```

## 🧪 **Testing the Fix**

### **Step 1: Test Environment Variables**
```bash
# Check if variables are set
firebase functions:config:get

# Test AI provider initialization
cd job-finder-BE/functions
npm test -- --testNamePattern="AI Provider"
```

### **Step 2: Test Document Generation**
```bash
# Start Firebase emulators
firebase emulators:start --only functions,firestore

# Test the generation endpoint
curl -X POST "http://localhost:5001/static-sites-257923/us-central1/manageGenerator/generator/start" \
  -H "Content-Type: application/json" \
  -d '{
    "generateType": "resume",
    "job": {
      "role": "Software Engineer",
      "company": "Test Corp",
      "jobDescriptionText": "Test job description"
    }
  }'
```

## 🔍 **Verification Steps**

### **1. Check Environment Variables**
```bash
# Verify Firebase Functions config
firebase functions:config:get

# Should show:
# {
#   "app": {
#     "project_id": "static-sites-257923",
#     "environment": "development"
#   },
#   "ai": {
#     "gemini_api_key": "your_key_here",
#     "openai_api_key": "your_key_here"
#   }
# }
```

### **2. Check Function Logs**
```bash
# Monitor function logs
firebase functions:log --only manageGenerator

# Look for:
# ✅ "Creating AI provider: gemini"
# ✅ "Using GOOGLE_API_KEY environment variable for Gemini"
# ❌ "Failed to retrieve API key"
```

### **3. Test API Key Validity**
```bash
# Test Gemini API key
curl -H "Authorization: Bearer $GEMINI_API_KEY" \
     "https://generativelanguage.googleapis.com/v1beta/models"

# Test OpenAI API key
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     "https://api.openai.com/v1/models"
```

## 🚨 **Common Issues and Solutions**

### **Issue 1: "Failed to retrieve API key"**
**Solution**: Set the environment variables as shown above

### **Issue 2: "AI provider initialization failed"**
**Solution**: Verify API keys are valid and have proper permissions

### **Issue 3: "Database connection failed"**
**Solution**: Ensure Firestore is properly configured and accessible

### **Issue 4: "PDF generation failed"**
**Solution**: Check if Puppeteer dependencies are installed

## 📋 **Quick Fix Checklist**

- [ ] Set `GOOGLE_CLOUD_PROJECT` environment variable
- [ ] Set `GEMINI_API_KEY` from 1Password
- [ ] Set `OPENAI_API_KEY` from 1Password
- [ ] Test API key validity
- [ ] Restart Firebase emulators
- [ ] Test document generation endpoint
- [ ] Check function logs for errors

## 🎯 **Expected Results**

After setting up the environment variables correctly:

1. **Function logs should show**:
   - ✅ "Creating AI provider: gemini"
   - ✅ "Using GOOGLE_API_KEY environment variable for Gemini"
   - ✅ "Step completed: fetch_data"
   - ✅ "Step completed: generate_resume"

2. **Document generation should work**:
   - ✅ No 500 errors
   - ✅ Successful step execution
   - ✅ Generated documents available for download

3. **Error logs should be clean**:
   - ❌ No "Failed to retrieve API key" errors
   - ❌ No "AI provider initialization failed" errors
   - ❌ No "Database connection failed" errors

---

**Next Steps**: Set the environment variables as shown above, then test the document generation pipeline to verify the 500 errors are resolved.
