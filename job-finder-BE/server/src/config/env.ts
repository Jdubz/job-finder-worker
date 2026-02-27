import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// Load .env when running locally; production Compose supplies env vars directly
loadEnv()

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_PATH: z.string().min(1, 'DATABASE_PATH is required'),
  FIREBASE_APP_CHECK_AUDIENCE: z.string().optional(),
  TEST_AUTH_BYPASS_TOKEN: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().positive().int().default(14),
  GENERATOR_FUNCTION_URL: z.string().optional(),
  GENERATOR_ARTIFACTS_DIR: z.string().optional(),
  GENERATOR_ARTIFACTS_PUBLIC_BASE: z.string().optional(),
  GENERATOR_ASSETS_DIR: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  WORKER_RELOAD_URL: z.string().url().optional(),
  WORKER_WS_TOKEN: z.string().optional(),
  WORKER_URL: z.string().default('http://worker:5555'),

  // Graceful shutdown
  DRAIN_TIMEOUT_MS: z.coerce.number().positive().int().default(15000),

  // Log rotation support
  LOG_DIR: z.string().default('/logs'),
  LOG_ROTATE_MAX_BYTES: z.coerce.number().positive().default(100 * 1024 * 1024),
  LOG_ROTATE_RETENTION_DAYS: z.coerce.number().positive().int().default(7),

  // Cron scheduler
  CRON_ENABLED: z.string().optional(),

  // Semantic document cache
  CACHE_ENABLED: z.string().optional(),
  CACHE_DRY_RUN: z.string().optional(),
  CACHE_SIMILARITY_FULL_HIT: z.coerce.number().min(0).max(1).default(0.88),
  CACHE_SIMILARITY_PARTIAL_HIT: z.coerce.number().min(0).max(1).default(0.75),

  // Network storage (SMB/CIFS) for document backup
  NETWORK_STORAGE_ENABLED: z.string().optional(),
  NETWORK_STORAGE_HOST: z.string().optional(),
  NETWORK_STORAGE_SHARE: z.string().optional(),
  NETWORK_STORAGE_PATH: z.string().optional(),
  NETWORK_STORAGE_USERNAME: z.string().optional(),
  NETWORK_STORAGE_PASSWORD: z.string().optional(),
  NETWORK_STORAGE_MOUNT_POINT: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)
