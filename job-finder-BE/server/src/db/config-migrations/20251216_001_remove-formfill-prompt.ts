/**
 * Migration: Remove formFill prompt from ai-prompts config
 *
 * The form fill prompt has been moved from the database to the job-applicator
 * Electron app. It is now hardcoded in:
 *   - job-applicator/src/prompts/form-fill-workflow.ts (workflow instructions)
 *   - job-applicator/src/form-fill-safety.ts (safety rules + assembly)
 *
 * This migration removes the formFill field from the ai-prompts config entry.
 */

import type Database from 'better-sqlite3'

export const description = 'Remove formFill prompt from ai-prompts config (moved to Electron app)'

type PromptConfigWithFormFill = {
  resumeGeneration: string
  coverLetterGeneration: string
  jobScraping: string
  jobMatching: string
  formFill?: string // Legacy field to be removed
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-prompts') as { payload_json: string } | undefined

  if (!row) {
    // No ai-prompts config exists, nothing to migrate
    return
  }

  const parsed = JSON.parse(row.payload_json) as PromptConfigWithFormFill

  if (!('formFill' in parsed)) {
    // Already migrated, nothing to do
    return
  }

  // Remove the formFill field
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { formFill: _removed, ...restConfig } = parsed

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(restConfig), new Date().toISOString(), 'config-migration', 'ai-prompts')
}

export function down(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-prompts') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as PromptConfigWithFormFill

  if ('formFill' in parsed) {
    // Already has formFill field, nothing to rollback
    return
  }

  // Add back the formFill field with a placeholder value
  // Note: The actual prompt content would need to be restored from backup if needed
  const restored: PromptConfigWithFormFill = {
    ...parsed,
    formFill: '-- PLACEHOLDER: Restore from backup if needed --',
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(restored), new Date().toISOString(), 'config-migration-rollback', 'ai-prompts')
}
