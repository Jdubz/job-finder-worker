import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// Load .env when running locally; production Compose supplies env vars directly
loadEnv()

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_PATH: z.string().min(1, 'DATABASE_PATH is required'),
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1, 'FIREBASE_SERVICE_ACCOUNT_PATH is required'),
  JOBFINDER_DB_BACKUP_DIR: z.string().optional(),
  FIREBASE_APP_CHECK_AUDIENCE: z.string().optional()
})

export type Env = z.infer<typeof EnvSchema>

export const env: Env = EnvSchema.parse(process.env)
