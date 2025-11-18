import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env'
import { getDb, closeDb } from '../db/sqlite'
import { logger } from '../logger'

function resolveSchemaFile(): string {
  const candidates = [
    process.env.SCHEMA_FILE,
    path.resolve(process.cwd(), 'schema.sql'),
    path.resolve(process.cwd(), '../../infra/sqlite/schema.sql'),
    '/migrations/schema.sql'
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error('No schema.sql file found. Set SCHEMA_FILE or mount /migrations/schema.sql')
}

async function runMigrations() {
  const db = getDb()
  const schemaFile = resolveSchemaFile()

  logger.info({ schemaFile, database: env.DATABASE_PATH }, 'Applying SQLite schema')
  const sql = fs.readFileSync(schemaFile, 'utf-8')
  db.exec(sql)
  logger.info('SQLite schema applied successfully')
}

runMigrations()
  .catch((error) => {
    logger.error({ error }, 'Migration failed')
    process.exit(1)
  })
  .finally(() => {
    closeDb()
  })
