import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../app'

/**
 * CORS Configuration Tests
 *
 * These tests ensure that the CORS configuration allows all required headers.
 * The frontend sends these headers on API requests, and if any are missing from
 * the CORS allowedHeaders, the browser will block the request with a preflight error.
 *
 * Common symptom: "Request header field X is not allowed by Access-Control-Allow-Headers"
 */
describe('CORS configuration', () => {
  const app = buildApp()
  const testOrigin = 'http://localhost:5173'

  describe('preflight requests', () => {
    it('allows Content-Type header', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-headers']).toMatch(/content-type/i)
    })

    it('allows Authorization header', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i)
    })

    it('allows Cache-Control header', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Cache-Control')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-headers']).toMatch(/cache-control/i)
    })

    it('allows multiple headers in preflight request', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization, Cache-Control')

      expect(res.status).toBe(204)
      const allowedHeaders = res.headers['access-control-allow-headers']
      expect(allowedHeaders).toMatch(/content-type/i)
      expect(allowedHeaders).toMatch(/authorization/i)
      expect(allowedHeaders).toMatch(/cache-control/i)
    })
  })

  describe('CORS response headers', () => {
    it('includes credentials support', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', testOrigin)

      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('returns correct origin for allowed origins', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', testOrigin)

      expect(res.headers['access-control-allow-origin']).toBe(testOrigin)
    })

    it('allows all required HTTP methods', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'POST')

      const allowedMethods = res.headers['access-control-allow-methods']
      expect(allowedMethods).toMatch(/GET/i)
      expect(allowedMethods).toMatch(/POST/i)
      expect(allowedMethods).toMatch(/PATCH/i)
      expect(allowedMethods).toMatch(/PUT/i)
      expect(allowedMethods).toMatch(/DELETE/i)
      expect(allowedMethods).toMatch(/OPTIONS/i)
    })
  })
})
