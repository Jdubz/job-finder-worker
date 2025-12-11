/**
 * Job Applicator API Integration Tests
 *
 * These tests verify that the job-applicator's API client correctly interacts
 * with the backend API endpoints. They test the full integration flow from
 * document generation to document retrieval.
 *
 * These tests use Playwright's API testing capabilities to make HTTP requests
 * directly, simulating what the job-applicator's api-client.ts does.
 */
import { test, expect } from "@playwright/test"
import {
  generatorDocumentsResponseSchema,
  generatorSingleDocumentResponseSchema,
  generatorStartResponseSchema,
  generatorStepResponseSchema,
  jobMatchWithListingSchema,
} from "@shared/types"

const API_BASE = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "dev-admin-token"

test.describe("Job Applicator API Integration", () => {
  test.describe("Document Generation Flow", () => {
    test("complete document generation workflow with schema validation", async ({ request }) => {
      // Step 1: Create a job listing
      const unique = `applicator-e2e-${Date.now()}`
      const listingRes = await request.post(`${API_BASE}/job-listings`, {
        data: {
          url: `https://example.com/${unique}`,
          title: "Senior TypeScript Developer",
          companyName: "E2E Test Corp",
          description: "Build amazing applications with TypeScript",
          location: "Remote",
          techStack: "TypeScript, React, Node.js",
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(listingRes.ok()).toBeTruthy()
      const listingBody = await listingRes.json()
      const listingId = listingBody.data.listing.id

      // Step 2: Create a job match for this listing
      const matchRes = await request.post(`${API_BASE}/job-matches`, {
        data: {
          listingId,
          score: 90,
          matchedSkills: ["TypeScript", "React", "Node.js"],
          missingSkills: [],
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(matchRes.ok()).toBeTruthy()
      const matchBody = await matchRes.json()
      const jobMatchId = matchBody.data.match.id

      // Validate job match response conforms to shared schema
      const matchParse = jobMatchWithListingSchema.safeParse(matchBody.data.match)
      expect(
        matchParse.success,
        `Job match schema validation failed: ${!matchParse.success ? JSON.stringify(matchParse.error.format(), null, 2) : ""}`
      ).toBe(true)

      // Step 3: Start document generation linked to job match
      const startRes = await request.post(`${API_BASE}/generator/start`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
        data: {
          generateType: "resume",
          job: {
            role: "Senior TypeScript Developer",
            company: "E2E Test Corp",
            jobDescriptionUrl: `https://example.com/${unique}`,
            location: "Remote",
          },
          jobMatchId,
        },
      })
      expect(startRes.ok()).toBeTruthy()
      const startBody = await startRes.json()

      // Validate start response schema
      const startParse = generatorStartResponseSchema.safeParse(startBody.data)
      expect(
        startParse.success,
        `Generator start schema validation failed: ${!startParse.success ? JSON.stringify(startParse.error.format(), null, 2) : ""}`
      ).toBe(true)

      const requestId = startBody.data?.requestId
      expect(requestId).toBeTruthy()

      // Step 4: Execute generation steps (up to 5 steps max for test)
      let stepCount = 0
      let lastStepResponse = startBody.data
      while (lastStepResponse?.nextStep && stepCount < 5) {
        const stepRes = await request.post(`${API_BASE}/generator/step/${requestId}`, {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
        })
        expect(stepRes.ok()).toBeTruthy()
        const stepBody = await stepRes.json()

        // Validate step response schema
        const stepParse = generatorStepResponseSchema.safeParse(stepBody.data)
        expect(
          stepParse.success,
          `Generator step schema validation failed: ${!stepParse.success ? JSON.stringify(stepParse.error.format(), null, 2) : ""}`
        ).toBe(true)

        lastStepResponse = stepBody.data
        stepCount++
      }

      // Step 5: Fetch documents for job match (simulates job-applicator loadDocuments)
      const docsRes = await request.get(`${API_BASE}/generator/job-matches/${jobMatchId}/documents`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(docsRes.ok()).toBeTruthy()
      const docsBody = await docsRes.json()

      // Validate documents response schema
      const docsParse = generatorDocumentsResponseSchema.safeParse(docsBody.data)
      expect(
        docsParse.success,
        `Documents response schema validation failed: ${!docsParse.success ? JSON.stringify(docsParse.error.format(), null, 2) : ""}`
      ).toBe(true)

      // Should have at least one document
      expect(docsBody.data.requests.length).toBeGreaterThanOrEqual(1)
      expect(docsBody.data.count).toBeGreaterThanOrEqual(1)

      // Verify document has expected fields
      const doc = docsBody.data.requests[0]
      expect(doc.id).toBe(requestId)
      expect(doc.jobMatchId).toBe(jobMatchId)
      expect(doc.generateType).toBe("resume")
      expect(["pending", "processing", "completed", "failed"]).toContain(doc.status)

      // Step 6: Fetch single document by ID (simulates job-applicator fetchGeneratorRequest)
      const singleDocRes = await request.get(`${API_BASE}/generator/requests/${requestId}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(singleDocRes.ok()).toBeTruthy()
      const singleDocBody = await singleDocRes.json()

      // Validate single document response schema
      const singleDocParse = generatorSingleDocumentResponseSchema.safeParse(singleDocBody.data)
      expect(
        singleDocParse.success,
        `Single document schema validation failed: ${!singleDocParse.success ? JSON.stringify(singleDocParse.error.format(), null, 2) : ""}`
      ).toBe(true)

      // Verify document matches what we created
      expect(singleDocBody.data.request.id).toBe(requestId)
      expect(singleDocBody.data.request.jobMatchId).toBe(jobMatchId)
    })

    test("documents endpoint returns correct shape for job match with no documents", async ({ request }) => {
      // Create a job match without any documents
      const unique = `no-docs-${Date.now()}`
      const listingRes = await request.post(`${API_BASE}/job-listings`, {
        data: {
          url: `https://example.com/${unique}`,
          title: "No Docs Test",
          companyName: "No Docs Co",
          description: "Test job match with no documents",
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(listingRes.ok()).toBeTruthy()
      const listingBody = await listingRes.json()

      const matchRes = await request.post(`${API_BASE}/job-matches`, {
        data: {
          listingId: listingBody.data.listing.id,
          score: 75,
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(matchRes.ok()).toBeTruthy()
      const matchBody = await matchRes.json()
      const jobMatchId = matchBody.data.match.id

      // Fetch documents for this new match (should be empty)
      const docsRes = await request.get(`${API_BASE}/generator/job-matches/${jobMatchId}/documents`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(docsRes.ok()).toBeTruthy()
      const docsBody = await docsRes.json()

      // Validate schema even for empty response
      const docsParse = generatorDocumentsResponseSchema.safeParse(docsBody.data)
      expect(docsParse.success).toBe(true)

      // Should return empty array with count 0
      expect(docsBody.data.requests).toEqual([])
      expect(docsBody.data.count).toBe(0)
    })

    test("documents endpoint uses 'requests' field (not 'documents')", async ({ request }) => {
      // This test explicitly verifies the API contract that caused the bug
      const docsRes = await request.get(`${API_BASE}/generator/job-matches/any-id/documents`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(docsRes.ok()).toBeTruthy()
      const docsBody = await docsRes.json()

      // Verify the response uses 'requests' field (not 'documents')
      expect(docsBody.data).toHaveProperty("requests")
      expect(docsBody.data).toHaveProperty("count")
      expect(docsBody.data).not.toHaveProperty("documents")

      // Verify requests is an array
      expect(Array.isArray(docsBody.data.requests)).toBe(true)
    })
  })

  test.describe("Job Match Status Updates", () => {
    test("update job match status workflow", async ({ request }) => {
      // Create a job listing and match
      const unique = `status-test-${Date.now()}`
      const listingRes = await request.post(`${API_BASE}/job-listings`, {
        data: {
          url: `https://example.com/${unique}`,
          title: "Status Test Engineer",
          companyName: "Status Co",
          description: "Test status updates",
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(listingRes.ok()).toBeTruthy()
      const listingBody = await listingRes.json()

      const matchRes = await request.post(`${API_BASE}/job-matches`, {
        data: {
          listingId: listingBody.data.listing.id,
          score: 80,
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(matchRes.ok()).toBeTruthy()
      const matchBody = await matchRes.json()
      const jobMatchId = matchBody.data.match.id

      // Initial status should be active
      expect(matchBody.data.match.status).toBe("active")

      // Update to applied
      const appliedRes = await request.patch(`${API_BASE}/job-matches/${jobMatchId}/status`, {
        data: { status: "applied" },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(appliedRes.ok()).toBeTruthy()

      // Verify status changed
      const verifyRes = await request.get(`${API_BASE}/job-matches/${jobMatchId}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(verifyRes.ok()).toBeTruthy()
      const verifyBody = await verifyRes.json()
      expect(verifyBody.data.match.status).toBe("applied")

      // Update to ignored
      const ignoredRes = await request.patch(`${API_BASE}/job-matches/${jobMatchId}/status`, {
        data: { status: "ignored" },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(ignoredRes.ok()).toBeTruthy()

      // Verify status changed
      const verify2Res = await request.get(`${API_BASE}/job-matches/${jobMatchId}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(verify2Res.ok()).toBeTruthy()
      const verify2Body = await verify2Res.json()
      expect(verify2Body.data.match.status).toBe("ignored")
    })

    test("filtering job matches by status", async ({ request }) => {
      // Fetch only active matches (default behavior)
      const activeRes = await request.get(`${API_BASE}/job-matches?status=active&limit=10`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(activeRes.ok()).toBeTruthy()
      const activeBody = await activeRes.json()

      // All returned matches should be active
      for (const match of activeBody.data.matches) {
        expect(match.status).toBe("active")
      }

      // Fetch all statuses
      const allRes = await request.get(`${API_BASE}/job-matches?status=all&limit=50`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(allRes.ok()).toBeTruthy()
      const allBody = await allRes.json()

      // Should include matches of various statuses
      expect(Array.isArray(allBody.data.matches)).toBe(true)
    })
  })

  test.describe("Queue Integration", () => {
    test("submit job to queue (simulates job-applicator submitJobToQueue)", async ({ request }) => {
      const unique = `queue-submit-${Date.now()}`
      const queueRes = await request.post(`${API_BASE}/queue/jobs`, {
        data: {
          url: `https://example.com/${unique}`,
          title: "Queue Test Job",
          companyName: "Queue Test Co",
          description: "Testing queue submission from job-applicator",
          source: "user_submission",
          bypassFilter: true,
        },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(queueRes.ok()).toBeTruthy()
      const queueBody = await queueRes.json()

      // Should return job ID and status
      expect(queueBody.data).toHaveProperty("id")
      expect(queueBody.data).toHaveProperty("status")
    })
  })

  test.describe("Content and Profile APIs", () => {
    test("fetch applicator profile endpoint", async ({ request }) => {
      const profileRes = await request.get(`${API_BASE}/applicator/profile`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(profileRes.ok()).toBeTruthy()
      const profileBody = await profileRes.json()

      // Should return profileText (pre-formatted for AI)
      expect(profileBody.data).toHaveProperty("profileText")
      expect(typeof profileBody.data.profileText).toBe("string")
    })

    test("fetch content items (work history)", async ({ request }) => {
      const contentRes = await request.get(`${API_BASE}/content-items`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(contentRes.ok()).toBeTruthy()
      const contentBody = await contentRes.json()

      // Should return items array
      expect(contentBody.data).toHaveProperty("items")
      expect(Array.isArray(contentBody.data.items)).toBe(true)
    })

    test("fetch personal info config", async ({ request }) => {
      const configRes = await request.get(`${API_BASE}/config/personal-info`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
      expect(configRes.ok()).toBeTruthy()
      const configBody = await configRes.json()

      // Should return config with payload
      expect(configBody.data).toHaveProperty("config")
      expect(configBody.data.config).toHaveProperty("payload")
    })
  })
})
