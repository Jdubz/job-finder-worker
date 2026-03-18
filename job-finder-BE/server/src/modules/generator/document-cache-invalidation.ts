import type { PersonalInfo } from '@shared/types'
import { logger } from '../../logger'
import { getDb, isVecAvailable } from '../../db/sqlite'
import { UserConfigRepository } from '../user-config/user-config.repository'
import { ContentItemRepository } from '../content-items/content-item.repository'
import { PromptsRepository } from '../prompts/prompts.repository'
import { DocumentCacheRepository } from './document-cache.repository'
import { computeContentHash } from './workflow/services/content-hash.util'

/**
 * Invalidate stale document cache entries for a single user.
 */
async function invalidateForUser(userId: string): Promise<void> {
  const userConfigRepo = new UserConfigRepository()
  const contentItemRepo = new ContentItemRepository()
  const promptsRepo = new PromptsRepository()
  const cacheRepo = new DocumentCacheRepository()

  const personalInfoEntry = userConfigRepo.get<PersonalInfo>(userId, 'personal-info')
  if (!personalInfoEntry?.payload) {
    logger.debug({ userId }, 'Document cache invalidation: no personal-info configured, skipping')
    return
  }

  let prompts
  try {
    prompts = promptsRepo.getPrompts()
  } catch {
    logger.debug('Document cache invalidation: no prompts configured, skipping')
    return
  }

  const contentItems = contentItemRepo.list(userId)
  const currentHash = computeContentHash(personalInfoEntry.payload, contentItems, prompts)
  const removed = cacheRepo.removeStaleEntries(userId, currentHash)

  if (removed > 0) {
    logger.info({ removed, userId }, 'Document cache invalidation: purged stale entries')
  }
}

/**
 * Fire-and-forget invalidation of stale document cache entries.
 * Computes the current content hash from profile data and removes
 * any cached entries that no longer match.
 *
 * When userId is provided, invalidates only that user's cache.
 * When omitted, invalidates cache for ALL users (e.g. after prompt changes).
 *
 * Catches all errors internally — safe to call without awaiting.
 */
export async function invalidateDocumentCacheAsync(userId?: string): Promise<void> {
  if (!isVecAvailable()) return

  try {
    if (userId) {
      await invalidateForUser(userId)
    } else {
      // Invalidate for all users who have cached entries
      const db = getDb()
      const rows = db
        .prepare('SELECT DISTINCT user_id FROM document_cache')
        .all() as Array<{ user_id: string }>

      for (const row of rows) {
        try {
          await invalidateForUser(row.user_id)
        } catch (err) {
          logger.warn({ err, userId: row.user_id }, 'Document cache invalidation failed for user (non-fatal)')
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Document cache invalidation failed (non-fatal)')
  }
}
