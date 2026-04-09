import express from 'express'
import request from 'supertest'
import { describe, expect, it, beforeEach } from 'vitest'
import { verifySession, type AuthenticatedRequest } from '../session-auth'
import { apiErrorHandler } from '../api-error'
import { ApiErrorCode } from '@shared/types'
import { UserRepository } from '../../modules/users/user.repository'
import { getDb } from '../../db/sqlite'
import { serialize as serializeCookie } from 'cookie'

const userRepo = new UserRepository()

/** Create a test Express app with verifySession on a protected route. */
function buildTestApp() {
  const app = express()
  app.use(express.json())

  app.get('/protected', verifySession, (req, res) => {
    const user = (req as AuthenticatedRequest).user
    res.json({ email: user?.email, roles: user?.roles })
  })

  app.use(apiErrorHandler)
  return app
}

/** Create a user and session, return the raw session token (for the cookie). */
function seedSession(email: string, opts?: { expiredMs?: number }) {
  const user = userRepo.upsertUser(email, 'Test User', null, ['admin', 'viewer'])
  const token = crypto.randomUUID()
  const expiresAtMs = opts?.expiredMs ?? Date.now() + 86_400_000 // 1 day from now
  userRepo.createSession(user.id, token, expiresAtMs)
  return { user, token }
}

describe('verifySession middleware', () => {
  const app = buildTestApp()

  beforeEach(() => {
    // Clean up sessions between tests so they don't interfere
    getDb().prepare('DELETE FROM user_sessions').run()
  })

  it('rejects with 401 when no Cookie header is present', async () => {
    const res = await request(app).get('/protected')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED)
    expect(res.body.error.message).toBe('Authentication required')
  })

  it('rejects with 401 when Cookie header exists but jf_session is missing', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Cookie', 'other_cookie=abc123')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED)
    expect(res.body.error.message).toBe('Authentication required')
  })

  it('rejects with 401 when session token is not found in DB', async () => {
    const cookie = serializeCookie('jf_session', 'nonexistent-token')
    const res = await request(app)
      .get('/protected')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED)
    expect(res.body.error.message).toBe('Invalid or expired session')
  })

  it('rejects with 401 when session is expired', async () => {
    const { token } = seedSession('expired@test.dev', { expiredMs: Date.now() - 1000 })
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/protected')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED)
    expect(res.body.error.message).toBe('Invalid or expired session')
  })

  it('authenticates successfully with a valid session cookie', async () => {
    const { token } = seedSession('valid@test.dev')
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/protected')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('valid@test.dev')
    expect(res.body.roles).toContain('admin')
  })

  it('populates req.user with correct fields on success', async () => {
    const { token } = seedSession('fields@test.dev')
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/protected')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      email: 'fields@test.dev',
      roles: ['admin', 'viewer'],
    })
  })

  it('works with session cookie among multiple cookies', async () => {
    const { token } = seedSession('multi@test.dev')
    const cookies = [
      serializeCookie('theme', 'dark'),
      serializeCookie('jf_session', token),
      serializeCookie('lang', 'en'),
    ].join('; ')

    const res = await request(app)
      .get('/protected')
      .set('Cookie', cookies)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('multi@test.dev')
  })
})
