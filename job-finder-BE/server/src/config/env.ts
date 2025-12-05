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
  SESSION_TTL_DAYS: z.coerce.number().positive().int().default(30),
  GENERATOR_FUNCTION_URL: z.string().optional(),
  GENERATOR_ARTIFACTS_DIR: z.string().optional(),
  GENERATOR_ARTIFACTS_PUBLIC_BASE: z.string().optional(),
  GENERATOR_ASSETS_DIR: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  WORKER_RELOAD_URL: z.string().url().optional(),
  WORKER_WS_TOKEN: z.string().optional(),

  // Maintenance + log rotation support
  WORKER_MAINTENANCE_URL: z.string().default('http://worker:5555/maintenance'),
  LOG_DIR: z.string().default('/logs'),
  LOG_ROTATE_MAX_BYTES: z.coerce.number().positive().default(100 * 1024 * 1024),
  LOG_ROTATE_RETENTION_DAYS: z.coerce.number().positive().int().default(7),

  // Machine-to-machine auth
  CRON_API_KEY: z.string().optional(),

  // Gmail OAuth (reuse Google client if set; secret required for token exchange)
  GMAIL_OAUTH_CLIENT_ID: z.string().optional(),
  GMAIL_OAUTH_CLIENT_SECRET: z.string().optional(),

  // Encryption key for Gmail token storage (32 bytes base64 or hex recommended)
  GMAIL_TOKEN_KEY: z.string().optional()
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)
