import type { Logger } from 'pino'
import type { PersonalInfo, ContentItem, JobMatchWithListing } from '@shared/types'
import { logger as defaultLogger } from '../../logger'
import { env } from '../../config/env'
import { isVecAvailable } from '../../db/sqlite'
import { DocumentCacheRepository, type DocumentType } from './document-cache.repository'
import { PromptsRepository } from '../prompts/prompts.repository'
import { computeContentHash, computeJobFingerprint, normalizeRole } from './workflow/services/content-hash.util'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CacheContext {
  personalInfo: PersonalInfo
  contentItems: ContentItem[]
  documentType: DocumentType
  jobDescriptionText: string
  role: string
  company: string
  jobMatch: JobMatchWithListing | null
}

export type CacheLookupResult =
  | { tier: 'exact'; document: unknown }
  | { tier: 'semantic-full'; document: unknown; similarity: number }
  | { tier: 'semantic-partial'; document: unknown; similarity: number }
  | { tier: 'miss'; embedding?: number[] }

// ── Configuration ────────────────────────────────────────────────────────────

const CACHE_ENABLED = env.CACHE_ENABLED !== 'false'
const CACHE_DRY_RUN = env.CACHE_DRY_RUN === 'true'
const SIMILARITY_FULL_HIT = env.CACHE_SIMILARITY_FULL_HIT
const SIMILARITY_PARTIAL_HIT = env.CACHE_SIMILARITY_PARTIAL_HIT
const EMBEDDING_DIMS = 768
const EMBEDDING_TIMEOUT_MS = 5_000
const LITELLM_BASE_URL = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
const LITELLM_API_KEY = process.env.LITELLM_MASTER_KEY || ''

// ── Service ──────────────────────────────────────────────────────────────────

export class SemanticDocumentCache {
  private readonly repo = new DocumentCacheRepository()
  private readonly promptsRepo = new PromptsRepository()

  constructor(private readonly log: Logger = defaultLogger) {}

  /**
   * Look up cached document content for a generation request.
   * Tries Tier 1 (exact match) then Tier 2 (semantic similarity).
   * Gracefully degrades to a miss if sqlite-vec is unavailable or tables are missing.
   */
  async lookup(ctx: CacheContext): Promise<CacheLookupResult> {
    if (!CACHE_ENABLED || !isVecAvailable()) return { tier: 'miss' }

    try {
      return await this.lookupInternal(ctx)
    } catch (err) {
      this.log.warn({ err }, 'Document cache: lookup failed (non-fatal), treating as miss')
      return { tier: 'miss' }
    }
  }

  private async lookupInternal(ctx: CacheContext): Promise<CacheLookupResult> {
    const prompts = this.promptsRepo.getPrompts()
    const contentItemsHash = computeContentHash(ctx.personalInfo, ctx.contentItems, prompts)
    const roleNormalized = normalizeRole(ctx.role)
    const techStack = this.extractTechStack(ctx.jobMatch)
    const fingerprintHash = computeJobFingerprint(roleNormalized, techStack, contentItemsHash, ctx.company)

    // Tier 1: Exact match (non-mutating — hit is recorded only when result is used)
    const exactHit = this.repo.findExact(fingerprintHash, contentItemsHash, ctx.documentType)
    if (exactHit) {
      let document: unknown
      try {
        document = JSON.parse(exactHit.documentContentJson)
      } catch (err) {
        this.log.warn({ err }, 'Document cache: corrupt exact-hit entry, treating as miss')
        return { tier: 'miss' }
      }

      this.log.info(
        { tier: 'exact', documentType: ctx.documentType, role: ctx.role, company: ctx.company },
        'Document cache: exact hit'
      )

      if (CACHE_DRY_RUN) {
        this.log.info('Document cache: dry-run mode — returning miss despite exact hit')
        return { tier: 'miss' }
      }

      this.repo.recordHit(exactHit.id)
      return { tier: 'exact', document }
    }

    // Tier 2: Semantic similarity
    let embedding: number[]
    try {
      embedding = await this.embed(ctx.jobDescriptionText)
    } catch (err) {
      this.log.warn({ err }, 'Document cache: embedding failed, falling through to full generation')
      return { tier: 'miss' }
    }

    const similar = this.repo.findSimilar(embedding, contentItemsHash, ctx.documentType, 3)
    if (similar.length > 0) {
      const best = similar[0]

      this.log.info(
        {
          tier: best.similarity >= SIMILARITY_FULL_HIT ? 'semantic-full' : best.similarity >= SIMILARITY_PARTIAL_HIT ? 'semantic-partial' : 'miss',
          similarity: best.similarity,
          cachedRole: best.roleNormalized,
          cachedCompany: best.companyName,
          documentType: ctx.documentType,
        },
        'Document cache: semantic search result'
      )

      if (CACHE_DRY_RUN) {
        this.log.info(
          { similarity: best.similarity, threshold: { full: SIMILARITY_FULL_HIT, partial: SIMILARITY_PARTIAL_HIT } },
          'Document cache: dry-run mode — returning miss despite semantic hit'
        )
        return { tier: 'miss', embedding }
      }

      if (best.similarity >= SIMILARITY_FULL_HIT) {
        let document: unknown
        try {
          document = JSON.parse(best.documentContentJson)
        } catch (err) {
          this.log.warn({ err }, 'Document cache: corrupt semantic-hit entry, treating as miss')
          return { tier: 'miss', embedding }
        }
        this.repo.recordHit(best.id)
        return { tier: 'semantic-full', document, similarity: best.similarity }
      }

      if (best.similarity >= SIMILARITY_PARTIAL_HIT) {
        let document: unknown
        try {
          document = JSON.parse(best.documentContentJson)
        } catch (err) {
          this.log.warn({ err }, 'Document cache: corrupt semantic-hit entry, treating as miss')
          return { tier: 'miss', embedding }
        }
        this.repo.recordHit(best.id)
        return { tier: 'semantic-partial', document, similarity: best.similarity }
      }
    }

    this.log.info(
      { documentType: ctx.documentType, role: ctx.role },
      'Document cache: miss'
    )
    // Return the embedding so store() can reuse it instead of recomputing
    return { tier: 'miss', embedding }
  }

  /**
   * Store a generated document in the cache.
   * Non-fatal — failures are logged but don't block the generation pipeline.
   * Accepts an optional pre-computed embedding to avoid redundant computation
   * when called after a lookup miss.
   */
  async store(ctx: CacheContext, document: unknown, modelVersion: string | null, precomputedEmbedding?: number[]): Promise<void> {
    if (!CACHE_ENABLED || !isVecAvailable()) return

    try {
      const prompts = this.promptsRepo.getPrompts()
      const contentItemsHash = computeContentHash(ctx.personalInfo, ctx.contentItems, prompts)
      const roleNormalized = normalizeRole(ctx.role)
      const techStack = this.extractTechStack(ctx.jobMatch)
      const fingerprintHash = computeJobFingerprint(roleNormalized, techStack, contentItemsHash, ctx.company)

      let embedding: number[]
      if (precomputedEmbedding) {
        embedding = precomputedEmbedding
      } else {
        try {
          embedding = await this.embed(ctx.jobDescriptionText)
        } catch (err) {
          this.log.warn({ err }, 'Document cache: embedding failed during store, skipping cache write')
          return
        }
      }

      this.repo.store({
        embeddingVector: embedding,
        documentType: ctx.documentType,
        jobFingerprintHash: fingerprintHash,
        contentItemsHash,
        roleNormalized,
        techStackJson: techStack.length > 0 ? JSON.stringify(techStack) : null,
        documentContentJson: JSON.stringify(document),
        jobDescriptionText: ctx.jobDescriptionText || null,
        companyName: ctx.company || null,
        modelVersion,
      })

      this.log.info(
        { documentType: ctx.documentType, role: ctx.role, company: ctx.company },
        'Document cache: stored'
      )
    } catch (err) {
      this.log.warn({ err }, 'Document cache: store failed (non-fatal)')
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
      response = await fetch(`${LITELLM_BASE_URL}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LITELLM_API_KEY}`,
        },
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

  /**
   * Extract tech stack from job match data for fingerprinting.
   */
  private extractTechStack(jobMatch: JobMatchWithListing | null): string[] {
    if (!jobMatch) return []
    const combined = [
      ...(jobMatch.matchedSkills ?? []),
      ...(jobMatch.resumeIntakeData?.atsKeywords ?? []),
    ]
    return [...new Set(combined)]
  }
}
