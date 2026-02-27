/**
 * Migration: Remove vestigial ai-settings config
 *
 * The ai-settings config (agents, taskFallbacks, modelRates, dailyBudget/dailyUsage,
 * runtimeState) is entirely vestigial. InferenceClient routes directly to LiteLLM
 * with hardcoded task→model mappings and never reads the DB config. This migration
 * removes the dead config row.
 */

import type Database from 'better-sqlite3'

export const description = 'Remove vestigial ai-settings config (LiteLLM handles routing)'

export function up(db: Database.Database): void {
  db.prepare('DELETE FROM job_finder_config WHERE id = ?').run('ai-settings')
}

export function down(_db: Database.Database): void {
  // Rollback is intentionally unsupported: the legacy ai-settings config is
  // vestigial and any skeleton we insert would fail validation on revisions
  // that expect a fully-populated payload.
  throw new Error(
    'Down migration for 20260226_001_remove-ai-settings is not supported: ai-settings config has been removed.'
  )
}
