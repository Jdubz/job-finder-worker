import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env'
import { logger } from '../logger'
import { runMigrations } from './migrations'

type SQLiteOpenOptions = Database.Options & { uri?: boolean }

let db: Database.Database | null = null
let migrationsApplied = false
let lastCheckpoint = 0
const CHECKPOINT_THROTTLE_MS = 1000

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
    try {
      runMigrations(db)
    } finally {
      // Even if a migration threw (e.g., during local watch reload), avoid re-entering
      // nested migrations and causing transaction errors. Next cold start will retry.
      migrationsApplied = true
    }
  }

  return db
}

export function closeDb(): void {
  if (!db) return
  logger.info('Closing SQLite database')
  db.close()
  db = null
  lastCheckpoint = 0 // Reset throttle so fresh connections checkpoint immediately
}

/**
 * Run a passive WAL checkpoint to ensure external writes are visible.
 * Call this before reading config that may have been modified externally (e.g., via sqlite3 CLI).
 * Passive mode does not block writers and is safe to call frequently.
 * Throttled to run at most once per second to avoid unnecessary disk I/O.
 */
export function checkpointWal(): void {
  if (!db) return

  const now = Date.now()
  if (now - lastCheckpoint < CHECKPOINT_THROTTLE_MS) return
  lastCheckpoint = now

  try {
    db.pragma('wal_checkpoint(PASSIVE)')
  } catch (err) {
    logger.warn({ err }, 'Failed to run WAL checkpoint. External DB changes may not be visible.')
  }
}
