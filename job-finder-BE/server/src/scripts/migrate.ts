import path from 'node:path'
import sqlite3 from 'better-sqlite3'
import { runMigrations } from '../db/migrations.js'

const DB_PATH =
  process.env.SQLITE_DB_PATH ??
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')

const MIGRATIONS_DIR =
  process.env.JF_SQLITE_MIGRATIONS_DIR ??
  process.env.SCHEMA_DIR ??
  (process.env.SCHEMA_FILE ? path.dirname(process.env.SCHEMA_FILE) : undefined) ??
  path.resolve(__dirname, '../../infra/sqlite/migrations')

function main() {
  const db = sqlite3(DB_PATH)
  const applied = runMigrations(db, MIGRATIONS_DIR)
  if (!applied.length) {
    console.log('[migrate] database already up to date')
  } else {
    console.log(`[migrate] applied ${applied.length} migration(s) to ${DB_PATH}`)
    for (const name of applied) {
      console.log(`[migrate] -> ${name}`)
    }
  }
  db.close()
}

main()
