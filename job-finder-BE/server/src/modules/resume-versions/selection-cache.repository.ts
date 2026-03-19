import { getDb } from '../../db/sqlite'
import { logger } from '../../logger'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SelectionCacheStoreParams {
  embeddingVector: number[]
  selectionJson: string
  techFingerprintHash: string
  broadFingerprintHash: string
  poolItemsHash: string
  roleTypesJson: string | null
  techStackJson: string | null
  roleNormalized: string | null
}

export interface SelectionCacheRow {
  id: number
  selectionJson: string
  roleNormalized: string | null
  hitCount: number
}

export interface SelectionSimilarityResult {
  id: number
  selectionJson: string
  roleNormalized: string | null
  techStackJson: string | null
  distance: number
  similarity: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 200
const EVICTION_BATCH_SIZE = 10

// ── Repository ───────────────────────────────────────────────────────────────

export class SelectionCacheRepository {
  private get db() {
    return getDb()
  }

  /**
   * Tier 1: Exact tech fingerprint match.
   * Matches on identical roleTypes + canonical tech stack + pool version.
   */
  findByTechFingerprint(
    userId: string,
    techFpHash: string,
    poolItemsHash: string
  ): SelectionCacheRow | null {
    const row = this.db.prepare(`
      SELECT id, selection_json, role_normalized, hit_count
      FROM selection_cache
      WHERE tech_fingerprint_hash = ?
        AND pool_items_hash = ?
        AND user_id = ?
      LIMIT 1
    `).get(techFpHash, poolItemsHash, userId) as {
      id: number
      selection_json: string
      role_normalized: string | null
      hit_count: number
    } | undefined

    if (!row) return null

    return {
      id: row.id,
      selectionJson: row.selection_json,
      roleNormalized: row.role_normalized,
      hitCount: row.hit_count,
    }
  }

  /**
   * Tier 1.5: Broad fingerprint match.
   * Matches on identical roleTypes + broad tech categories + pool version.
   * Returns most-recently-used if multiple entries match.
   */
  findByBroadFingerprint(
    userId: string,
    broadFpHash: string,
    poolItemsHash: string
  ): SelectionCacheRow | null {
    const row = this.db.prepare(`
      SELECT id, selection_json, role_normalized, hit_count
      FROM selection_cache
      WHERE broad_fingerprint_hash = ?
        AND pool_items_hash = ?
        AND user_id = ?
      ORDER BY last_hit_at DESC
      LIMIT 1
    `).get(broadFpHash, poolItemsHash, userId) as {
      id: number
      selection_json: string
      role_normalized: string | null
      hit_count: number
    } | undefined

    if (!row) return null

    return {
      id: row.id,
      selectionJson: row.selection_json,
      roleNormalized: row.role_normalized,
      hitCount: row.hit_count,
    }
  }

  /**
   * Tier 2: KNN semantic similarity search.
   * Queries the shared job_cache_embeddings vec0 table for nearest neighbors,
   * then joins with selection_cache filtering by pool_items_hash.
   */
  findSimilar(
    userId: string,
    embedding: number[],
    poolItemsHash: string,
    k: number = 5
  ): SelectionSimilarityResult[] {
    const queryBuffer = Buffer.from(new Float32Array(embedding).buffer)

    // Fetch k*3 nearest neighbors from vec0
    const knnRows = this.db.prepare(`
      SELECT rowid, distance
      FROM job_cache_embeddings
      WHERE embedding MATCH ?
        AND k = ?
    `).all(queryBuffer, k * 3) as Array<{ rowid: number; distance: number }>

    if (!knnRows.length) return []

    // Join with selection_cache and filter by pool_items_hash
    const rowids = knnRows.map((r) => r.rowid)
    const distanceMap = new Map(knnRows.map((r) => [r.rowid, r.distance]))

    const placeholders = rowids.map(() => '?').join(',')
    const cacheRows = this.db.prepare(`
      SELECT id, embedding_rowid, selection_json, role_normalized, tech_stack_json
      FROM selection_cache
      WHERE embedding_rowid IN (${placeholders})
        AND pool_items_hash = ?
        AND user_id = ?
    `).all(...rowids, poolItemsHash, userId) as Array<{
      id: number
      embedding_rowid: number
      selection_json: string
      role_normalized: string | null
      tech_stack_json: string | null
    }>

    // Convert L2 distance to cosine similarity: cos θ = 1 - L2²/2
    const results: SelectionSimilarityResult[] = cacheRows
      .map((row) => {
        const distance = distanceMap.get(row.embedding_rowid) ?? Infinity
        return {
          id: row.id,
          selectionJson: row.selection_json,
          roleNormalized: row.role_normalized,
          techStackJson: row.tech_stack_json,
          distance,
          similarity: 1.0 - (distance * distance) / 2.0,
        }
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)

    return results
  }

  /**
   * Record a cache hit (updates hit_count and last_hit_at).
   */
  recordHit(id: number): void {
    this.db.prepare(`
      UPDATE selection_cache
      SET hit_count = hit_count + 1, last_hit_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id)
  }

  /**
   * Store a selection cache entry, replacing any existing entry with the same
   * tech fingerprint (Tier 1 dedup). Entries with the same broad fingerprint
   * but different tech fingerprints are kept as separate rows.
   * Evicts oldest entries if at capacity. Runs in a transaction.
   */
  store(userId: string, params: SelectionCacheStoreParams): void {
    const embeddingBuffer = Buffer.from(new Float32Array(params.embeddingVector).buffer)

    const insertTransaction = this.db.transaction(() => {
      // Remove existing entry for the same tech fingerprint to avoid duplicates
      const existing = this.db.prepare(`
        SELECT id, embedding_rowid FROM selection_cache
        WHERE tech_fingerprint_hash = ? AND pool_items_hash = ? AND user_id = ?
      `).get(
        params.techFingerprintHash, params.poolItemsHash, userId
      ) as { id: number; embedding_rowid: number } | undefined

      if (existing) {
        this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid = ?`).run(existing.embedding_rowid)
        this.db.prepare(`DELETE FROM selection_cache WHERE id = ?`).run(existing.id)
      }

      this.evictIfNeeded()

      // Insert embedding into shared vec0 table
      const embResult = this.db.prepare(`
        INSERT INTO job_cache_embeddings (embedding) VALUES (?)
      `).run(embeddingBuffer)

      const embeddingRowid = embResult.lastInsertRowid

      // Insert selection_cache row
      this.db.prepare(`
        INSERT INTO selection_cache (
          user_id, embedding_rowid, selection_json, tech_fingerprint_hash,
          broad_fingerprint_hash, pool_items_hash,
          role_types_json, tech_stack_json, role_normalized
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        embeddingRowid,
        params.selectionJson,
        params.techFingerprintHash,
        params.broadFingerprintHash,
        params.poolItemsHash,
        params.roleTypesJson,
        params.techStackJson,
        params.roleNormalized
      )
    })

    insertTransaction()
  }

  /**
   * Remove all entries whose pool_items_hash differs from the current hash.
   * Call when pool items change to purge stale selections.
   */
  removeStaleEntries(userId: string, currentPoolHash: string): number {
    const deleteTransaction = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT embedding_rowid FROM selection_cache
        WHERE pool_items_hash != ?
          AND user_id = ?
      `).all(currentPoolHash, userId) as Array<{ embedding_rowid: number }>

      if (!rows.length) return 0

      const rowids = rows.map((r) => r.embedding_rowid)
      const placeholders = rowids.map(() => '?').join(',')
      this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid IN (${placeholders})`).run(...rowids)

      this.db.prepare(`
        DELETE FROM selection_cache WHERE pool_items_hash != ? AND user_id = ?
      `).run(currentPoolHash, userId)

      return rows.length
    })

    const removed = deleteTransaction()
    if (removed > 0) {
      logger.info({ removed }, 'Selection cache: removed stale entries')
    }
    return removed
  }

  /**
   * Evict least-recently-used entries if cache is at capacity.
   */
  private evictIfNeeded(): void {
    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM selection_cache`).get() as { count: number }

    if (countRow.count < MAX_CACHE_ENTRIES) return

    const toEvict = this.db.prepare(`
      SELECT id, embedding_rowid FROM selection_cache
      ORDER BY last_hit_at ASC, hit_count ASC
      LIMIT ?
    `).all(EVICTION_BATCH_SIZE) as Array<{ id: number; embedding_rowid: number }>

    if (!toEvict.length) return

    const embeddingRowids = toEvict.map((r) => r.embedding_rowid)
    const cacheIds = toEvict.map((r) => r.id)
    const embPlaceholders = embeddingRowids.map(() => '?').join(',')
    const cachePlaceholders = cacheIds.map(() => '?').join(',')

    this.db.prepare(`DELETE FROM job_cache_embeddings WHERE rowid IN (${embPlaceholders})`).run(...embeddingRowids)
    this.db.prepare(`DELETE FROM selection_cache WHERE id IN (${cachePlaceholders})`).run(...cacheIds)

    logger.info({ evicted: toEvict.length }, 'Selection cache LRU eviction')
  }
}
