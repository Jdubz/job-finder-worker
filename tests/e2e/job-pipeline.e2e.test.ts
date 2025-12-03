import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"
import { DEFAULT_PROMPTS } from "@shared/types"
import { setupTestServer } from "./helpers/test-server"
import { runMockWorker } from "./helpers/mock-worker"
import { TEST_AUTH_TOKEN_KEY } from "../../job-finder-FE/src/config/testing"

interface ApiSuccess<T> {
  success: true
  data: T
}

type TestContext = Awaited<ReturnType<typeof setupTestServer>>

let ctx: TestContext | null = null

let sharedLocalStorage: Map<string, string> | null = null

function ensureWindowAuth(token: string) {
  const store = sharedLocalStorage ?? (sharedLocalStorage = new Map<string, string>())

  if (!globalThis.window || typeof globalThis.window.localStorage?.setItem !== "function") {
    const localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size
      },
    }

    if (!globalThis.window) {
      ;(globalThis as any).window = { localStorage }
    } else {
      globalThis.window.localStorage = localStorage
    }
  }

  // Provide browser timer APIs expected by frontend logger
  if (!globalThis.window!.setTimeout) {
    globalThis.window!.setTimeout = globalThis.setTimeout.bind(globalThis) as any
  }
  if (!globalThis.window!.clearTimeout) {
    globalThis.window!.clearTimeout = globalThis.clearTimeout.bind(globalThis) as any
  }
  if (!globalThis.window!.addEventListener) {
    globalThis.window!.addEventListener = () => {}
  }
  if (!globalThis.window!.removeEventListener) {
    globalThis.window!.removeEventListener = () => {}
  }

  globalThis.window!.localStorage!.setItem(TEST_AUTH_TOKEN_KEY, token)
}

function requireCtx(): TestContext {
  if (!ctx) {
    throw new Error("Test server did not initialize")
  }
  return ctx
}

async function seedJobMatch(title: string) {
  await authorizedRequest<{ queueItemId: string }>("/queue/jobs", {
    method: "POST",
    body: JSON.stringify({
      url: `https://example.com/jobs/${title}-${Date.now()}`,
      companyName: "E2E Seed Co",
      metadata: { title },
      source: "manual_submission",
    }),
  })
  const server = requireCtx()
  await runMockWorker(server.apiBase, server.authToken)
}

async function initFrontendClients() {
  const server = requireCtx()
  ensureWindowAuth(server.authToken)
  vi.resetModules()
  vi.doMock("@/config/firebase", () => ({
    auth: {
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue(server.authToken),
      },
    },
    appCheck: null,
  }))
  vi.doMock("firebase/app-check", () => ({
    getToken: vi.fn().mockResolvedValue({ token: "test-app-check" }),
  }))

  globalThis.__E2E_API_BASE__ = server.origin

  const { BaseApiClient } = await import("../../job-finder-FE/src/api/base-client")
  const originalRequest = BaseApiClient.prototype.request
  vi.spyOn(BaseApiClient.prototype, "request").mockImplementation(function (endpoint, options = {}) {
    const headers = {
      Authorization: `Bearer ${server.authToken}`,
      ...(options.headers || {}),
    }
    return originalRequest.call(this, endpoint, { ...options, headers })
  })

  const [{ QueueClient }, { JobMatchesClient }, { ContentItemsClient }, { ConfigClient }, { PromptsClient }] =
    await Promise.all([
      import("../../job-finder-FE/src/api/queue-client"),
      import("../../job-finder-FE/src/api/job-matches-client"),
      import("../../job-finder-FE/src/api/content-items-client"),
      import("../../job-finder-FE/src/api/config-client"),
      import("../../job-finder-FE/src/api/prompts-client"),
    ])

  const queueClient = new QueueClient(server.apiBase)
  const jobMatchesClient = new JobMatchesClient(server.apiBase)
  const contentItemsClient = new ContentItemsClient(server.apiBase)
  const configClient = new ConfigClient(server.apiBase)
  const promptsClient = new PromptsClient(server.apiBase)
  return {
    server,
    queueClient,
    jobMatchesClient,
    contentItemsClient,
    configClient,
    promptsClient,
  }
}

async function authorizedRequest<T>(path: string, init: RequestInit = {}) {
  const server = requireCtx()
  const response = await fetch(`${server.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${server.authToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })

  const body = (await response.json()) as ApiSuccess<T>
  return { status: response.status, body }
}

beforeAll(async () => {
  ctx = await setupTestServer()
  globalThis.__E2E_API_BASE__ = ctx.origin
})

afterAll(async () => {
  if (ctx) {
    await ctx.close()
  }
})

describe("Job pipeline integration", () => {
  it("queues a job, runs the mock worker, and exposes matches", async () => {
    const submitPayload = {
      url: `https://example.com/jobs/mock-engineer-${Date.now()}`,
      companyName: "Example Labs",
      source: "user_submission",
      metadata: {
        title: "Mock Engineer",
        description: "Drive the SQLite migration",
      },
    }

    const queueRes = await authorizedRequest<{ queueItemId: string }>("/queue/jobs", {
      method: "POST",
      body: JSON.stringify(submitPayload),
    })

    expect(queueRes.status).toBe(201)
    const queueItemId = queueRes.body.data.queueItemId

    const server = requireCtx()
    const processedIds = await runMockWorker(server.apiBase, server.authToken)
    expect(processedIds).toContain(queueItemId)

    const matchesRes = await authorizedRequest<{ matches: any[] }>(
      "/job-matches"
    )
    expect(matchesRes.body.data.matches.length).toBeGreaterThan(0)
    expect(matchesRes.body.data.matches[0].queueItemId).toBe(queueItemId)

    const statsRes = await authorizedRequest<{ stats: Record<string, number> }>(
      "/queue/stats"
    )
    expect(statsRes.body.data.stats.success).toBeGreaterThanOrEqual(1)
  })
})

describe("Frontend clients", () => {
  it("use the REST API with mocked Firebase credentials", async () => {
    await seedJobMatch("frontend-rest-seed")
    const { queueClient, jobMatchesClient } = await initFrontendClients()

    const queueData = await queueClient.listQueueItems({ status: "success" })
    expect(queueData.items.length).toBeGreaterThan(0)

    const matches = await jobMatchesClient.listMatches({ minScore: 50 })
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].applicationPriority).toBe("High")
  })
})

describe("Queue administration", () => {
  it("submits, updates, and deletes queue items via the REST client", async () => {
    const { queueClient } = await initFrontendClients()
    const submission = await queueClient.submitJob({
      url: `https://example.com/jobs/e2e-queue-${Date.now()}`,
      companyName: "Queue Ops",
      source: "manual_submission",
      metadata: { title: "Ops role" },
    })

    expect(submission.type).toBe("job")
    expect(submission.status).toBe("pending")

    const updated = await queueClient.updateQueueItem(submission.id, {
      status: "processing",
      result_message: "Investigating",
    })
    expect(updated.status).toBe("processing")
    expect(updated.result_message).toBe("Investigating")

    await queueClient.deleteQueueItem(submission.id)
    const listAfterDelete = await queueClient.listQueueItems({ status: "pending" })
    expect(listAfterDelete.items.find((item) => item.id === submission.id)).toBeUndefined()
  })
})

describe("Job match access", () => {
  it("filters matches, fetches details, and reads stats", async () => {
    await seedJobMatch("job-match-access")
    const { jobMatchesClient } = await initFrontendClients()
    const matches = await jobMatchesClient.listMatches({ minScore: 80 })
    expect(matches.length).toBeGreaterThan(0)

    const detail = await jobMatchesClient.getMatch(matches[0].id)
    expect(detail?.url).toBe(matches[0].url)

    const stats = await jobMatchesClient.getMatchStats()
    expect(stats.total).toBeGreaterThan(0)
    expect(stats.averageScore).toBeGreaterThan(0)
  })
})

describe("Content items", () => {
  it("supports create, update, list, and delete flows", async () => {
    const { contentItemsClient } = await initFrontendClients()
    const userEmail = "content-admin@jobfinder.dev"
    const userId = "content-admin"

    const created = await contentItemsClient.createContentItem(userEmail, {
      userId,
      title: "Mission",
      description: "Ship SQLite migrations fast.",
      parentId: null,
      order: 1,
    })

    expect(created.title).toBe("Mission")
    expect(created.createdBy).toBeTruthy()
    expect(created.createdBy?.includes("@")).toBe(true)

    const updated = await contentItemsClient.updateContentItem(created.id, userEmail, {
      description: "Updated copy for the in-memory e2e suite.",
    })

    expect(updated.description).toContain("in-memory e2e")

    const listed = await contentItemsClient.list(userId)
    expect(listed.map((item) => item.id)).toContain(created.id)

    await contentItemsClient.deleteContentItem(created.id)
    const afterDelete = await contentItemsClient.list(userId)
    expect(afterDelete.find((item) => item.id === created.id)).toBeUndefined()
  })
})

describe("Configuration flows", () => {
  it("updates prefilter policy, match policy, worker runtime, AI settings, and personal info", async () => {
    const { configClient } = await initFrontendClients()
    const userEmail = "ops@jobfinder.dev"

    const existingPrefilter = await configClient.getPrefilterPolicy()
    await configClient.updatePrefilterPolicy({
      ...existingPrefilter,
      title: {
        ...(existingPrefilter?.title ?? { requiredKeywords: [], excludedKeywords: [] }),
        requiredKeywords: [...(existingPrefilter?.title.requiredKeywords ?? []), "engineer"],
        excludedKeywords: [...(existingPrefilter?.title.excludedKeywords ?? []), "intern"],
      },
    })
    const prefilter = await configClient.getPrefilterPolicy()
    expect(prefilter.title.requiredKeywords).toContain("engineer")
    expect(prefilter.title.excludedKeywords).toContain("intern")

    // Match policy (not seeded by default - must create a complete config)
    const testMatchPolicy = {
      minScore: 65,
      weights: { skillMatch: 1, experienceMatch: 1, seniorityMatch: 1 },
      seniority: { preferred: ["senior"], acceptable: ["mid"], rejected: ["intern"], preferredScore: 10, acceptableScore: 0, rejectedScore: -100 },
      location: { allowRemote: true, allowHybrid: true, allowOnsite: false, userTimezone: -8, maxTimezoneDiffHours: 4, perHourScore: -3, hybridSameCityScore: 10 },
      technology: { required: ["typescript"], preferred: ["react"], disliked: [], rejected: [], requiredScore: 10, preferredScore: 5, dislikedScore: -5 },
      salary: { minimum: 100000, target: 150000, belowTargetScore: -2 },
      experience: { userYears: 8, maxRequired: 15, overqualifiedScore: -5 },
      freshness: { freshDays: 7, freshScore: 5, staleDays: 30, staleScore: -5, veryStaleDays: 60, veryStaleScore: -15, repostScore: -10 },
      roleFit: { preferred: ["backend", "ml-ai", "devops", "data", "security"], acceptable: ["fullstack"], penalized: ["frontend", "consulting"], rejected: ["clearance-required", "management"], preferredScore: 10, penalizedScore: -5 },
      company: { preferredCityScore: 5, remoteFirstScore: 5, aiMlFocusScore: 5, largeCompanyScore: 5, smallCompanyScore: -5, largeCompanyThreshold: 1000, smallCompanyThreshold: 50, startupScore: 0 },
    }
    await configClient.updateMatchPolicy(testMatchPolicy)
    const matchPolicy = await configClient.getMatchPolicy()
    expect(matchPolicy?.minScore).toBe(65)

    await configClient.updateQueueSettings({ processingTimeoutSeconds: 1200 })
    const queueSettings = await configClient.getQueueSettings()
    expect(queueSettings?.processingTimeoutSeconds).toBe(1200)

    await configClient.updateAISettings({
      selected: { provider: "openai", interface: "api", model: "gpt-4o-mini" },
    })
    const aiSettings = await configClient.getAISettings()
    expect(aiSettings?.worker.selected.provider).toBe("openai")
    expect(aiSettings?.worker.selected.model).toBe("gpt-4o-mini")

    const personalInfo = await configClient.updatePersonalInfo(
      {
        summary: "Automation-focused QA",
        accentColor: "#ff3366",
      },
      userEmail
    )
    expect(personalInfo.summary).toContain("Automation")
    expect(personalInfo.accentColor).toBe("#ff3366")
  })
})

describe("Configuration discovery", () => {
  it("lists all config entries and fetches individual records", async () => {
    const { configClient } = await initFrontendClients()
    const configs = await configClient.listEntries()
    expect(configs.length).toBeGreaterThan(0)

    const recap = await configClient.getEntry(configs[0].id)
    expect(recap?.id).toBe(configs[0].id)
  })
})

describe("Prompts", () => {
  it("saves custom prompts and resets to defaults", async () => {
    const { promptsClient } = await initFrontendClients()
    const userEmail = "ai-admin@jobfinder.dev"

    const existingPrompts = await promptsClient.getPrompts()
    await promptsClient.savePrompts(
      {
        resumeGeneration: `${existingPrompts.resumeGeneration}\n// e2e customization`,
        coverLetterGeneration: existingPrompts.coverLetterGeneration,
        jobScraping: existingPrompts.jobScraping,
        jobMatching: existingPrompts.jobMatching,
      },
      userEmail
    )

    const updatedPrompts = await promptsClient.getPrompts()
    expect(updatedPrompts.resumeGeneration).toContain("e2e customization")

    await promptsClient.resetToDefaults(userEmail)
    const resetPrompts = await promptsClient.getPrompts()
    expect(resetPrompts.resumeGeneration).toBe(DEFAULT_PROMPTS.resumeGeneration)
  })
})
