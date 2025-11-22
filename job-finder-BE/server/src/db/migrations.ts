import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'

const defaultMigrationsDir = process.env.JF_SQLITE_MIGRATIONS_DIR
  ? path.resolve(process.env.JF_SQLITE_MIGRATIONS_DIR)
  : path.resolve(process.cwd(), '../../infra/sqlite/migrations')

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

export function runMigrations(db: Database.Database, migrationsDir: string = defaultMigrationsDir): string[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`[migrations] directory not found at ${migrationsDir}`)
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  if (!files.length) {
    return []
  }

  ensureSchemaTable(db)
  const applied = loadApplied(db)
  const pending = files.filter((file) => !applied.has(file))

  const appliedNow: string[] = []
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file)
    appliedNow.push(file)
  }

  return appliedNow
}
