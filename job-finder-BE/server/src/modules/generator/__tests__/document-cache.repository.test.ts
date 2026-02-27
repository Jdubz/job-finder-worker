import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '../../../db/sqlite'
import { DocumentCacheRepository, type CacheStoreParams } from '../document-cache.repository'

const repo = new DocumentCacheRepository()
const DIMS = 768

function makeEmbedding(seed: number): number[] {
  // Deterministic embedding: all zeros except index `seed % DIMS`
  const vec = new Array(DIMS).fill(0)
  vec[seed % DIMS] = 1.0
  return vec
}

function makeStoreParams(overrides: Partial<CacheStoreParams> = {}): CacheStoreParams {
  return {
    embeddingVector: makeEmbedding(0),
    documentType: 'resume',
    jobFingerprintHash: 'fp-hash-1',
    contentItemsHash: 'content-hash-1',
    roleNormalized: 'frontend engineer',
    techStackJson: JSON.stringify(['react', 'typescript']),
    documentContentJson: JSON.stringify({ summary: 'Test resume content' }),
    jobDescriptionText: 'Build UIs with React',
    companyName: 'Acme Corp',
    modelVersion: 'claude-3',
    ...overrides,
  }
}

beforeEach(() => {
  const db = getDb()
  // Clear both tables before each test
  db.prepare('DELETE FROM document_cache').run()
  // vec0 tables need row-by-row deletion; clear by deleting all known rowids
  const rows = db.prepare('SELECT rowid FROM job_cache_embeddings').all() as Array<{ rowid: number }>
  for (const row of rows) {
    db.prepare('DELETE FROM job_cache_embeddings WHERE rowid = ?').run(row.rowid)
  }
})

describe('DocumentCacheRepository', () => {
  // ── store + findExact round-trip ────────────────────────────────────────

  it('stores and retrieves via exact match', () => {
    const params = makeStoreParams()
    repo.store(params)

    const result = repo.findExact('fp-hash-1', 'content-hash-1', 'resume')
    expect(result).not.toBeNull()
    expect(JSON.parse(result!.documentContentJson)).toEqual({ summary: 'Test resume content' })
    expect(result!.roleNormalized).toBe('frontend engineer')
  })

  it('findExact returns null on miss', () => {
    repo.store(makeStoreParams())

    // Wrong fingerprint hash
    expect(repo.findExact('wrong-hash', 'content-hash-1', 'resume')).toBeNull()
    // Wrong content hash
    expect(repo.findExact('fp-hash-1', 'wrong-hash', 'resume')).toBeNull()
    // Wrong document type
    expect(repo.findExact('fp-hash-1', 'content-hash-1', 'cover_letter')).toBeNull()
  })

  // ── findSimilar ────────────────────────────────────────────────────────

  it('findSimilar returns results for matching embedding', () => {
    const embedding = makeEmbedding(1)
    repo.store(makeStoreParams({ embeddingVector: embedding }))

    // Query with the same embedding — should get perfect match
    const results = repo.findSimilar(embedding, 'content-hash-1', 'resume', 5)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].similarity).toBeCloseTo(1.0, 1)
    expect(results[0].roleNormalized).toBe('frontend engineer')
  })

  it('findSimilar filters by content_items_hash', () => {
    const embedding = makeEmbedding(2)
    repo.store(makeStoreParams({ embeddingVector: embedding, contentItemsHash: 'hash-a' }))

    const results = repo.findSimilar(embedding, 'hash-b', 'resume', 5)
    expect(results).toHaveLength(0)
  })

  it('findSimilar filters by document_type', () => {
    const embedding = makeEmbedding(3)
    repo.store(makeStoreParams({ embeddingVector: embedding, documentType: 'resume' }))

    const results = repo.findSimilar(embedding, 'content-hash-1', 'cover_letter', 5)
    expect(results).toHaveLength(0)
  })

  it('findSimilar returns results sorted by similarity descending', () => {
    // Store two entries with different embeddings
    const emb1 = makeEmbedding(10)
    const emb2 = makeEmbedding(11)
    repo.store(makeStoreParams({
      embeddingVector: emb1,
      jobFingerprintHash: 'fp-a',
      documentContentJson: JSON.stringify({ id: 'a' }),
    }))
    repo.store(makeStoreParams({
      embeddingVector: emb2,
      jobFingerprintHash: 'fp-b',
      documentContentJson: JSON.stringify({ id: 'b' }),
    }))

    // Query with emb1 — first result should be the closer match
    const results = repo.findSimilar(emb1, 'content-hash-1', 'resume', 5)
    expect(results.length).toBeGreaterThanOrEqual(1)
    // Results are sorted descending by similarity
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity)
    }
  })

  // ── invalidateByContentHash ───────────────────────────────────────────

  it('invalidateByContentHash removes matching entries', () => {
    repo.store(makeStoreParams({ contentItemsHash: 'hash-to-remove', documentType: 'resume' }))
    repo.store(makeStoreParams({
      contentItemsHash: 'hash-to-remove',
      documentType: 'cover_letter',
      jobFingerprintHash: 'fp-cl',
      embeddingVector: makeEmbedding(20),
    }))
    repo.store(makeStoreParams({
      contentItemsHash: 'hash-to-keep',
      jobFingerprintHash: 'fp-keep',
      embeddingVector: makeEmbedding(21),
    }))

    repo.invalidateByContentHash('hash-to-remove', 'resume')

    // Only the resume with hash-to-remove should be gone
    expect(repo.findExact('fp-hash-1', 'hash-to-remove', 'resume')).toBeNull()
    // Cover letter with same hash should still exist (different doc type)
    expect(repo.findExact('fp-cl', 'hash-to-remove', 'cover_letter')).not.toBeNull()
    // Different hash entry should still exist
    expect(repo.findExact('fp-keep', 'hash-to-keep', 'resume')).not.toBeNull()
  })

  // ── removeStaleEntries ────────────────────────────────────────────────

  it('removeStaleEntries removes entries with non-matching hash', () => {
    repo.store(makeStoreParams({ contentItemsHash: 'old-hash', jobFingerprintHash: 'fp-old', embeddingVector: makeEmbedding(30) }))
    repo.store(makeStoreParams({ contentItemsHash: 'current-hash', jobFingerprintHash: 'fp-current', embeddingVector: makeEmbedding(31) }))

    const removed = repo.removeStaleEntries('current-hash')

    expect(removed).toBe(1)
    expect(repo.findExact('fp-old', 'old-hash', 'resume')).toBeNull()
    expect(repo.findExact('fp-current', 'current-hash', 'resume')).not.toBeNull()
  })

  it('removeStaleEntries returns 0 when nothing is stale', () => {
    repo.store(makeStoreParams({ contentItemsHash: 'current-hash' }))

    const removed = repo.removeStaleEntries('current-hash')
    expect(removed).toBe(0)
  })

  // ── pruneOlderThan ────────────────────────────────────────────────────

  it('pruneOlderThan removes old entries', () => {
    repo.store(makeStoreParams({ jobFingerprintHash: 'fp-old', embeddingVector: makeEmbedding(40) }))

    // Backdate the entry by updating created_at directly
    const db = getDb()
    db.prepare(`
      UPDATE document_cache SET created_at = datetime('now', '-60 days')
      WHERE job_fingerprint_hash = 'fp-old'
    `).run()

    // Store a fresh entry
    repo.store(makeStoreParams({ jobFingerprintHash: 'fp-new', embeddingVector: makeEmbedding(41) }))

    const pruned = repo.pruneOlderThan(30)

    expect(pruned).toBe(1)
    expect(repo.findExact('fp-old', 'content-hash-1', 'resume')).toBeNull()
    expect(repo.findExact('fp-new', 'content-hash-1', 'resume')).not.toBeNull()
  })

  it('pruneOlderThan returns 0 when nothing is old', () => {
    repo.store(makeStoreParams())
    const pruned = repo.pruneOlderThan(30)
    expect(pruned).toBe(0)
  })

  // ── store deduplication ──────────────────────────────────────────────

  it('store replaces existing entry with same fingerprint instead of duplicating', () => {
    repo.store(makeStoreParams({ documentContentJson: JSON.stringify({ v: 1 }) }))
    repo.store(makeStoreParams({ documentContentJson: JSON.stringify({ v: 2 }) }))

    const db = getDb()
    const count = (db.prepare(
      `SELECT COUNT(*) as count FROM document_cache
       WHERE job_fingerprint_hash = 'fp-hash-1' AND content_items_hash = 'content-hash-1' AND document_type = 'resume'`
    ).get() as { count: number }).count
    expect(count).toBe(1)

    const result = repo.findExact('fp-hash-1', 'content-hash-1', 'resume')
    expect(JSON.parse(result!.documentContentJson)).toEqual({ v: 2 })
  })

  // ── recordHit ──────────────────────────────────────────────────────────

  it('findExact does not update hit metadata (non-mutating)', () => {
    repo.store(makeStoreParams())
    repo.findExact('fp-hash-1', 'content-hash-1', 'resume')
    repo.findExact('fp-hash-1', 'content-hash-1', 'resume')

    const db = getDb()
    const row = db.prepare(
      `SELECT hit_count FROM document_cache WHERE job_fingerprint_hash = 'fp-hash-1'`
    ).get() as { hit_count: number }
    expect(row.hit_count).toBe(0)
  })

  it('recordHit increments hit count', () => {
    repo.store(makeStoreParams())
    const hit = repo.findExact('fp-hash-1', 'content-hash-1', 'resume')
    repo.recordHit(hit!.id)

    const db = getDb()
    const row = db.prepare(
      `SELECT hit_count FROM document_cache WHERE job_fingerprint_hash = 'fp-hash-1'`
    ).get() as { hit_count: number }
    expect(row.hit_count).toBe(1)
  })

  // ── LRU eviction ──────────────────────────────────────────────────────

  it('evicts LRU entries when cache reaches capacity', () => {
    // Store 500 entries to fill the cache (MAX_CACHE_ENTRIES = 500)
    for (let i = 0; i < 500; i++) {
      repo.store(makeStoreParams({
        embeddingVector: makeEmbedding(i),
        jobFingerprintHash: `fp-${i}`,
        documentContentJson: JSON.stringify({ idx: i }),
      }))
    }

    const db = getDb()
    const countBefore = (db.prepare('SELECT COUNT(*) as count FROM document_cache').get() as { count: number }).count
    expect(countBefore).toBe(500)

    // Store one more — should trigger eviction of EVICTION_BATCH_SIZE (10)
    repo.store(makeStoreParams({
      embeddingVector: makeEmbedding(500),
      jobFingerprintHash: 'fp-500',
      documentContentJson: JSON.stringify({ idx: 500 }),
    }))

    const countAfter = (db.prepare('SELECT COUNT(*) as count FROM document_cache').get() as { count: number }).count
    // 500 - 10 evicted + 1 new = 491
    expect(countAfter).toBe(491)
  })
})
