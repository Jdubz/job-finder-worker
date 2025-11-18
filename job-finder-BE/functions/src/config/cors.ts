/**
 * CORS Configuration
 *
 * Centralized CORS configuration for all Cloud Functions.
 * Allows requests from production, staging, and local development environments.
 */

import cors from "cors"

/**
 * Allowed origins for CORS
 */
export const ALLOWED_ORIGINS = [
  "https://joshwentworth.com",
  "https://www.joshwentworth.com",
  "https://staging.joshwentworth.com",
  "https://job-finder.joshwentworth.com",
  "https://job-finder-staging.joshwentworth.com",
  "http://localhost:8000",
  "http://localhost:3000",
  "http://localhost:5173", // Vite dev server
]

/**
 * Default CORS options for most functions
 */
export const DEFAULT_CORS_OPTIONS: cors.CorsOptions = {
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Firebase-AppCheck"],
  credentials: true,
}

/**
 * CORS options for contact form (includes App Check header)
 */
export const CONTACT_FORM_CORS_OPTIONS: cors.CorsOptions = {
  ...DEFAULT_CORS_OPTIONS,
  methods: ["GET", "POST", "OPTIONS"], // GET for health check
}

/**
 * CORS options for resume upload (POST only, GET for health check)
 */
export const RESUME_UPLOAD_CORS_OPTIONS: cors.CorsOptions = {
  ...DEFAULT_CORS_OPTIONS,
  methods: ["GET", "POST", "OPTIONS"],
}

/**
 * Default CORS handler (use this in most cases)
 */
export const corsHandler = cors(DEFAULT_CORS_OPTIONS)

/**
 * Contact form CORS handler
 */
export const contactFormCorsHandler = cors(CONTACT_FORM_CORS_OPTIONS)

/**
 * Resume upload CORS handler
 */
export const resumeUploadCorsHandler = cors(RESUME_UPLOAD_CORS_OPTIONS)
