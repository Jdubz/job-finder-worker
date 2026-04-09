import express from 'express'
import request from 'supertest'
import { describe, expect, it, beforeEach } from 'vitest'
import { buildAuthRouter } from '../auth.routes'
import { apiErrorHandler } from '../../middleware/api-error'
import { UserRepository } from '../../modules/users/user.repository'
import { serialize as serializeCookie } from 'cookie'

const userRepo = new UserRepository()

function buildTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', buildAuthRouter())
  app.use(apiErrorHandler)
  return app
}

/** Create a user and session, return the raw session token. */
function seedSession(email: string, opts?: { expiredMs?: number }) {
  const user = userRepo.upsertUser(email, 'Test User', null, ['admin', 'viewer'])
  const token = crypto.randomUUID()
  const expiresAtMs = opts?.expiredMs ?? Date.now() + 86_400_000
  userRepo.createSession(user.id, token, expiresAtMs)
  return { user, token }
}

describe('GET /auth/session', () => {
  const app = buildTestApp()

  beforeEach(() => {
    const db = userRepo['db']
    db.prepare('DELETE FROM user_sessions').run()
  })

  it('returns 200 with user: null when no cookie is present', async () => {
    const res = await request(app).get('/auth/session')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).toBeNull()
  })

  it('returns 200 with user: null when session token is invalid', async () => {
    const cookie = serializeCookie('jf_session', 'bogus-token')
    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).toBeNull()
  })

  it('returns 200 with user: null when session is expired', async () => {
    const { token } = seedSession('expired@test.dev', { expiredMs: Date.now() - 1000 })
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).toBeNull()
  })

  it('returns 200 with user data when session is valid', async () => {
    const { token } = seedSession('valid@test.dev')
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).toEqual(
      expect.objectContaining({
        email: 'valid@test.dev',
        name: 'Test User',
        roles: ['admin', 'viewer'],
      })
    )
  })

  it('never returns 401 — "not logged in" is a valid state', async () => {
    // No cookie
    const res1 = await request(app).get('/auth/session')
    expect(res1.status).not.toBe(401)

    // Invalid cookie
    const res2 = await request(app)
      .get('/auth/session')
      .set('Cookie', serializeCookie('jf_session', 'bad'))
    expect(res2.status).not.toBe(401)

    // Expired session
    const { token } = seedSession('expired2@test.dev', { expiredMs: Date.now() - 1000 })
    const res3 = await request(app)
      .get('/auth/session')
      .set('Cookie', serializeCookie('jf_session', token))
    expect(res3.status).not.toBe(401)
  })
})
