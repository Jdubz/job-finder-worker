import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { logger } from '../logger'

// Resolved lazily (at call time) so that test setupFiles can set
// JF_SQLITE_MIGRATIONS_DIR before the path is evaluated.
function getDefaultMigrationsDir(): string {
  return process.env.JF_SQLITE_MIGRATIONS_DIR
    ? path.resolve(process.env.JF_SQLITE_MIGRATIONS_DIR)
    : path.resolve(process.cwd(), 'infra/sqlite/migrations')
}

function ensureSchemaTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

function loadApplied(db: Database.Database): Set<string> {
  const rows = db
    .prepare<[], { name: string }>('SELECT name FROM schema_migrations ORDER BY name')
    .all()
  return new Set(rows.map((row) => row.name))
}

export function runMigrations(db: Database.Database, migrationsDir: string = getDefaultMigrationsDir()): string[] {
  logger.info({ migrationsDir }, '[migrations] checking for pending migrations')

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`[migrations] directory not found at ${migrationsDir}`)
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  if (!files.length) {
    logger.info('[migrations] no migration files found')
    return []
  }

  ensureSchemaTable(db)
  const applied = loadApplied(db)
  const pending = files.filter((file) => !applied.has(file))

  if (!pending.length) {
    logger.info({ appliedCount: applied.size }, '[migrations] database is up to date')
    return []
  }

  logger.info({ count: pending.length }, '[migrations] applying pending migrations')

  const appliedNow: string[] = []

  // Some historical migrations include their own BEGIN/COMMIT blocks. Wrapping them in an
  // outer transaction triggers "cannot start a transaction within a transaction" on sqlite.
  // Execute sequentially; each script is responsible for its own atomicity.
  const hasExplicitTransaction = (sql: string): boolean => {
    const normalized = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toUpperCase()
    return normalized.includes('BEGIN') && normalized.includes('COMMIT')
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

    if (hasExplicitTransaction(sql)) {
      db.exec(sql)
    } else {
      try {
        db.exec('BEGIN')
        db.exec(sql)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        logger.error({ migration: file, error: err }, '[migrations] migration failed and was rolled back')
        throw err
      }
    }

    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file)
    appliedNow.push(file)
    logger.info({ migration: file }, '[migrations] applied migration')
  }

  logger.info({ count: appliedNow.length }, '[migrations] completed applying migrations')
  return appliedNow
}
