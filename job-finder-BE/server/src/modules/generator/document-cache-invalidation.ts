import type { PersonalInfo } from '@shared/types'
import { logger } from '../../logger'
import { ConfigRepository } from '../config/config.repository'
import { ContentItemRepository } from '../content-items/content-item.repository'
import { PromptsRepository } from '../prompts/prompts.repository'
import { DocumentCacheRepository } from './document-cache.repository'
import { computeContentHash } from './workflow/services/content-hash.util'

/**
 * Fire-and-forget invalidation of stale document cache entries.
 * Computes the current content hash from profile data and removes
 * any cached entries that no longer match.
 *
 * Catches all errors internally — safe to call without awaiting.
 */
export async function invalidateDocumentCacheAsync(): Promise<void> {
  try {
    const configRepo = new ConfigRepository()
    const contentItemRepo = new ContentItemRepository()
    const promptsRepo = new PromptsRepository()
    const cacheRepo = new DocumentCacheRepository()

    const personalInfoEntry = configRepo.get<PersonalInfo>('personal-info')
    if (!personalInfoEntry?.payload) {
      logger.debug('Document cache invalidation: no personal-info configured, skipping')
      return
    }

    let prompts
    try {
      prompts = promptsRepo.getPrompts()
    } catch {
      logger.debug('Document cache invalidation: no prompts configured, skipping')
      return
    }

    const contentItems = contentItemRepo.list()
    const currentHash = computeContentHash(personalInfoEntry.payload, contentItems, prompts)
    const removed = cacheRepo.removeStaleEntries(currentHash)

    if (removed > 0) {
      logger.info({ removed }, 'Document cache invalidation: purged stale entries')
    }
  } catch (err) {
    logger.warn({ err }, 'Document cache invalidation failed (non-fatal)')
  }
}
