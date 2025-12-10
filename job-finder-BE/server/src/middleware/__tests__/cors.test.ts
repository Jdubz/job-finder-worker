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
  const productionOrigin = 'https://job-finder.joshwentworth.com'

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

    it('allows Pragma header', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Pragma')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-headers']).toMatch(/pragma/i)
    })

    it('allows multiple headers in preflight request', async () => {
      const res = await request(app)
        .options('/api/healthz')
        .set('Origin', testOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization, Cache-Control, Pragma')

      expect(res.status).toBe(204)
      const allowedHeaders = res.headers['access-control-allow-headers']
      expect(allowedHeaders).toMatch(/content-type/i)
      expect(allowedHeaders).toMatch(/authorization/i)
      expect(allowedHeaders).toMatch(/cache-control/i)
      expect(allowedHeaders).toMatch(/pragma/i)
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

  describe('production origins', () => {
    it('allows preflight from production frontend origin', async () => {
      const res = await request(app)
        .options('/api/queue')
        .set('Origin', productionOrigin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe(productionOrigin)
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('returns correct origin header for production requests', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', productionOrigin)

      expect(res.headers['access-control-allow-origin']).toBe(productionOrigin)
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it.each([
      '/api/queue',
      '/healthz',
      '/api/job-listings',
    ])('allows preflight for production endpoint %s', async (endpoint) => {
      const res = await request(app)
        .options(endpoint)
        .set('Origin', productionOrigin)
        .set('Access-Control-Request-Method', 'GET')

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe(productionOrigin)
    })
  })

  describe('origin rejection', () => {
    const maliciousOrigin = 'https://evil-site.com'

    it('rejects requests from non-allowed origins', async () => {
      const res = await request(app)
        .get('/healthz')
        .set('Origin', maliciousOrigin)

      // CORS middleware returns no Access-Control-Allow-Origin for rejected origins
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('rejects preflight from non-allowed origins', async () => {
      const res = await request(app)
        .options('/api/queue')
        .set('Origin', maliciousOrigin)
        .set('Access-Control-Request-Method', 'GET')

      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('CORS on error responses', () => {
    it('includes CORS headers on 404 errors', async () => {
      // Use a non-API route to avoid auth middleware
      const res = await request(app)
        .get('/nonexistent-endpoint')
        .set('Origin', productionOrigin)

      expect(res.status).toBe(404)
      expect(res.headers['access-control-allow-origin']).toBe(productionOrigin)
    })

    it('includes CORS headers on error responses', async () => {
      // Note: We test with a non-existent resource to get a 404 on an authenticated route.
      // Localhost requests bypass auth, so we can test that CORS is included on errors.
      const res = await request(app)
        .get('/api/job-matches/non-existent-id-12345')
        .set('Origin', productionOrigin)

      // Expect a 4xx error (404 for not found)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      expect(res.headers['access-control-allow-origin']).toBe(productionOrigin)
    })

    it('includes CORS headers on preflight for non-existent routes', async () => {
      const res = await request(app)
        .options('/api/nonexistent-endpoint')
        .set('Origin', productionOrigin)
        .set('Access-Control-Request-Method', 'GET')

      // Preflight should succeed even for non-existent routes
      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-origin']).toBe(productionOrigin)
    })
  })
})
