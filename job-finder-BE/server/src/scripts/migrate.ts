import path from 'node:path'
import sqlite3 from 'better-sqlite3'
import { runMigrations } from '../db/migrations'

const DB_PATH = process.env.JF_SQLITE_DB_PATH ?? path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')
const MIGRATIONS_DIR =
  process.env.JF_SQLITE_MIGRATIONS_DIR ?? path.resolve(process.cwd(), '../../infra/sqlite/migrations')

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
