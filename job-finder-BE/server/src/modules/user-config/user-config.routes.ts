import { Router, type Request } from 'express'
import { z } from 'zod'
import { ApiErrorCode, USER_CONFIG_KEYS } from '@shared/types'
import { UserConfigRepository } from './user-config.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiHttpError } from '../../middleware/api-error'
import type { AuthenticatedRequest, AuthenticatedUser } from '../../middleware/auth'

const validKeys = new Set<string>(USER_CONFIG_KEYS)

function getUser(req: Request): AuthenticatedUser & { email: string } {
  const user = (req as AuthenticatedRequest).user
  if (!user || !user.email) throw new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Authentication required', { status: 401 })
  return user as AuthenticatedUser & { email: string }
}

export function buildUserConfigRouter() {
  const router = Router()
  const repo = new UserConfigRepository()

  // GET / — list user's configs
  router.get(
    '/',
    asyncHandler((req, res) => {
      const user = getUser(req)
      const configs = repo.list(user.uid)
      res.json(success(configs))
    })
  )

  // GET /:key — get specific config
  router.get(
    '/:key',
    asyncHandler((req, res) => {
      const user = getUser(req)
      const key = req.params.key
      if (!validKeys.has(key)) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, `Invalid config key: ${key}. Valid keys: ${USER_CONFIG_KEYS.join(', ')}`))
        return
      }
      const config = repo.get(user.uid, key)
      if (!config) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Config "${key}" not found`))
        return
      }
      res.json(success(config))
    })
  )

  // PUT /:key — upsert config
  router.put(
    '/:key',
    asyncHandler((req, res) => {
      const user = getUser(req)
      const key = req.params.key
      if (!validKeys.has(key)) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, `Invalid config key: ${key}. Valid keys: ${USER_CONFIG_KEYS.join(', ')}`))
        return
      }
      const { payload } = z.object({ payload: z.unknown() }).parse(req.body)
      const config = repo.upsert(user.uid, key, payload, { updatedBy: user.email })
      res.json(success(config))
    })
  )

  return router
}
