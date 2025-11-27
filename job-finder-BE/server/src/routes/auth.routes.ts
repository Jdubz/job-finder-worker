import { Router } from 'express'
import { parse as parseCookie } from 'cookie'
import { verifyFirebaseAuth, type AuthenticatedRequest, SESSION_COOKIE } from '../middleware/firebase-auth'
import { success } from '../utils/api-response'
import { env } from '../config/env'
import { UserRepository } from '../modules/users/user.repository'

const IS_DEVELOPMENT = env.NODE_ENV === 'development'
const userRepository = new UserRepository()

export function buildAuthRouter() {
  const router = Router()

  router.get('/session', verifyFirebaseAuth, (req, res) => {
    const user = (req as AuthenticatedRequest).user

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

  router.post('/logout', (req, res) => {
    const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {}
    const sessionToken = cookies[SESSION_COOKIE]

    if (sessionToken) {
      const user = userRepository.findBySessionToken(sessionToken)
      if (user) {
        userRepository.clearSession(user.id)
      }
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
