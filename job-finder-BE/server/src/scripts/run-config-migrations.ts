#!/usr/bin/env npx tsx
/**
 * Config Migration Runner
 *
 * Runs pending config/data migrations from src/db/config-migrations/
 *
 * Usage:
 *   npx tsx src/scripts/run-config-migrations.ts [options]
 *
 * Options:
 *   --dry-run     Show what would be applied without actually running
 *   --status      Show migration status (applied vs pending)
 *   --down        Rollback mode (default: roll back 1 migration)
 *   --steps=N     Roll back N migrations (with --down)
 *   --target=NAME Roll back to specific migration (with --down)
 *
 * Environment:
 *   DATABASE_PATH or SQLITE_DB_PATH - Path to SQLite database
 */

import path from 'node:path'
import sqlite3 from 'better-sqlite3'
import { runConfigMigrations, getConfigMigrationStatus } from '../db/config-migrations'

const DB_PATH =
  process.env.SQLITE_DB_PATH ??
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')

function parseArgs(): {
  dryRun: boolean
  status: boolean
  down: boolean
  steps: number
  target?: string
} {
  const args = process.argv.slice(2)

  // Parse and validate --steps
  const stepsArg = args.find((a) => a.startsWith('--steps='))?.split('=')[1] ?? '1'
  const steps = parseInt(stepsArg, 10)
  if (isNaN(steps) || steps < 0) {
    throw new Error(`Invalid --steps value: '${stepsArg}'. Must be a non-negative integer.`)
  }

  return {
    dryRun: args.includes('--dry-run'),
    status: args.includes('--status'),
    down: args.includes('--down'),
    steps,
    target: args.find((a) => a.startsWith('--target='))?.split('=')[1],
  }
}

async function main() {
  const opts = parseArgs()

  console.log(`[config-migrations] Using database: ${DB_PATH}`)

  let db: ReturnType<typeof sqlite3> | undefined
  try {
    db = sqlite3(DB_PATH)

    if (opts.status) {
      // Show status only
      const status = getConfigMigrationStatus(db)
      console.log('\n[config-migrations] Status:')
      console.log(`  Applied (${status.applied.length}):`)
      for (const name of status.applied) {
        console.log(`    ✓ ${name}`)
      }
      console.log(`  Pending (${status.pending.length}):`)
      for (const name of status.pending) {
        console.log(`    ○ ${name}`)
      }
      return
    }

    const result = await runConfigMigrations(db, {
      dryRun: opts.dryRun,
      direction: opts.down ? 'down' : 'up',
      steps: opts.steps,
      target: opts.target,
    })

    if (result.failed) {
      console.error(`\n[config-migrations] FAILED: ${result.failed}`)
      if (result.error) {
        console.error(result.error.message)
      }
      process.exit(1)
    }

    if (result.applied.length === 0 && result.skipped.length === 0) {
      console.log('[config-migrations] No migrations to apply')
    } else {
      const action = opts.down ? 'rolled back' : 'applied'
      const verb = opts.dryRun ? 'would be' : 'were'
      console.log(`\n[config-migrations] ${result.applied.length} migration(s) ${verb} ${action}:`)
      for (const name of result.applied) {
        console.log(`  ✓ ${name}`)
      }
      if (result.skipped.length > 0) {
        console.log(`\n[config-migrations] ${result.skipped.length} migration(s) skipped (dry-run):`)
        for (const name of result.skipped) {
          console.log(`  ○ ${name}`)
        }
      }
    }
  } finally {
    db?.close()
  }
}

main().catch((error) => {
  console.error('[config-migrations] Fatal error:', error)
  process.exit(1)
})
