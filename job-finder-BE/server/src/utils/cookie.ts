import type { Response } from 'express'
import { env } from '../config/env'

const SESSION_COOKIE = 'jf_session'
const IS_DEV_OR_TEST = env.NODE_ENV === 'development' || env.NODE_ENV === 'test'

export function getCookieDomain(): string | undefined {
  if (IS_DEV_OR_TEST) return undefined
  return env.COOKIE_DOMAIN || '.joshwentworth.com'
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: !IS_DEV_OR_TEST,
    sameSite: IS_DEV_OR_TEST ? 'lax' : 'none',
    domain: getCookieDomain(),
    path: '/',
  })
}
