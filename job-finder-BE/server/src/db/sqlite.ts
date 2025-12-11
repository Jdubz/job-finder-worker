import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env'
import { logger } from '../logger'
import { runMigrations } from './migrations'

type SQLiteOpenOptions = Database.Options & { uri?: boolean }

let db: Database.Database | null = null
let migrationsApplied = false

export function getDb(): Database.Database {
  if (db) {
    return db
  }

  const isFileUri = env.DATABASE_PATH.startsWith('file:')
  const dbPath = isFileUri ? env.DATABASE_PATH : path.resolve(env.DATABASE_PATH)

  // Only create directories for plain file paths; SQLite URIs (file:...) may be in-memory or
  // reference virtual paths and should be left untouched so their semantics stay intact.
  if (!isFileUri && !fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }

  logger.info({ dbPath }, 'Opening SQLite database')

  const openOptions: SQLiteOpenOptions = {
    verbose: env.NODE_ENV === 'development' ? console.log : undefined,
  }

  // Enable URI mode so better-sqlite3 respects query parameters like ?mode=memory&cache=shared.
  if (isFileUri) {
    openOptions.uri = true
  }

  db = new Database(dbPath, openOptions)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 15000')
  db.pragma('synchronous = NORMAL')

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

/**
 * Run a passive WAL checkpoint to ensure external writes are visible.
 * Call this before reading config that may have been modified externally (e.g., via sqlite3 CLI).
 * Passive mode does not block writers and is safe to call frequently.
 */
export function checkpointWal(): void {
  if (!db) return
  db.pragma('wal_checkpoint(PASSIVE)')
}
