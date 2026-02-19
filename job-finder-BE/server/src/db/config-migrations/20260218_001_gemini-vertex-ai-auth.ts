/**
 * Migration: Add GOOGLE_CLOUD_PROJECT to gemini.api authRequirements
 *
 * The backend now supports Vertex AI auth (via @google/genai unified SDK),
 * matching the worker. Add GOOGLE_CLOUD_PROJECT to the requiredEnv list
 * so that checkAuth passes when any of the three env vars is present.
 */

import type Database from 'better-sqlite3'
import type { AgentId, AgentConfig, AgentAuthRequirements } from '@shared/types'

export const description = 'Add GOOGLE_CLOUD_PROJECT to gemini.api auth requirements'

const GEMINI_AUTH: AgentAuthRequirements = {
  type: 'api',
  requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_PROJECT'],
}

type AISettings = {
  agents: Partial<Record<AgentId, AgentConfig>>
  [key: string]: unknown
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-settings') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as AISettings
  const gemini = parsed.agents?.['gemini.api' as AgentId]
  if (!gemini) return

  gemini.authRequirements = GEMINI_AUTH

  db.prepare(
    'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
  ).run(JSON.stringify(parsed), new Date().toISOString(), 'config-migration', 'ai-settings')
}

export function down(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-settings') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as AISettings
  const gemini = parsed.agents?.['gemini.api' as AgentId]
  if (!gemini) return

  // Restore to pre-migration state (without GOOGLE_CLOUD_PROJECT)
  gemini.authRequirements = {
    type: 'api',
    requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  }

  db.prepare(
    'UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?'
  ).run(JSON.stringify(parsed), new Date().toISOString(), 'config-migration', 'ai-settings')
}
