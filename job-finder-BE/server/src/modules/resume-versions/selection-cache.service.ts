import { createHash } from 'node:crypto'
import type { Logger } from 'pino'
import type { JobMatchWithListing, ResumeItem } from '@shared/types'
import { logger as defaultLogger } from '../../logger'
import { env } from '../../config/env'
import { isVecAvailable } from '../../db/sqlite'
import { SelectionCacheRepository } from './selection-cache.repository'
import { normalizeRole, computeTechStackJaccard } from '../generator/workflow/services/content-hash.util'
import { canonicalizeTechStack, canonicalizeTechStackBroad } from '../generator/workflow/services/tech-taxonomy'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelectionResult {
  narrative_id: string
  resume_title: string
  experience_ids: string[]
  highlight_selections: Record<string, string[]>
  skill_ids: string[]
  project_ids: string[]
  education_ids: string[]
  reasoning: string
}

export type SelectionCacheLookupResult =
  | { tier: 'tech-fingerprint'; selection: SelectionResult }
  | { tier: 'broad-fingerprint'; selection: SelectionResult }
  | { tier: 'semantic'; selection: SelectionResult; similarity: number }
  | { tier: 'miss'; embedding?: number[] }

// ── Configuration ────────────────────────────────────────────────────────────

const CACHE_ENABLED = env.CACHE_ENABLED !== 'false'
const CACHE_DRY_RUN = env.CACHE_DRY_RUN === 'true'
const SIMILARITY_FULL_HIT = env.CACHE_SIMILARITY_FULL_HIT
const EMBEDDING_DIMS = 768
const EMBEDDING_TIMEOUT_MS = 5_000
const LITELLM_BASE_URL = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
const LITELLM_API_KEY = process.env.LITELLM_MASTER_KEY || ''

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 fingerprint from sorted role types + tech list + pool hash.
 * Used for both Tier 1 (canonical techs) and Tier 1.5 (broad categories).
 */
export function computeSelectionFingerprint(
  sortedRoleTypes: string[],
  sortedTechs: string[],
  poolItemsHash: string
): string {
  const payload = JSON.stringify([sortedRoleTypes, sortedTechs, poolItemsHash])
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Compute a deterministic hash of pool items for cache invalidation.
 * Changes when items are added, removed, or modified (any field change
 * invalidates all cached selections).
 */
export function computePoolItemsHash(items: ResumeItem[]): string {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
  const payload = sorted.map(item => ({
    id: item.id,
    aiContext: item.aiContext,
    title: item.title,
    description: item.description,
    skills: item.skills ? [...item.skills].sort() : null,
  }))
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// ── Service ──────────────────────────────────────────────────────────────────

export class SelectionCacheService {
  private readonly repo = new SelectionCacheRepository()

  constructor(private readonly log: Logger = defaultLogger) {}

  /**
   * Look up a cached pool-item selection for a job match.
   * Tries Tier 1 (exact tech fingerprint) → Tier 1.5 (broad) → Tier 2 (semantic).
   * Gracefully degrades to miss on any error.
   */
  async lookup(match: JobMatchWithListing, poolItemsHash: string): Promise<SelectionCacheLookupResult> {
    if (!CACHE_ENABLED) return { tier: 'miss' }

    try {
      return await this.lookupInternal(match, poolItemsHash)
    } catch (err) {
      this.log.warn({ err }, 'Selection cache: lookup failed (non-fatal), treating as miss')
      return { tier: 'miss' }
    }
  }

  private async lookupInternal(match: JobMatchWithListing, poolItemsHash: string): Promise<SelectionCacheLookupResult> {
    const extraction = match.listing.filterResult?.extraction as
      | { technologies?: string[]; roleTypes?: string[] }
      | undefined
    const technologies = extraction?.technologies ?? []
    const roleTypes = [...(extraction?.roleTypes ?? [])].sort()
    const roleNormalized = normalizeRole(match.listing.title)
    const canonicalTechs = canonicalizeTechStack(technologies)
    const broadCategories = canonicalizeTechStackBroad(technologies)

    // Tier 1: Exact tech fingerprint
    const techFpHash = computeSelectionFingerprint(roleTypes, canonicalTechs, poolItemsHash)
    const exactHit = this.repo.findByTechFingerprint(techFpHash, poolItemsHash)
    if (exactHit) {
      let selection: SelectionResult
      try {
        selection = JSON.parse(exactHit.selectionJson) as SelectionResult
      } catch (err) {
        this.log.warn({ err }, 'Selection cache: corrupt exact-hit entry, treating as miss')
        return { tier: 'miss' }
      }

      this.log.info(
        { tier: 'tech-fingerprint', role: roleNormalized, roleTypes },
        'Selection cache: exact tech fingerprint hit'
      )

      if (CACHE_DRY_RUN) {
        this.log.info('Selection cache: dry-run mode — returning miss despite exact hit')
        return { tier: 'miss' }
      }

      this.repo.recordHit(exactHit.id)
      return { tier: 'tech-fingerprint', selection }
    }

    // Tier 1.5: Broad fingerprint
    const broadFpHash = computeSelectionFingerprint(roleTypes, broadCategories, poolItemsHash)
    const broadHit = this.repo.findByBroadFingerprint(broadFpHash, poolItemsHash)
    if (broadHit) {
      let selection: SelectionResult
      try {
        selection = JSON.parse(broadHit.selectionJson) as SelectionResult
      } catch (err) {
        this.log.warn({ err }, 'Selection cache: corrupt broad-hit entry, treating as miss')
        // Fall through to Tier 2
        return this.semanticLookup(match, poolItemsHash, roleNormalized, canonicalTechs)
      }

      this.log.info(
        { tier: 'broad-fingerprint', role: roleNormalized, roleTypes, cachedRole: broadHit.roleNormalized },
        'Selection cache: broad fingerprint hit'
      )

      if (CACHE_DRY_RUN) {
        this.log.info('Selection cache: dry-run mode — returning miss despite broad hit')
        return this.semanticLookup(match, poolItemsHash, roleNormalized, canonicalTechs)
      }

      this.repo.recordHit(broadHit.id)
      return { tier: 'broad-fingerprint', selection }
    }

    // Tier 2: Semantic similarity
    return this.semanticLookup(match, poolItemsHash, roleNormalized, canonicalTechs)
  }

  private async semanticLookup(
    match: JobMatchWithListing,
    poolItemsHash: string,
    roleNormalized: string,
    canonicalTechs: string[]
  ): Promise<SelectionCacheLookupResult> {
    // Tier 2 requires sqlite-vec for embedding search
    if (!isVecAvailable()) return { tier: 'miss' }

    const extraction = match.listing.filterResult?.extraction as
      | { technologies?: string[] }
      | undefined
    const technologies = extraction?.technologies ?? []

    const embeddingText = `${roleNormalized} | ${technologies.join(', ')}`
    let embedding: number[]
    try {
      embedding = await this.embed(embeddingText)
    } catch (err) {
      this.log.warn({ err }, 'Selection cache: embedding failed, treating as miss')
      return { tier: 'miss' }
    }

    const similar = this.repo.findSimilar(embedding, poolItemsHash, 3)

    // Apply Jaccard tech-stack boost
    if (similar.length > 0 && canonicalTechs.length > 0) {
      for (const entry of similar) {
        if (entry.techStackJson) {
          try {
            const cachedTechStack = JSON.parse(entry.techStackJson) as string[]
            if (cachedTechStack.length > 0) {
              const jaccard = computeTechStackJaccard(canonicalTechs, cachedTechStack)
              entry.similarity = entry.similarity * 0.7 + jaccard * 0.3
            }
          } catch {
            // Corrupt tech_stack_json — skip boost
          }
        }
      }
      similar.sort((a, b) => b.similarity - a.similarity)
    }

    if (similar.length > 0) {
      const best = similar[0]

      this.log.info(
        {
          tier: best.similarity >= SIMILARITY_FULL_HIT ? 'semantic' : 'miss',
          similarity: best.similarity,
          threshold: SIMILARITY_FULL_HIT,
          cachedRole: best.roleNormalized,
        },
        'Selection cache: semantic search result'
      )

      if (CACHE_DRY_RUN) {
        this.log.info(
          { similarity: best.similarity, threshold: SIMILARITY_FULL_HIT },
          'Selection cache: dry-run mode — returning miss despite semantic result'
        )
        return { tier: 'miss', embedding }
      }

      if (best.similarity >= SIMILARITY_FULL_HIT) {
        let selection: SelectionResult
        try {
          selection = JSON.parse(best.selectionJson) as SelectionResult
        } catch (err) {
          this.log.warn({ err }, 'Selection cache: corrupt semantic-hit entry, treating as miss')
          return { tier: 'miss', embedding }
        }
        this.repo.recordHit(best.id)
        return { tier: 'semantic', selection, similarity: best.similarity }
      }
    }

    this.log.info(
      { role: roleNormalized },
      'Selection cache: miss'
    )
    return { tier: 'miss', embedding }
  }

  /**
   * Store a selection result in the cache.
   * Non-fatal — failures are logged but don't block the pipeline.
   */
  async store(
    match: JobMatchWithListing,
    poolItemsHash: string,
    selection: SelectionResult,
    precomputedEmbedding?: number[]
  ): Promise<void> {
    if (!CACHE_ENABLED || !isVecAvailable()) return

    try {
      const extraction = match.listing.filterResult?.extraction as
        | { technologies?: string[]; roleTypes?: string[] }
        | undefined
      const technologies = extraction?.technologies ?? []
      const roleTypes = [...(extraction?.roleTypes ?? [])].sort()
      const roleNormalized = normalizeRole(match.listing.title)
      const canonicalTechs = canonicalizeTechStack(technologies)
      const broadCategories = canonicalizeTechStackBroad(technologies)

      let embedding: number[]
      if (precomputedEmbedding) {
        embedding = precomputedEmbedding
      } else {
        const embeddingText = `${roleNormalized} | ${technologies.join(', ')}`
        try {
          embedding = await this.embed(embeddingText)
        } catch (err) {
          this.log.warn({ err }, 'Selection cache: embedding failed during store, skipping')
          return
        }
      }

      const techFpHash = computeSelectionFingerprint(roleTypes, canonicalTechs, poolItemsHash)
      const broadFpHash = computeSelectionFingerprint(roleTypes, broadCategories, poolItemsHash)

      this.repo.store({
        embeddingVector: embedding,
        selectionJson: JSON.stringify(selection),
        techFingerprintHash: techFpHash,
        broadFingerprintHash: broadFpHash,
        poolItemsHash,
        roleTypesJson: roleTypes.length > 0 ? JSON.stringify(roleTypes) : null,
        techStackJson: canonicalTechs.length > 0 ? JSON.stringify(canonicalTechs) : null,
        roleNormalized,
      })

      this.log.info(
        { role: roleNormalized, roleTypes },
        'Selection cache: stored'
      )
    } catch (err) {
      this.log.warn({ err }, 'Selection cache: store failed (non-fatal)')
    }
  }

  /**
   * Call LiteLLM /v1/embeddings endpoint to get a 768D vector.
   */
  private async embed(text: string): Promise<number[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

    let response: Response
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (LITELLM_API_KEY) {
        headers.Authorization = `Bearer ${LITELLM_API_KEY}`
      }
      response = await fetch(`${LITELLM_BASE_URL}/v1/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'local-embed',
          input: text,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Embedding request failed (HTTP ${response.status}): ${body.slice(0, 200)}`)
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>
    }

    const embedding = data.data?.[0]?.embedding
    if (!embedding || embedding.length !== EMBEDDING_DIMS) {
      throw new Error(
        `Unexpected embedding dimensions: expected ${EMBEDDING_DIMS}, got ${embedding?.length ?? 0}`
      )
    }

    return embedding
  }
}
