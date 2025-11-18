/**
 * Secret Configuration
 *
 * Defines secrets using Firebase Functions' params API.
 * Secrets are automatically loaded from Cloud Secret Manager.
 */

import { defineSecret } from "firebase-functions/params"

// Gemini API key from Secret Manager
// Create with: gcloud secrets create gemini-api-key --data-file=- --project=static-sites-257923
export const geminiApiKey = defineSecret("GEMINI_API_KEY")

// OpenAI API key from Secret Manager
// Already exists in Secret Manager as 'openai-api-key'
export const openaiApiKey = defineSecret("OPENAI_API_KEY")
