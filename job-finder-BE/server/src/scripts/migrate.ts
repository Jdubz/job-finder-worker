import fs from 'node:fs'
import path from 'node:path'
import sqlite3 from 'better-sqlite3'

const DB_PATH = process.env.JF_SQLITE_DB_PATH ?? path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')
const MIGRATIONS_DIR =
  process.env.JF_SQLITE_MIGRATIONS_DIR ?? path.resolve(process.cwd(), '../../infra/sqlite/migrations')

type MigrationRecord = { name: string }

function ensureSchemaTable(db: sqlite3.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

function loadAppliedMigrations(db: sqlite3.Database): Set<string> {
  const rows = db.prepare<MigrationRecord>('SELECT name FROM schema_migrations ORDER BY name ASC').all()
  return new Set(rows.map((row) => row.name))
}

function applyMigration(db: sqlite3.Database, filePath: string, name: string) {
  const sql = fs.readFileSync(filePath, 'utf8')
  const transaction = db.transaction(() => {
    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name)
  })
  transaction()
}

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`[migrate] migrations directory not found at ${MIGRATIONS_DIR}`)
    process.exit(1)
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  if (!files.length) {
    console.warn('[migrate] no migration files found')
    return
  }

  const db = sqlite3(DB_PATH)
  ensureSchemaTable(db)
  const applied = loadAppliedMigrations(db)

  const pending = files.filter((file) => !applied.has(file))
  if (!pending.length) {
    console.log('[migrate] database already up to date')
    db.close()
    return
  }

  console.log(`[migrate] applying ${pending.length} migration(s) to ${DB_PATH}`)
  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    console.log(`[migrate] -> ${file}`)
    applyMigration(db, filePath, file)
  }

  db.close()
  console.log('[migrate] done')
}

main()
