/**
 * Backfill the semantic document cache from past completed generation requests.
 *
 * Usage:
 *   npm run backfill:cache              # normal backfill
 *   npm run backfill:cache -- --dry-run # log what would be cached without inserting
 */

import path from 'node:path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { runMigrations } from '../db/migrations.js'
import {
  computeContentHash,
  computeJobFingerprint,
  normalizeRole,
} from '../modules/generator/workflow/services/content-hash.util'
import type { DocumentType } from '../modules/generator/document-cache.repository'
import type { PersonalInfo, ContentItem, PromptConfig } from '@shared/types'

// ── Configuration ─────────────────────────────────────────────────────────────

const DB_PATH =
  process.env.SQLITE_DB_PATH ??
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')

const MIGRATIONS_DIR =
  process.env.JF_SQLITE_MIGRATIONS_DIR ??
  process.env.SCHEMA_DIR ??
  (process.env.SCHEMA_FILE ? path.dirname(process.env.SCHEMA_FILE) : undefined) ??
  path.resolve(__dirname, '../../infra/sqlite/migrations')

const LITELLM_BASE_URL = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
const LITELLM_API_KEY = process.env.LITELLM_MASTER_KEY || ''

const EMBEDDING_DIMS = 768
const EMBEDDING_TIMEOUT_MS = 10_000
const EMBED_DELAY_MS = 100 // delay between embedding requests to avoid overwhelming Ollama

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeneratorRequestRow {
  id: string
  generate_type: string
  job_json: string
  job_match_id: string | null
  intermediate_results_json: string | null
}

interface JobMatchRow {
  job_listing_id: string
  matched_skills: string | null
  resume_intake_json: string | null
}

interface JobListingRow {
  description: string
}

interface IntermediateResults {
  resumeContent?: unknown
  coverLetterContent?: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') }
}

function safeJsonParse<T>(json: string | null | undefined): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

async function embed(text: string): Promise<number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${LITELLM_BASE_URL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LITELLM_API_KEY}`,
      },
      body: JSON.stringify({ model: 'local-embed', input: text }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Embedding request failed (HTTP ${response.status}): ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> }
  const embedding = data.data?.[0]?.embedding

  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding dimensions: expected ${EMBEDDING_DIMS}, got ${embedding?.length ?? 0}`)
  }

  return embedding
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { dryRun } = parseArgs()
  if (dryRun) console.log('[backfill] DRY RUN — no entries will be inserted\n')

  // 1. Open DB with sqlite-vec
  console.log(`[backfill] Opening database: ${DB_PATH}`)
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 15000')
  sqliteVec.load(db)
  runMigrations(db, MIGRATIONS_DIR)

  // 2. Load profile data and compute content hash
  const personalInfoRow = db
    .prepare(`SELECT payload_json FROM job_finder_config WHERE id = ?`)
    .get('personal-info') as { payload_json: string } | undefined

  if (!personalInfoRow) {
    console.error('[backfill] ERROR: personal-info config not found. Aborting.')
    db.close()
    process.exit(1)
  }
  const personalInfo = JSON.parse(personalInfoRow.payload_json) as PersonalInfo

  const contentItemRows = db
    .prepare(`SELECT * FROM content_items ORDER BY parent_id IS NOT NULL, parent_id, order_index ASC`)
    .all() as Array<{
      id: string
      parent_id: string | null
      order_index: number
      title: string | null
      role: string | null
      location: string | null
      website: string | null
      start_date: string | null
      end_date: string | null
      description: string | null
      skills: string | null
      ai_context: string | null
      created_at: string
      updated_at: string
      created_by: string
      updated_by: string
    }>

  const contentItems: ContentItem[] = contentItemRows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    order: row.order_index,
    title: row.title,
    role: row.role,
    location: row.location,
    website: row.website,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    skills: row.skills ? (JSON.parse(row.skills) as string[]) : undefined,
    aiContext: row.ai_context as ContentItem['aiContext'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }))

  const promptsRow = db
    .prepare(`SELECT payload_json FROM job_finder_config WHERE id = ?`)
    .get('ai-prompts') as { payload_json: string } | undefined

  if (!promptsRow) {
    console.error('[backfill] ERROR: ai-prompts config not found. Aborting.')
    db.close()
    process.exit(1)
  }
  const prompts = JSON.parse(promptsRow.payload_json) as PromptConfig

  const contentItemsHash = computeContentHash(personalInfo, contentItems, prompts)
  console.log(`[backfill] Content items hash: ${contentItemsHash.slice(0, 12)}...`)
  console.log(`[backfill] Content items: ${contentItems.length}, prompts loaded\n`)

  // 3. Query completed generation requests with intermediate results
  const rows = db
    .prepare(
      `SELECT id, generate_type, job_json, job_match_id, intermediate_results_json
       FROM generator_requests
       WHERE status IN ('completed', 'awaiting_review')
         AND intermediate_results_json IS NOT NULL`
    )
    .all() as GeneratorRequestRow[]

  console.log(`[backfill] Found ${rows.length} completed requests with intermediate results\n`)

  // Prepare statements for lookups
  const findJobMatch = db.prepare(
    `SELECT job_listing_id, matched_skills, resume_intake_json
     FROM job_matches WHERE id = ?`
  )
  const findJobListing = db.prepare(
    `SELECT description FROM job_listings WHERE id = ?`
  )
  const findExistingCache = db.prepare(
    `SELECT 1 FROM document_cache
     WHERE job_fingerprint_hash = ? AND content_items_hash = ? AND document_type = ?
     LIMIT 1`
  )

  // Prepare insert statements (same pattern as DocumentCacheRepository.store)
  const insertEmbedding = db.prepare(
    `INSERT INTO job_cache_embeddings (embedding) VALUES (?)`
  )
  const insertCacheEntry = db.prepare(
    `INSERT INTO document_cache (
      embedding_rowid, document_type, job_fingerprint_hash, content_items_hash,
      role_normalized, tech_stack_json, document_content_json,
      job_description_text, company_name, model_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  let inserted = 0
  let skippedDuplicate = 0
  let skippedNoContent = 0
  let failed = 0

  for (const row of rows) {
    const job = safeJsonParse<Record<string, unknown>>(row.job_json)
    const intermediateResults = safeJsonParse<IntermediateResults>(row.intermediate_results_json)

    if (!job || !intermediateResults) {
      failed++
      console.log(`  [skip] ${row.id}: failed to parse job_json or intermediate_results_json`)
      continue
    }

    const role = (job.role as string) || (job.jobTitle as string) || ''
    const company = (job.company as string) || (job.companyName as string) || ''

    // Resolve job description: prefer job_json, fall back to job_listings
    let jobDescriptionText = (job.jobDescriptionText as string) || (job.description as string) || ''
    if (!jobDescriptionText && row.job_match_id) {
      const matchRow = findJobMatch.get(row.job_match_id) as JobMatchRow | undefined
      if (matchRow) {
        const listingRow = findJobListing.get(matchRow.job_listing_id) as JobListingRow | undefined
        if (listingRow) {
          jobDescriptionText = listingRow.description
        }
      }
    }

    if (!jobDescriptionText) {
      skippedNoContent++
      console.log(`  [skip] ${row.id}: no job description text available`)
      continue
    }

    if (!role) {
      skippedNoContent++
      console.log(`  [skip] ${row.id}: no role available`)
      continue
    }

    // Extract tech stack from job_matches
    let techStack: string[] = []
    if (row.job_match_id) {
      const matchRow = findJobMatch.get(row.job_match_id) as JobMatchRow | undefined
      if (matchRow) {
        const matchedSkills = safeJsonParse<string[]>(matchRow.matched_skills) ?? []
        const intake = safeJsonParse<{ atsKeywords?: string[] }>(matchRow.resume_intake_json)
        const atsKeywords = intake?.atsKeywords ?? []
        techStack = [...new Set([...matchedSkills, ...atsKeywords])]
      }
    }

    const roleNormalized = normalizeRole(role)

    // Process each document type present in intermediate results
    const docTypes: Array<{ type: DocumentType; content: unknown }> = []
    if (intermediateResults.resumeContent) {
      docTypes.push({ type: 'resume', content: intermediateResults.resumeContent })
    }
    if (intermediateResults.coverLetterContent) {
      docTypes.push({ type: 'cover_letter', content: intermediateResults.coverLetterContent })
    }

    if (docTypes.length === 0) {
      skippedNoContent++
      continue
    }

    for (const { type, content } of docTypes) {
      const fingerprintHash = computeJobFingerprint(roleNormalized, techStack, contentItemsHash, company)

      // Check for existing cache entry
      const existing = findExistingCache.get(fingerprintHash, contentItemsHash, type)
      if (existing) {
        skippedDuplicate++
        continue
      }

      if (dryRun) {
        console.log(`  [dry-run] Would cache ${type} for "${role}" @ ${company || '(no company)'}`)
        inserted++
        continue
      }

      // Get embedding
      try {
        const embedding = await embed(jobDescriptionText)
        const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)

        // Insert in a transaction (same pattern as DocumentCacheRepository.store)
        db.transaction(() => {
          const embResult = insertEmbedding.run(embeddingBuffer)
          const embeddingRowid = embResult.lastInsertRowid

          insertCacheEntry.run(
            embeddingRowid,
            type,
            fingerprintHash,
            contentItemsHash,
            roleNormalized,
            techStack.length > 0 ? JSON.stringify(techStack) : null,
            JSON.stringify(content),
            jobDescriptionText || null,
            company || null,
            null // modelVersion — unknown for past generations
          )
        })()

        inserted++
        console.log(`  [cached] ${type} for "${role}" @ ${company || '(no company)'}`)

        await sleep(EMBED_DELAY_MS)
      } catch (err) {
        failed++
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  [error] ${type} for "${role}" @ ${company || '(no company)'}: ${msg}`)
      }
    }
  }

  db.close()

  // Summary
  console.log('\n[backfill] Done!')
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped (duplicate): ${skippedDuplicate}`)
  console.log(`  Skipped (no content/role): ${skippedNoContent}`)
  console.log(`  Failed: ${failed}`)

  if (dryRun) {
    console.log('\n  (dry-run mode — nothing was actually written)')
  }
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err)
  process.exit(1)
})
