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

export function down(db: Database.Database): void {
  // Re-insert a minimal skeleton for rollback safety
  const skeleton = {
    agents: {},
    taskFallbacks: { extraction: [], analysis: [], document: [] },
    modelRates: {},
    options: [],
  }
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO job_finder_config (id, payload_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?)`
  ).run('ai-settings', JSON.stringify(skeleton), now, 'rollback')
}
