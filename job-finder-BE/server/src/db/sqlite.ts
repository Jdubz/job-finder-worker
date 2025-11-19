import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env'
import { logger } from '../logger'
import { runMigrations } from './migrations'

let db: Database.Database | null = null
let migrationsApplied = false

export function getDb(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = env.DATABASE_PATH.startsWith('file:')
    ? env.DATABASE_PATH
    : path.resolve(env.DATABASE_PATH)

  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }

  logger.info({ dbPath }, 'Opening SQLite database')

  db = new Database(dbPath, { verbose: env.NODE_ENV === 'development' ? console.log : undefined })
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  if (!migrationsApplied) {
    runMigrations(db)
    migrationsApplied = true
  }

  return db
}

export function closeDb(): void {
  if (!db) return
  logger.info('Closing SQLite database')
  db.close()
  db = null
}
