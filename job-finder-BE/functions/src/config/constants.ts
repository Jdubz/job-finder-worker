/**
 * Application Constants
 *
 * Centralized configuration values to eliminate hard-coded constants
 * throughout the codebase.
 */

/**
 * Server and Port Configuration
 */
export const PORTS = {
  FIREBASE_AUTH_EMULATOR: 9099,
  FIRESTORE_EMULATOR: 8080,
  STORAGE_EMULATOR: 9199,
  DEV_SERVER: 3000,
  ALTERNATIVE_DEV: 8000,
} as const;

/**
 * Time Windows and Durations (in milliseconds)
 */
export const TIME_WINDOWS = {
  RATE_LIMIT_15_MIN: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_1_HOUR: 60 * 60 * 1000, // 1 hour
  RATE_LIMIT_24_HOURS: 24 * 60 * 60 * 1000, // 24 hours
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

/**
 * Rate Limiting Configuration
 */
export const RATE_LIMITS = {
  // Viewer tier limits
  VIEWER_REQUESTS_PER_15MIN: 10,
  VIEWER_REQUESTS_PER_HOUR: 20,

  // Editor tier limits
  EDITOR_REQUESTS_PER_15MIN: 20,
  EDITOR_REQUESTS_PER_HOUR: 50,

  // Public endpoint limits
  PUBLIC_REQUESTS_PER_15MIN: 30,
  PUBLIC_REQUESTS_PER_HOUR: 100,

  // Scrape request limits
  SCRAPE_MAX_PENDING_PER_USER: 1,
  SCRAPE_REQUESTS_PER_HOUR: 10,
} as const;

/**
 * Pagination Defaults
 */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
} as const;

/**
 * File Upload Limits
 */
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: {
    PDF: 'application/pdf',
    IMAGE_PNG: 'image/png',
    IMAGE_JPEG: 'image/jpeg',
    IMAGE_JPG: 'image/jpg',
  },
} as const;

/**
 * Google Cloud Storage Configuration
 */
export const STORAGE = {
  BUCKETS: {
    RESUMES: 'joshwentworth-resume',
    GENERATED_DOCS: 'generated-documents',
    AVATARS: 'profile-avatars',
  },
  SIGNED_URL_EXPIRY_HOURS: 24,
  SIGNED_URL_EXPIRY_MS: 24 * 60 * 60 * 1000,
} as const;

/**
 * Firestore Collection Names
 */
export const COLLECTIONS = {
  CONTENT_ITEMS: 'content-items',
  GENERATED_DOCUMENTS: 'generated-documents',
  JOB_MATCHES: 'job-matches',
  JOB_QUEUE: 'job-queue',
  JOB_FINDER_CONFIG: 'job-finder-config',
  AI_PROMPTS: 'ai-prompts',
  EXPERIENCE_ENTRIES: 'experience-entries',
  EXPERIENCE_BLURBS: 'experience-blurbs',
} as const;

/**
 * AI Provider Configuration
 */
export const AI_PROVIDERS = {
  OPENAI: 'openai' as const,
  GEMINI: 'gemini' as const,
  DEFAULT: 'gemini' as const,
} as const;

/**
 * AI Model Names
 */
export const AI_MODELS = {
  OPENAI_GPT4: 'gpt-4o',
  OPENAI_GPT4_MINI: 'gpt-4o-mini',
  GEMINI_FLASH: 'gemini-2.0-flash-exp',
  GEMINI_PRO: 'gemini-pro',
} as const;

/**
 * Generation Types
 */
export const GENERATION_TYPES = {
  RESUME: 'resume' as const,
  COVER_LETTER: 'coverLetter' as const,
  BOTH: 'both' as const,
} as const;

/**
 * Content Item Types
 */
export const CONTENT_TYPES = {
  COMPANY: 'company' as const,
  PROJECT: 'project' as const,
  SKILL_GROUP: 'skill-group' as const,
  EDUCATION: 'education' as const,
  PROFILE_SECTION: 'profile-section' as const,
  TEXT_SECTION: 'text-section' as const,
} as const;

/**
 * Visibility Levels
 */
export const VISIBILITY = {
  PUBLIC: 'public' as const,
  PRIVATE: 'private' as const,
  DRAFT: 'draft' as const,
  ARCHIVED: 'archived' as const,
} as const;

/**
 * User Roles
 */
export const ROLES = {
  VIEWER: 'viewer' as const,
  EDITOR: 'editor' as const,
  ADMIN: 'admin' as const,
} as const;

/**
 * Queue Item Status
 */
export const QUEUE_STATUS = {
  PENDING: 'pending' as const,
  PROCESSING: 'processing' as const,
  SUCCESS: 'success' as const,
  FAILED: 'failed' as const,
  FILTERED: 'filtered' as const,
  SKIPPED: 'skipped' as const,
} as const;

/**
 * Environment Names
 */
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development' as const,
  STAGING: 'staging' as const,
  PRODUCTION: 'production' as const,
} as const;

/**
 * HTTP Methods
 */
export const HTTP_METHODS = {
  GET: 'GET' as const,
  POST: 'POST' as const,
  PUT: 'PUT' as const,
  DELETE: 'DELETE' as const,
  PATCH: 'PATCH' as const,
  OPTIONS: 'OPTIONS' as const,
} as const;

/**
 * CORS Origins (organized by environment)
 */
export const CORS_ORIGINS = {
  PRODUCTION: [
    'https://joshwentworth.dev',
    'https://www.joshwentworth.dev',
  ],
  STAGING: [
    'https://staging.joshwentworth.dev',
    'https://staging-joshwentworth.web.app',
  ],
  DEVELOPMENT: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
  ],
} as const;

/**
 * Regex Patterns
 */
export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL: /^https?:\/\/.+/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  PHONE: /^\+?[\d\s\-()]+$/,
} as const;

/**
 * Default Values
 */
export const DEFAULTS = {
  LANGUAGE: 'en-US' as const,
  TIMEZONE: 'America/Los_Angeles' as const,
  DATE_FORMAT: 'YYYY-MM-DD' as const,
  DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss' as const,
} as const;

/**
 * Retry Configuration
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Logging Levels
 */
export const LOG_LEVELS = {
  ERROR: 'error' as const,
  WARN: 'warn' as const,
  INFO: 'info' as const,
  DEBUG: 'debug' as const,
} as const;
