/**
 * Config Migration System
 *
 * Manages data/config migrations separate from schema migrations.
 * Schema migrations (*.sql) change database structure.
 * Config migrations (*.ts) transform data in job_finder_config table.
 *
 * Usage:
 *   - Place migration files in src/db/config-migrations/
 *   - Name files with format: YYYYMMDD_NNN_description.ts (e.g., 20251205_001_ai-settings-agent-manager.ts)
 *   - Each file must export: { up: (db) => void, down: (db) => void }
 *   - Run via: npx tsx src/scripts/run-config-migrations.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { logger } from '../logger'

export interface ConfigMigration {
  /** Apply the migration */
  up: (db: Database.Database) => void
  /** Revert the migration (best effort - not always possible) */
  down: (db: Database.Database) => void
  /** Optional: Description shown in logs */
  description?: string
}

type MigrationDirection = 'up' | 'down'

interface MigrationRecord {
  name: string
  applied_at: string
}

const CONFIG_MIGRATIONS_TABLE = 'config_migrations'

const defaultConfigMigrationsDir = path.resolve(__dirname, 'config-migrations')

/**
 * Ensure the config_migrations tracking table exists
 */
function ensureConfigMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${CONFIG_MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/**
 * Get set of already-applied migration names
 */
function loadAppliedMigrations(db: Database.Database): Set<string> {
  const rows = db
    .prepare<[], MigrationRecord>(`SELECT name FROM ${CONFIG_MIGRATIONS_TABLE} ORDER BY name`)
    .all()
  return new Set(rows.map((row) => row.name))
}

/**
 * Record that a migration was applied
 */
function recordMigration(db: Database.Database, name: string): void {
  db.prepare(`INSERT INTO ${CONFIG_MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`).run(
    name,
    new Date().toISOString()
  )
}

/**
 * Remove migration record (for rollback)
 */
function removeMigrationRecord(db: Database.Database, name: string): void {
  db.prepare(`DELETE FROM ${CONFIG_MIGRATIONS_TABLE} WHERE name = ?`).run(name)
}

/**
 * Discover migration files in the migrations directory
 */
function discoverMigrations(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) {
    return []
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
    .filter((file) => !file.startsWith('_')) // Allow _helpers.ts etc
    .sort((a, b) => a.localeCompare(b)) // Lexicographic sort ensures YYYYMMDD_NNN order
}

/**
 * Load a migration module
 */
async function loadMigration(migrationsDir: string, filename: string): Promise<ConfigMigration> {
  const filepath = path.join(migrationsDir, filename)

  // Use dynamic import for both .ts and .js
  const module = await import(filepath)

  if (typeof module.up !== 'function') {
    throw new Error(`Migration ${filename} must export an 'up' function`)
  }
  if (typeof module.down !== 'function') {
    throw new Error(`Migration ${filename} must export a 'down' function`)
  }

  return {
    up: module.up,
    down: module.down,
    description: module.description,
  }
}

export interface RunConfigMigrationsOptions {
  /** Directory containing migration files */
  migrationsDir?: string
  /** Run in dry-run mode (don't actually apply) */
  dryRun?: boolean
  /** Direction: 'up' to apply, 'down' to rollback */
  direction?: MigrationDirection
  /** For rollback: how many migrations to roll back (default: 1) */
  steps?: number
  /** For rollback: specific migration name to roll back to */
  target?: string
}

export interface MigrationResult {
  applied: string[]
  skipped: string[]
  failed: string | null
  error?: Error
}

/**
 * Run pending config migrations
 */
export async function runConfigMigrations(
  db: Database.Database,
  options: RunConfigMigrationsOptions = {}
): Promise<MigrationResult> {
  const {
    migrationsDir = defaultConfigMigrationsDir,
    dryRun = false,
    direction = 'up',
    steps = 1,
    target,
  } = options

  const result: MigrationResult = {
    applied: [],
    skipped: [],
    failed: null,
  }

  logger.info({ migrationsDir, direction, dryRun }, '[config-migrations] starting')

  // Ensure tracking table exists
  ensureConfigMigrationsTable(db)

  const applied = loadAppliedMigrations(db)
  const allMigrations = discoverMigrations(migrationsDir)

  if (direction === 'up') {
    // Apply pending migrations
    const pending = allMigrations.filter((name) => !applied.has(name))

    if (!pending.length) {
      logger.info({ appliedCount: applied.size }, '[config-migrations] all migrations already applied')
      return result
    }

    logger.info({ count: pending.length }, '[config-migrations] found pending migrations')

    for (const filename of pending) {
      try {
        const migration = await loadMigration(migrationsDir, filename)
        const desc = migration.description ?? filename

        if (dryRun) {
          logger.info({ migration: filename }, '[config-migrations] would apply (dry-run)')
          result.skipped.push(filename)
          continue
        }

        logger.info({ migration: filename, description: desc }, '[config-migrations] applying')
        migration.up(db)
        recordMigration(db, filename)
        result.applied.push(filename)
        logger.info({ migration: filename }, '[config-migrations] applied successfully')
      } catch (error) {
        logger.error({ migration: filename, error }, '[config-migrations] failed to apply')
        result.failed = filename
        result.error = error instanceof Error ? error : new Error(String(error))
        break // Stop on first failure
      }
    }
  } else {
    // Rollback migrations
    const appliedList = Array.from(applied).sort().reverse() // Most recent first

    let toRollback: string[] = []

    if (target) {
      // Roll back to specific target
      const targetIndex = appliedList.indexOf(target)
      if (targetIndex === -1) {
        throw new Error(`Target migration '${target}' not found in applied migrations`)
      }
      toRollback = appliedList.slice(0, targetIndex)
    } else {
      // Roll back N steps
      toRollback = appliedList.slice(0, steps)
    }

    if (!toRollback.length) {
      logger.info('[config-migrations] no migrations to roll back')
      return result
    }

    logger.info({ count: toRollback.length }, '[config-migrations] rolling back migrations')

    for (const filename of toRollback) {
      try {
        const migration = await loadMigration(migrationsDir, filename)

        if (dryRun) {
          logger.info({ migration: filename }, '[config-migrations] would rollback (dry-run)')
          result.skipped.push(filename)
          continue
        }

        logger.info({ migration: filename }, '[config-migrations] rolling back')
        migration.down(db)
        removeMigrationRecord(db, filename)
        result.applied.push(filename)
        logger.info({ migration: filename }, '[config-migrations] rolled back successfully')
      } catch (error) {
        logger.error({ migration: filename, error }, '[config-migrations] failed to rollback')
        result.failed = filename
        result.error = error instanceof Error ? error : new Error(String(error))
        break
      }
    }
  }

  logger.info(
    { applied: result.applied.length, skipped: result.skipped.length, failed: result.failed },
    '[config-migrations] complete'
  )

  return result
}

/**
 * Get migration status
 */
export function getConfigMigrationStatus(
  db: Database.Database,
  migrationsDir: string = defaultConfigMigrationsDir
): { applied: string[]; pending: string[] } {
  ensureConfigMigrationsTable(db)
  const applied = loadAppliedMigrations(db)
  const all = discoverMigrations(migrationsDir)

  return {
    applied: all.filter((name) => applied.has(name)),
    pending: all.filter((name) => !applied.has(name)),
  }
}
