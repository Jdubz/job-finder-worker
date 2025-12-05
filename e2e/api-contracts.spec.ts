import { test, expect } from "@playwright/test"
import {
  jobListingRecordSchema,
  jobListingStatsSchema,
  jobMatchWithListingSchema,
  jobMatchStatsSchema,
  queueItemSchema,
  queueStatsSchema,
  companySchema,
  jobSourceSchema,
  jobSourceStatsSchema,
  contentItemSchema,
  configEntrySchema,
  structuredLogEntrySchema,
} from "@shared/types"

const API_BASE = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "dev-admin-token"

test.describe("API contract (shared schemas)", () => {
  test("API contract :: listings/matches/queue/companies/sources/content/config/logging conform to shared schemas", async ({ request }) => {
    // Seed one listing so listing schema validation hits real data
    const unique = `e2e-contract-${Date.now()}`
    const createRes = await request.post(`${API_BASE}/job-listings`, {
      data: {
        url: `https://example.com/${unique}`,
        title: "Contract Schema Engineer",
        companyName: "Schema Co",
        description: "Validate schemas",
      },
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(createRes.ok()).toBeTruthy()

    const listingsRes = await request.get(`${API_BASE}/job-listings?limit=5`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(listingsRes.ok()).toBeTruthy()
    const listingsBody = await listingsRes.json()
    const listingsParse = jobListingRecordSchema.array().safeParse(listingsBody.data.listings)
    expect(listingsParse.success).toBe(true)

    const listingStatsRes = await request.get(`${API_BASE}/job-listings/stats`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(listingStatsRes.ok()).toBeTruthy()
    const listingStatsBody = await listingStatsRes.json()
    const listingStatsParse = jobListingStatsSchema.safeParse(listingStatsBody.data.stats)
    expect(listingStatsParse.success).toBe(true)

    // Job matches may be empty; still validate payload shape
    const matchesRes = await request.get(`${API_BASE}/job-matches`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(matchesRes.ok()).toBeTruthy()
    const matchesBody = await matchesRes.json()
    const matchesParse = jobMatchWithListingSchema.array().safeParse(matchesBody.data.matches)
    expect(matchesParse.success).toBe(true)

    const matchStatsRes = await request.get(`${API_BASE}/job-matches/stats`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(matchStatsRes.ok()).toBeTruthy()
    const matchStatsBody = await matchStatsRes.json()
    const matchStatsParse = jobMatchStatsSchema.safeParse(matchStatsBody.data.stats)
    expect(matchStatsParse.success).toBe(true)

    // Queue: submit a job and validate payloads
    const queueRes = await request.post(`${API_BASE}/queue/jobs`, {
      data: {
        url: `https://example.com/${unique}-queue`,
        companyName: "Queue Co",
      },
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(queueRes.ok()).toBeTruthy()

    const queueList = await request.get(`${API_BASE}/queue?limit=5`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(queueList.ok()).toBeTruthy()
    const queueBody = await queueList.json()
    const queueParse = queueItemSchema.array().safeParse(queueBody.data.items)
    expect(queueParse.success).toBe(true)

    const queueStats = await request.get(`${API_BASE}/queue/stats`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(queueStats.ok()).toBeTruthy()
    const queueStatsBody = await queueStats.json()
    const queueStatsParse = queueStatsSchema.safeParse(queueStatsBody.data.stats)
    expect(queueStatsParse.success).toBe(true)

    // Companies: list should conform even if empty
    const companiesRes = await request.get(`${API_BASE}/companies`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(companiesRes.ok()).toBeTruthy()
    const companiesBody = await companiesRes.json()
    const companiesParse = companySchema.array().safeParse(companiesBody.data.items)
    expect(companiesParse.success).toBe(true)

    // Job sources: list + stats
    const sourcesRes = await request.get(`${API_BASE}/job-sources`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(sourcesRes.ok()).toBeTruthy()
    const sourcesBody = await sourcesRes.json()
    const sourcesParse = jobSourceSchema.array().safeParse(sourcesBody.data.items)
    expect(sourcesParse.success).toBe(true)

    const sourcesStatsRes = await request.get(`${API_BASE}/job-sources/stats`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(sourcesStatsRes.ok()).toBeTruthy()
    const sourcesStatsBody = await sourcesStatsRes.json()
    const sourcesStatsParse = jobSourceStatsSchema.safeParse(sourcesStatsBody.data.stats)
    expect(sourcesStatsParse.success).toBe(true)

    // Content items: list returns a tree; validate shape
    const contentRes = await request.get(`${API_BASE}/content-items`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(contentRes.ok()).toBeTruthy()
    const contentBody = await contentRes.json()
    const contentParse = contentItemSchema.array().safeParse(contentBody.data.items)
    expect(contentParse.success).toBe(true)

    // Config: list returns config entries matching shared schema
    const configRes = await request.get(`${API_BASE}/config`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    })
    expect(configRes.ok()).toBeTruthy()
    const configBody = await configRes.json()
    const configParse = configEntrySchema.array().safeParse(configBody.data.configs)
    expect(configParse.success).toBe(true)

    // Logging: POST accepts shared schema
    const logPayload = {
      entries: [
        { category: "client", action: "contract-test", message: "ok" },
      ],
    }
    const logParse = structuredLogEntrySchema.array().safeParse(logPayload.entries)
    expect(logParse.success).toBe(true)
    const logRes = await request.post(`${API_BASE}/logging`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      data: logPayload,
    })
    expect(logRes.ok()).toBeTruthy()
  })
})
