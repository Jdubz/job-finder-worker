/**
 * Generator Artifacts Routes Tests
 *
 * Tests for the artifact serving route including:
 * - Path structure validation (storage service -> route handler integration)
 * - Date and filename validation
 * - Security: path traversal prevention
 * - File serving behavior
 *
 * CRITICAL: The storage service creates paths with 3 segments: {date}/{run}/{filename}
 * The route handler MUST match this structure. This test prevents regressions
 * when storage and routing disagree on the segment count.
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import request from 'supertest'
import type { Express } from 'express'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { LocalStorageService, type ArtifactMetadata } from '../workflow/services/storage.service'

// Use default relative base path for test assertions
const TEST_PUBLIC_BASE = '/api/generator/artifacts'

describe('Generator artifacts routes', () => {
  const artifactsDir = process.env.GENERATOR_ARTIFACTS_DIR ?? path.resolve(__dirname, '../../../../.artifacts-test')
  let storageService: LocalStorageService
  let app: Express

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    await fs.rm(artifactsDir, { recursive: true, force: true })
    await fs.mkdir(artifactsDir, { recursive: true })
    storageService = new LocalStorageService(artifactsDir, TEST_PUBLIC_BASE)
    const { buildApp } = await import('../../../app')
    app = buildApp()
  })

  afterAll(async () => {
    await fs.rm(artifactsDir, { recursive: true, force: true })
  })

  describe('Path structure integration', () => {
    /**
     * CRITICAL TEST: Storage service path format must match route handler
     *
     * This test caught the bug where:
     * - Storage created: /2025-12-04/run-abc/filename.pdf (3 segments)
     * - Route expected: /:date/:run/:filename
     *
     * The route MUST accept the exact path format that storage produces.
     */
    it('should serve artifacts using the path format created by storage service', async () => {

      // Create a test PDF artifact using the storage service
      const testContent = Buffer.from('%PDF-1.4 test content')
      const metadata: ArtifactMetadata = {
        name: 'Joshua Wentworth',
        company: 'Acme Corp',
        role: 'Senior Engineer',
        type: 'resume'
      }

      const saved = await storageService.saveArtifactWithMetadata(testContent, metadata)

      // Verify storage path has exactly 3 segments: date/run/filename
      const pathSegments = saved.storagePath.split('/')
      expect(pathSegments).toHaveLength(3)
      expect(pathSegments[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/) // YYYY-MM-DD
      expect(pathSegments[1]).toMatch(/^run-[a-f0-9]{12}$/) // run folder
      expect(pathSegments[2]).toMatch(/\.pdf$/) // ends with .pdf

      // Create the public URL and verify it can be served
      const publicUrl = storageService.createPublicUrl(saved.storagePath)
      expect(publicUrl).toMatch(/^\/api\/generator\/artifacts\/\d{4}-\d{2}-\d{2}\//)

      // The route handler MUST accept this URL format
      const response = await request(app)
        .get(publicUrl)
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toMatch(/application\/pdf/)
      expect(response.body.toString()).toContain('%PDF-1.4')
    })

    it('should handle real-world filenames with special characters sanitized', async () => {
      const testContent = Buffer.from('%PDF-1.4 test')
      const metadata: ArtifactMetadata = {
        name: 'José García-López',
        company: "O'Reilly & Associates",
        role: 'Full-Stack Developer (Senior)',
        type: 'cover-letter'
      }

      const saved = await storageService.saveArtifactWithMetadata(testContent, metadata)
      const publicUrl = storageService.createPublicUrl(saved.storagePath)

      const response = await request(app)
        .get(publicUrl)
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
    })
  })

  describe('Route parameter validation', () => {
    beforeEach(async () => {
      // Create a known test file for validation tests
      const testDir = path.join(artifactsDir, '2024-01-15', 'testrun')
      await fs.mkdir(testDir, { recursive: true })
      await fs.writeFile(
        path.join(testDir, 'test_acme_engineer_resume_abc123def456.pdf'),
        Buffer.from('%PDF-1.4 test')
      )
    })

    it('should reject invalid date formats (not YYYY-MM-DD)', async () => {
      const invalidDates = [
        '2024-1-15',      // single digit month
        '2024-01-5',      // single digit day
        '24-01-15',       // 2-digit year
        '2024/01/15',     // wrong separator
        '01-15-2024',     // wrong order
        'invalid-date',   // not a date at all
      ]

      for (const date of invalidDates) {
        const response = await request(app)
          .get(`/api/generator/artifacts/${date}/testrun/test.pdf`)
          .set('Authorization', 'Bearer bypass-token')

        // Should not return 200 for invalid date formats
        expect(response.status).not.toBe(200)
      }
    })

    it('should reject invalid calendar dates', async () => {
      const invalidCalendarDates = [
        '2024-02-30',     // February 30th doesn't exist
        '2024-13-01',     // Month 13 doesn't exist
        '2024-00-15',     // Month 0 doesn't exist
        '2024-01-32',     // Day 32 doesn't exist
      ]

      for (const date of invalidCalendarDates) {
        const response = await request(app)
          .get(`/api/generator/artifacts/${date}/testrun/test.pdf`)
          .set('Authorization', 'Bearer bypass-token')

        // Should not return 200 for invalid calendar dates
        expect(response.status).not.toBe(200)
      }
    })

    it('should return 404 for non-existent files', async () => {
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-15/testrun/nonexistent.pdf')
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(404)
      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should successfully serve existing files', async () => {
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-15/testrun/test_acme_engineer_resume_abc123def456.pdf')
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toMatch(/application\/pdf/)
    })
  })

  describe('Security: path traversal prevention', () => {
    it('should sanitize path segments to prevent directory traversal', async () => {
      const maliciousPaths = [
        '/api/generator/artifacts/2024-01-15/testrun/../../../etc/passwd',
        '/api/generator/artifacts/2024-01-15/testrun/..%2F..%2Fetc/passwd',
        '/api/generator/artifacts/2024-01-15/testrun/test/../../secret.pdf',
      ]

      for (const maliciousPath of maliciousPaths) {
        const response = await request(app)
          .get(maliciousPath)
          .set('Authorization', 'Bearer bypass-token')

        // Should not return 200 for path traversal attempts
        expect(response.status).not.toBe(200)
      }
    })

    it('should strip special characters from filename', async () => {
      // These should be sanitized and result in 404 (file not found after sanitization)
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-15/testrun/test<script>alert(1)</script>.pdf')
        .set('Authorization', 'Bearer bypass-token')

      // Should be 404 because sanitization removes the special chars
      expect(response.status).toBe(404)
    })
  })

  describe('Response headers', () => {
    beforeEach(async () => {
      const testDir = path.join(artifactsDir, '2024-01-20', 'testrun')
      await fs.mkdir(testDir, { recursive: true })
      await fs.writeFile(
        path.join(testDir, 'headers_test_resume_abc123.pdf'),
        Buffer.from('%PDF-1.4 test content for headers')
      )
    })

    it('should set correct content-type for PDF files', async () => {
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-20/testrun/headers_test_resume_abc123.pdf')
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toMatch(/application\/pdf/)
    })

    it('should set content-length header', async () => {
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-20/testrun/headers_test_resume_abc123.pdf')
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
      expect(response.headers['content-length']).toBeDefined()
      expect(parseInt(response.headers['content-length'])).toBeGreaterThan(0)
    })

    it('should set cache-control header for private caching', async () => {
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-20/testrun/headers_test_resume_abc123.pdf')
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
      expect(response.headers['cache-control']).toContain('private')
    })

    it('should set content-disposition header', async () => {
      const response = await request(app)
        .get('/api/generator/artifacts/2024-01-20/testrun/headers_test_resume_abc123.pdf')
        .set('Authorization', 'Bearer bypass-token')

      expect(response.status).toBe(200)
      expect(response.headers['content-disposition']).toContain('inline')
      expect(response.headers['content-disposition']).toContain('headers_test_resume_abc123.pdf')
    })
  })
})

describe('Storage service path format', () => {
  const artifactsDir = path.resolve(__dirname, '../../../../.storage-test')
  let storageService: LocalStorageService

  beforeAll(async () => {
    await fs.rm(artifactsDir, { recursive: true, force: true })
    await fs.mkdir(artifactsDir, { recursive: true })
    storageService = new LocalStorageService(artifactsDir, TEST_PUBLIC_BASE)
  })

  afterAll(async () => {
    await fs.rm(artifactsDir, { recursive: true, force: true })
  })

  it('should create paths with exactly 3 segments: date/run/filename', async () => {
    const metadata: ArtifactMetadata = {
      name: 'Test User',
      company: 'Test Company',
      role: 'Test Role',
      type: 'resume'
    }

    const result = await storageService.saveArtifactWithMetadata(
      Buffer.from('test'),
      metadata
    )

    // This is the contract: storage paths MUST have exactly 3 segments
    const segments = result.storagePath.split('/')
    expect(segments).toHaveLength(3)
    expect(segments[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(segments[1]).toBeTruthy()
    expect(segments[2]).toContain('test-user')
    expect(segments[2]).toContain('test-role')
    expect(segments[2]).toContain('resume')
    expect(segments[2]).toMatch(/\.pdf$/)
  })

  it('should create public URLs matching the route pattern', async () => {
    const metadata: ArtifactMetadata = {
      name: 'Jane Doe',
      company: 'Acme',
      role: 'Engineer',
      type: 'cover-letter'
    }

    const result = await storageService.saveArtifactWithMetadata(
      Buffer.from('test'),
      metadata
    )

    const publicUrl = storageService.createPublicUrl(result.storagePath)

    // Public URL must follow: /api/generator/artifacts/{date}/{run}/{filename}
    expect(publicUrl).toMatch(/^\/api\/generator\/artifacts\/\d{4}-\d{2}-\d{2}\/[^/]+\/[a-z0-9_-]+\.pdf$/)

    // Verify the URL can be parsed back to the expected route params
    const urlPath = publicUrl.replace('/api/generator/artifacts/', '')
    const [date, run, filename] = urlPath.split('/')
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(run).toMatch(/^run-[a-f0-9]{12}$/)
    expect(filename).toBeTruthy()
  })

  it('should sanitize special characters in metadata', async () => {
    const metadata: ArtifactMetadata = {
      name: 'José García-López III',
      company: "McDonald's & Co.",
      role: 'Sr. Engineer (Full-Stack)',
      type: 'resume'
    }

    const result = await storageService.saveArtifactWithMetadata(
      Buffer.from('test'),
      metadata
    )

    // Verify path only contains safe characters
    expect(result.storagePath).toMatch(/^[\w\-./]+$/)
    expect(result.filename).toMatch(/^[\w\-_.]+$/)
  })

  it('should truncate long values to keep filename within 55 chars', async () => {
    const metadata: ArtifactMetadata = {
      name: 'A'.repeat(100),
      company: 'B'.repeat(100),
      role: 'C'.repeat(100),
      type: 'resume'
    }

    const result = await storageService.saveArtifactWithMetadata(
      Buffer.from('test'),
      metadata
    )

    const filename = result.filename
    expect(filename.length).toBeLessThanOrEqual(55)
  })
})
