import express from 'express'
import request from 'supertest'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildAuthRouter } from '../auth.routes'
import { apiErrorHandler } from '../../middleware/api-error'
import { ApiErrorCode } from '@shared/types'
import { UserRepository } from '../../modules/users/user.repository'
import { getDb } from '../../db/sqlite'
import { serialize as serializeCookie } from 'cookie'

// Mock Google OAuth verification — real Google APIs aren't available in tests
vi.mock('../../config/google-oauth', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    verifyGoogleIdToken: vi.fn().mockResolvedValue(null),
    verifyGoogleAccessToken: vi.fn().mockResolvedValue(null),
  }
})

import { verifyGoogleIdToken, verifyGoogleAccessToken } from '../../config/google-oauth'

const mockedVerifyIdToken = vi.mocked(verifyGoogleIdToken)
const mockedVerifyAccessToken = vi.mocked(verifyGoogleAccessToken)

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
    getDb().prepare('DELETE FROM user_sessions').run()
  })

  // ── No cookie: "never logged in" is a valid state, not an error ──

  it('returns 200 with user: null when no cookie is present', async () => {
    const res = await request(app).get('/auth/session')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).toBeNull()
  })

  it('returns 200 with user: null when cookie header exists but jf_session is missing', async () => {
    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', 'other_cookie=abc123')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user).toBeNull()
  })

  // ── Invalid/expired token: client sent a stale credential → 401 ──

  it('returns 401 when session token is not found in DB', async () => {
    const cookie = serializeCookie('jf_session', 'bogus-token')
    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED)
  })

  it('returns 401 when session is expired', async () => {
    const { token } = seedSession('expired@test.dev', { expiredMs: Date.now() - 1000 })
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED)
  })

  // ── Valid session ──

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

  it('includes uid and name in the user response', async () => {
    const { token } = seedSession('fields@test.dev')
    const cookie = serializeCookie('jf_session', token)

    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    const user = res.body.data.user
    expect(user.uid).toBeDefined()
    expect(user.name).toBe('Test User')
    expect(user.email).toBe('fields@test.dev')
  })

  it('clears the session cookie when returning 401 for invalid token', async () => {
    const cookie = serializeCookie('jf_session', 'stale-token')
    const res = await request(app)
      .get('/auth/session')
      .set('Cookie', cookie)

    expect(res.status).toBe(401)
    // Server should send Set-Cookie to expire the stale cookie
    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    expect(setCookie.toString()).toMatch(/jf_session=;/)
  })
})

describe('POST /auth/login', () => {
  const app = buildTestApp()

  beforeEach(() => {
    vi.clearAllMocks()
    getDb().prepare('DELETE FROM user_sessions').run()
  })

  it('routes JWT credentials (3 dot-separated segments) to ID token verification', async () => {
    const fakeJwt = 'header.payload.signature'
    mockedVerifyIdToken.mockResolvedValueOnce({
      uid: 'google-123',
      email: 'jwt@test.dev',
      name: 'JWT User',
      picture: 'https://photo.test/jwt.jpg',
    })

    const res = await request(app)
      .post('/auth/login')
      .send({ credential: fakeJwt })

    expect(mockedVerifyIdToken).toHaveBeenCalledWith(fakeJwt)
    expect(mockedVerifyAccessToken).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe('jwt@test.dev')
  })

  it('routes opaque credentials (no dots) to access token verification', async () => {
    const accessToken = 'ya29_opaque_access_token_no_dots'
    mockedVerifyAccessToken.mockResolvedValueOnce({
      uid: 'google-456',
      email: 'access@test.dev',
      name: 'Access User',
      picture: 'https://photo.test/access.jpg',
    })

    const res = await request(app)
      .post('/auth/login')
      .send({ credential: accessToken })

    expect(mockedVerifyAccessToken).toHaveBeenCalledWith(accessToken)
    expect(mockedVerifyIdToken).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe('access@test.dev')
  })

  it('returns 401 when access token verification fails', async () => {
    mockedVerifyAccessToken.mockResolvedValueOnce(null)

    const res = await request(app)
      .post('/auth/login')
      .send({ credential: 'invalid_access_token' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ApiErrorCode.INVALID_TOKEN)
  })

  it('sets session cookie on successful login', async () => {
    mockedVerifyAccessToken.mockResolvedValueOnce({
      uid: 'google-789',
      email: 'cookie@test.dev',
      name: 'Cookie User',
    })

    const res = await request(app)
      .post('/auth/login')
      .send({ credential: 'valid_access_token' })

    expect(res.status).toBe(200)
    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    expect(setCookie.toString()).toMatch(/jf_session=/)
  })
})
