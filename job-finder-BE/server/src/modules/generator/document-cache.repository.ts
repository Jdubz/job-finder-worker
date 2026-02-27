import { getDb } from '../../db/sqlite'
import { logger } from '../../logger'

// ── Types ────────────────────────────────────────────────────────────────────

export type DocumentType = 'resume' | 'cover_letter'

export interface CacheStoreParams {
  embeddingVector: number[]
  documentType: DocumentType
  jobFingerprintHash: string
  contentItemsHash: string
  roleNormalized: string
  techStackJson: string | null
  documentContentJson: string
  jobDescriptionText: string | null
  companyName: string | null
  modelVersion: string | null
}

export interface CacheRow {
  id: number
  documentContentJson: string
  roleNormalized: string
  companyName: string | null
  hitCount: number
}

export interface SimilarityResult {
  id: number
  documentContentJson: string
  roleNormalized: string
  companyName: string | null
  distance: number
  similarity: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 500
const EVICTION_BATCH_SIZE = 10

// ── Repository ───────────────────────────────────────────────────────────────

export class DocumentCacheRepository {
  private get db() {
    return getDb()
  }

  /**
   * Tier 1: Exact fingerprint match.
   * Returns cached document content or null. Updates hit metadata on match.
   */
  findExact(
    fingerprintHash: string,
    contentItemsHash: string,
    documentType: DocumentType
  ): string | null {
    const row = this.db.prepare(`
      SELECT id, document_content_json FROM document_cache
      WHERE job_fingerprint_hash = ?
        AND content_items_hash = ?
        AND document_type = ?
      LIMIT 1
    `).get(fingerprintHash, contentItemsHash, documentType) as { id: number; document_content_json: string } | undefined

    if (!row) return null

    // Update hit metadata
    this.db.prepare(`
      UPDATE document_cache
      SET hit_count = hit_count + 1, last_hit_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(row.id)

    return row.document_content_json
  }

  /**
   * Tier 2: KNN semantic similarity search.
   * Queries vec0 for k*3 nearest neighbors, then filters by content_items_hash
   * and document_type in application code (vec0 doesn't support post-filtering).
   * Returns top k results with similarity scores.
   */
  findSimilar(
    embedding: number[],
    contentItemsHash: string,
    documentType: DocumentType,
    k: number = 5
  ): SimilarityResult[] {
    const queryBuffer = Buffer.from(new Float32Array(embedding).buffer)

    // Fetch k*3 nearest neighbors from vec0
    const knnRows = this.db.prepare(`
      SELECT rowid, distance
      FROM job_cache_embeddings
      WHERE embedding MATCH ?
        AND k = ?
    `).all(queryBuffer, k * 3) as Array<{ rowid: number; distance: number }>

    if (!knnRows.length) return []

    // Join with document_cache and filter by content_items_hash + document_type
    const rowids = knnRows.map((r) => r.rowid)
    const distanceMap = new Map(knnRows.map((r) => [r.rowid, r.distance]))

    const placeholders = rowids.map(() => '?').join(',')
    const cacheRows = this.db.prepare(`
      SELECT id, embedding_rowid, document_content_json, role_normalized, company_name
      FROM document_cache
      WHERE embedding_rowid IN (${placeholders})
        AND content_items_hash = ?
        AND document_type = ?
    `).all(...rowids, contentItemsHash, documentType) as Array<{
      id: number
      embedding_rowid: number
      document_content_json: string
      role_normalized: string
      company_name: string | null
    }>

    // Combine with distances and sort by similarity descending.
    // vec0 returns L2 (Euclidean) distance. For normalized embeddings:
    //   L2² = 2(1 - cos θ)  →  cos θ = 1 - L2²/2
    const results: SimilarityResult[] = cacheRows
      .map((row) => {
        const distance = distanceMap.get(row.embedding_rowid) ?? Infinity
        return {
          id: row.id,
          documentContentJson: row.document_content_json,
          roleNormalized: row.role_normalized,
          companyName: row.company_name,
          distance,
          similarity: 1.0 - (distance * distance) / 2.0,
        }
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)

    return results
  }

  /**
   * Record a cache hit for a specific entry (updates hit_count and last_hit_at).
   * Called by the service layer after it decides which result to actually use.
   */
  recordHit(id: number): void {
    this.db.prepare(`
      UPDATE document_cache
      SET hit_count = hit_count + 1, last_hit_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id)
  }

  /**
   * Store a new cache entry. Evicts oldest entries if at capacity.
   * Runs in a transaction: insert embedding → insert document_cache row.
   */
  store(params: CacheStoreParams): void {
    const embeddingBuffer = Buffer.from(new Float32Array(params.embeddingVector).buffer)

    const insertTransaction = this.db.transaction(() => {
      this.evictIfNeeded()

      // Insert embedding into vec0
      const embResult = this.db.prepare(`
        INSERT INTO job_cache_embeddings (embedding) VALUES (?)
      `).run(embeddingBuffer)

      const embeddingRowid = embResult.lastInsertRowid

      // Insert document_cache row
      this.db.prepare(`
        INSERT INTO document_cache (
          embedding_rowid, document_type, job_fingerprint_hash, content_items_hash,
          role_normalized, tech_stack_json, document_content_json,
          job_description_text, company_name, model_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        embeddingRowid,
        params.documentType,
        params.jobFingerprintHash,
        params.contentItemsHash,
        params.roleNormalized,
        params.techStackJson,
        params.documentContentJson,
        params.jobDescriptionText,
        params.companyName,
        params.modelVersion
      )
    })

    insertTransaction()
  }

  /**
   * Remove all cache entries whose content_items_hash differs from the current hash.
   * Call after any profile mutation (personal info, content items, prompts) to purge stale entries.
   * Returns the number of removed entries.
   */
  removeStaleEntries(currentContentHash: string): number {
    const deleteTransaction = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT embedding_rowid FROM document_cache
        WHERE content_items_hash != ?
      `).all(currentContentHash) as Array<{ embedding_rowid: number }>

      if (!rows.length) return 0

      const rowids = rows.map((r) => r.embedding_rowid)
      const placeholders = rowids.map(() => '?').join(',')
      this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid IN (${placeholders})`).run(...rowids)

      this.db.prepare(`
        DELETE FROM document_cache WHERE content_items_hash != ?
      `).run(currentContentHash)

      return rows.length
    })

    const removed = deleteTransaction()
    if (removed > 0) {
      logger.info({ removed }, 'Document cache: removed stale entries')
    }
    return removed
  }

  /**
   * Invalidate cache entries by content items hash and document type.
   * Used when the user's profile content changes.
   */
  invalidateByContentHash(contentItemsHash: string, documentType: DocumentType): void {
    this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT embedding_rowid FROM document_cache
        WHERE content_items_hash = ? AND document_type = ?
      `).all(contentItemsHash, documentType) as Array<{ embedding_rowid: number }>

      if (!rows.length) return

      const rowids = rows.map((r) => r.embedding_rowid)
      const placeholders = rowids.map(() => '?').join(',')
      this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid IN (${placeholders})`).run(...rowids)

      this.db.prepare(`
        DELETE FROM document_cache
        WHERE content_items_hash = ? AND document_type = ?
      `).run(contentItemsHash, documentType)
    })()
  }

  /**
   * Prune entries older than the specified number of days.
   */
  pruneOlderThan(days: number): number {
    return this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT embedding_rowid FROM document_cache
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `).all(days) as Array<{ embedding_rowid: number }>

      if (!rows.length) return 0

      const rowids = rows.map((r) => r.embedding_rowid)
      const placeholders = rowids.map(() => '?').join(',')
      this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid IN (${placeholders})`).run(...rowids)

      this.db.prepare(`
        DELETE FROM document_cache
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `).run(days)

      return rows.length
    })()
  }

  /**
   * Evict least-recently-used entries if cache is at capacity.
   */
  private evictIfNeeded(): void {
    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM document_cache`).get() as { count: number }

    if (countRow.count < MAX_CACHE_ENTRIES) return

    const toEvict = this.db.prepare(`
      SELECT id, embedding_rowid FROM document_cache
      ORDER BY last_hit_at ASC, hit_count ASC
      LIMIT ?
    `).all(EVICTION_BATCH_SIZE) as Array<{ id: number; embedding_rowid: number }>

    if (!toEvict.length) return

    const embeddingRowids = toEvict.map((r) => r.embedding_rowid)
    const cacheIds = toEvict.map((r) => r.id)
    const embPlaceholders = embeddingRowids.map(() => '?').join(',')
    const cachePlaceholders = cacheIds.map(() => '?').join(',')

    this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid IN (${embPlaceholders})`).run(...embeddingRowids)
    this.db.prepare(`DELETE FROM document_cache WHERE id IN (${cachePlaceholders})`).run(...cacheIds)

    logger.info({ evicted: toEvict.length }, 'Document cache LRU eviction')
  }
}
