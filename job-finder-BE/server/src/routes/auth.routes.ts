import { Router } from 'express'
import { ApiErrorCode } from '@shared/types'
import { verifyFirebaseAuth, type AuthenticatedRequest, SESSION_COOKIE } from '../middleware/firebase-auth'
import { success, failure } from '../utils/api-response'
import { env } from '../config/env'
import { UserRepository } from '../modules/users/user.repository'

const IS_DEVELOPMENT = env.NODE_ENV === 'development'
const userRepository = new UserRepository()

export function buildAuthRouter() {
  const router = Router()

  router.get('/session', verifyFirebaseAuth, (req, res) => {
    const user = (req as AuthenticatedRequest).user
    if (!user) {
      return res.status(401).json(failure(ApiErrorCode.UNAUTHORIZED, 'Not authenticated'))
    }

    return res.json(
      success({
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          picture: user.picture,
          roles: user.roles,
        },
      })
    )
  })

  router.post('/logout', verifyFirebaseAuth, (req, res) => {
    const user = (req as AuthenticatedRequest).user
    if (user?.uid) {
      userRepository.clearSession(user.uid)
    }

    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: IS_DEVELOPMENT ? 'lax' : 'none',
      secure: !IS_DEVELOPMENT,
    })

    return res.json(success({ loggedOut: true }))
  })

  return router
}
