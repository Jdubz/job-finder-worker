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
 * Get the canonical migration name (without extension) for tracking.
 * This ensures .ts (dev) and .js (prod) are treated as the same migration.
 */
function getMigrationName(filename: string): string {
  return filename.replace(/\.(ts|js)$/, '')
}

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

interface DiscoveredMigration {
  /** The actual filename on disk (with extension) */
  filename: string
  /** Canonical name for tracking (without extension) */
  name: string
}

/**
 * Discover migration files in the migrations directory
 */
function discoverMigrations(migrationsDir: string): DiscoveredMigration[] {
  if (!fs.existsSync(migrationsDir)) {
    return []
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
    .filter((file) => !file.startsWith('_')) // Allow _helpers.ts etc
    .map((filename) => ({ filename, name: getMigrationName(filename) }))
    .sort((a, b) => a.name.localeCompare(b.name)) // Lexicographic sort ensures YYYYMMDD_NNN order
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
    // Apply pending migrations (compare by canonical name, not filename)
    const pending = allMigrations.filter((m) => !applied.has(m.name))

    if (!pending.length) {
      logger.info({ appliedCount: applied.size }, '[config-migrations] all migrations already applied')
      return result
    }

    logger.info({ count: pending.length }, '[config-migrations] found pending migrations')

    for (const { filename, name } of pending) {
      try {
        const migration = await loadMigration(migrationsDir, filename)
        const desc = migration.description ?? name

        if (dryRun) {
          logger.info({ migration: name }, '[config-migrations] would apply (dry-run)')
          result.skipped.push(name)
          continue
        }

        logger.info({ migration: name, description: desc }, '[config-migrations] applying')
        migration.up(db)
        recordMigration(db, name) // Record canonical name (without extension)
        result.applied.push(name)
        logger.info({ migration: name }, '[config-migrations] applied successfully')
      } catch (error) {
        logger.error({ migration: name, error }, '[config-migrations] failed to apply')
        result.failed = name
        result.error = error instanceof Error ? error : new Error(String(error))
        break // Stop on first failure
      }
    }
  } else {
    // Rollback migrations
    const appliedList = Array.from(applied).sort().reverse() // Most recent first

    let toRollback: string[] = []

    if (target) {
      // Roll back to specific target (normalize target name)
      const normalizedTarget = getMigrationName(target)
      const targetIndex = appliedList.indexOf(normalizedTarget)
      if (targetIndex === -1) {
        throw new Error(`Target migration '${normalizedTarget}' not found in applied migrations`)
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

    for (const name of toRollback) {
      try {
        // Find the migration file by canonical name
        const migrationFile = allMigrations.find((m) => m.name === name)
        if (!migrationFile) {
          throw new Error(`Migration file for '${name}' not found in ${migrationsDir}`)
        }

        const migration = await loadMigration(migrationsDir, migrationFile.filename)

        if (dryRun) {
          logger.info({ migration: name }, '[config-migrations] would rollback (dry-run)')
          result.skipped.push(name)
          continue
        }

        logger.info({ migration: name }, '[config-migrations] rolling back')
        migration.down(db)
        removeMigrationRecord(db, name)
        result.applied.push(name)
        logger.info({ migration: name }, '[config-migrations] rolled back successfully')
      } catch (error) {
        logger.error({ migration: name, error }, '[config-migrations] failed to rollback')
        result.failed = name
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
  const appliedSet = loadAppliedMigrations(db)
  const all = discoverMigrations(migrationsDir)

  return {
    applied: all.filter((m) => appliedSet.has(m.name)).map((m) => m.name),
    pending: all.filter((m) => !appliedSet.has(m.name)).map((m) => m.name),
  }
}
