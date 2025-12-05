import type { APIRequestContext } from "@playwright/test"

const API_BASE = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
// Use dev-admin-token which is recognized by the backend in test mode
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "dev-admin-token"

const MIN_PREFILTER = {
  title: { requiredKeywords: [], excludedKeywords: [] },
  freshness: { maxAgeDays: 90 },
  workArrangement: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: true,
    willRelocate: true,
    userLocation: "Portland, OR",
  },
  employmentType: { allowFullTime: true, allowPartTime: true, allowContract: true },
  salary: { minimum: null },
  technology: { rejected: [] },
}

const MIN_MATCH = {
  minScore: 50,
  seniority: {
    preferred: ["senior"],
    acceptable: ["mid"],
    rejected: ["junior"],
    preferredScore: 10,
    acceptableScore: 0,
    rejectedScore: -100,
  },
  location: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: true,
    userTimezone: -8,
    maxTimezoneDiffHours: 8,
    perHourScore: -1,
    hybridSameCityScore: 0,
  },
  skillMatch: {
    baseMatchScore: 1,
    yearsMultiplier: 0.5,
    maxYearsBonus: 5,
    missingScore: -1,
    analogScore: 0,
    maxBonus: 25,
    maxPenalty: -15,
    analogGroups: [],
  },
  salary: { minimum: null, target: null, belowTargetScore: 0 },
  experience: { maxRequired: 20, overqualifiedScore: 0 },
  freshness: {
    freshDays: 30,
    freshScore: 0,
    staleDays: 60,
    staleScore: -5,
    veryStaleDays: 90,
    veryStaleScore: -10,
    repostScore: -2,
  },
  roleFit: {
    preferred: [],
    acceptable: [],
    penalized: [],
    rejected: [],
    preferredScore: 0,
    penalizedScore: -1,
  },
  company: {
    preferredCityScore: 0,
    preferredCity: undefined,
    remoteFirstScore: 0,
    aiMlFocusScore: 0,
    largeCompanyScore: 0,
    smallCompanyScore: 0,
    largeCompanyThreshold: 1000,
    smallCompanyThreshold: 50,
    startupScore: 0,
  },
}

const MIN_WORKER = {
  scraping: { requestTimeoutSeconds: 30, maxHtmlSampleLength: 20000 },
  textLimits: {
    minCompanyPageLength: 10,
    minSparseCompanyInfoLength: 10,
    maxIntakeTextLength: 500,
    maxIntakeDescriptionLength: 2000,
    maxIntakeFieldLength: 400,
    maxDescriptionPreviewLength: 500,
    maxCompanyInfoTextLength: 1000,
  },
  runtime: {
    processingTimeoutSeconds: 1800,
    isProcessingEnabled: true,
    taskDelaySeconds: 1,
    pollIntervalSeconds: 60,
    scrapeConfig: {},
  },
}

interface ApiSuccess<T> {
  success: true
  data: T
}

async function apiPost<T>(
  request: APIRequestContext,
  path: string,
  payload: Record<string, unknown>
): Promise<T> {
  const response = await request.post(`${API_BASE}${path}`, {
    data: payload,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`API request failed (${response.status()}): ${body}`)
  }

  const body = (await response.json()) as ApiSuccess<T>
  return body.data
}

export async function seedQueueJob(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const payload = {
    url: `https://example.com/jobs/e2e-${uniqueSuffix}`,
    companyName: "Queue Ops",
    source: "user_submission",
    metadata: {
      title: "E2E Queue Role",
      description: "End-to-end queue validation",
    },
    ...overrides,
  }

  const data = await apiPost<{ queueItemId: string }>(request, "/queue/jobs", payload)
  return data.queueItemId
}

export async function updateQueueItem(
  request: APIRequestContext,
  id: string,
  payload: Record<string, unknown>
) {
  const response = await request.patch(`${API_BASE}/queue/${id}`, {
    data: payload,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`Failed to update queue item ${id}: ${response.status()} ${body}`)
  }
}

export async function fetchQueueItem(
  request: APIRequestContext,
  id: string
): Promise<Record<string, unknown>> {
  const response = await request.get(`${API_BASE}/queue/${id}`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  })

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`Failed to fetch queue item ${id}: ${response.status()} ${body}`)
  }

  const body = (await response.json()) as ApiSuccess<{ queueItem: Record<string, unknown> }>
  return body.data.queueItem
}

export async function clearQueue(request: APIRequestContext) {
  // API caps limit at 100; that's sufficient for e2e seed data.
  const response = await request.get(`${API_BASE}/queue?limit=100`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  })

  if (!response.ok()) {
    console.warn(`clearQueue: Failed to fetch queue items (${response.status()})`)
    return
  }

  const body = (await response.json()) as ApiSuccess<{ items: Array<{ id: string }> }>
  const ids = body.data.items?.map((i) => i.id).filter(Boolean) || []

  if (ids.length === 0) return

  // Delete items sequentially to avoid overwhelming the server
  for (const id of ids) {
    try {
      await request.delete(`${API_BASE}/queue/${id}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      })
    } catch (err) {
      console.warn(`clearQueue: Failed to delete item ${id}:`, err)
    }
  }

  // Brief pause to let deletions settle
  await new Promise((resolve) => setTimeout(resolve, 100))
}

export async function seedContentItem(
  request: APIRequestContext,
  overrides: Record<string, unknown> & { itemData?: Record<string, unknown> } = {}
) {
  const { itemData: itemOverrides, ...rest } = overrides
  const payload: Record<string, unknown> = {
    userEmail: "owner@jobfinder.dev",
    itemData: {
      userId: "e2e-owner",
      title: "E2E Experience Co",
      role: "QA Lead",
      location: "Remote",
      website: "https://jobs.example.com",
      startDate: "2024-01",
      description: "Ensures SQLite-backed workflows ship quickly.",
      skills: ["testing", "playwright"],
      order: 0,
      parentId: null,
    },
    ...rest,
  }

  if (itemOverrides) {
    payload.itemData = {
      ...(payload.itemData as Record<string, unknown>),
      ...itemOverrides,
    }
  }

  const data = await apiPost<{ item: { id: string } }>(request, "/content-items", payload)
  return data.item.id
}

export async function deleteContentItem(request: APIRequestContext, itemId: string) {
  const response = await request.delete(`${API_BASE}/content-items/${itemId}`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to delete content item ${itemId}: ${response.status()} ${await response.text()}`)
  }
}

export async function seedBaseConfigs(request: APIRequestContext) {
  const upsert = async (id: string, payload: Record<string, unknown>) => {
    const res = await request.put(`${API_BASE}/config/${id}`, {
      data: { payload },
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    })
    if (!res.ok()) {
      const body = await res.text()
      throw new Error(`Failed to upsert config ${id}: ${res.status()} ${body}`)
    }
  }

  await upsert("prefilter-policy", MIN_PREFILTER)
  await upsert("match-policy", MIN_MATCH)
  await upsert("worker-settings", MIN_WORKER)
  await upsert("ai-settings", {
    agents: {
      "gemini.api": {
        provider: "gemini",
        interface: "api",
        defaultModel: "gemini-2.0-flash",
        enabled: true,
        reason: null,
        dailyBudget: 100,
        dailyUsage: 0,
      },
    },
    taskFallbacks: {
      extraction: ["gemini.api"],
      analysis: ["gemini.api"],
    },
    modelRates: {
      "gemini-2.0-flash": 0.5,
      "gemini-1.5-pro": 1.0,
    },
    documentGenerator: { selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" } },
    options: [
      {
        value: "gemini",
        interfaces: [
          { value: "api", enabled: true, models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
        ],
      },
      {
        value: "openai",
        interfaces: [
          { value: "api", enabled: true, models: ["gpt-4o", "gpt-4o-mini"] },
        ],
      },
    ],
  })
  await upsert("personal-info", {
    email: "owner@jobfinder.dev",
    name: "E2E Owner",
    accentColor: "#3b82f6",
    city: "",
    timezone: null,
    relocationAllowed: false,
  })

  // Seed ai-prompts via the prompts endpoint (different API structure)
  const promptsRes = await request.put(`${API_BASE}/prompts`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    data: {
      prompts: {
        resumeGeneration: "E2E test resume generation prompt",
        coverLetterGeneration: "E2E test cover letter generation prompt",
        jobScraping: "E2E test job scraping prompt",
        jobMatching: "E2E test job matching prompt",
      },
      userEmail: "owner@jobfinder.dev",
    },
  })
  if (!promptsRes.ok()) {
    const body = await promptsRes.text()
    throw new Error(`Failed to seed prompts: ${promptsRes.status()} ${body}`)
  }
}

export async function listContentItems(
  request: APIRequestContext,
  params: { userId?: string } = {}
): Promise<Array<{ id: string; title?: string | null }>> {
  const url = new URL(`${API_BASE}/content-items`)
  url.searchParams.set("userId", params.userId ?? "e2e-owner")
  url.searchParams.set("includeDrafts", "true")

  const response = await request.get(url.toString(), {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to fetch content items: ${response.status()} ${await response.text()}`)
  }

  const body = (await response.json()) as ApiSuccess<{
    items: Array<{ id: string; title?: string | null; children?: Array<{ id: string; title?: string | null }> }>
  }>

  const flatten = (
    nodes: Array<{ id: string; title?: string | null; children?: Array<{ id: string; title?: string | null }> }>
  ): Array<{ id: string; title?: string | null }> => {
    return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])])
  }

  return flatten(body.data.items ?? [])
}

export async function seedJobListing(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const payload = {
    url: `https://example.com/jobs/e2e-listing-${uniqueSuffix}`,
    title: "E2E Test Role",
    companyName: "E2E Test Company",
    description: "End-to-end test job listing",
    status: "analyzed",
    ...overrides,
  }

  const data = await apiPost<{ listing: { id: string } }>(request, "/job-listings", payload)
  return data.listing.id
}

export async function seedJobMatch(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const overrideJobTitle =
    typeof overrides.jobTitle === "string" ? (overrides.jobTitle as string) : undefined
  const overrideCompany =
    typeof overrides.companyName === "string" ? (overrides.companyName as string) : undefined

  const jobTitle = overrideJobTitle ?? "E2E Automation Engineer"
  const companyName = overrideCompany ?? "SQLite Systems"

  // Create a job listing first if jobListingId is not provided
  let jobListingId = overrides.jobListingId as string | undefined
  if (!jobListingId) {
    jobListingId = await seedJobListing(request, {
      title: jobTitle,
      companyName,
      url: `https://example.com/jobs/e2e-listing-${uniqueSuffix}`,
      description: "Owns automation coverage.",
    })
  }

  const payload = {
    jobListingId,
    matchScore: 92,
    queueItemId: overrides.queueItemId ?? `queue-${uniqueSuffix}`,
    matchedSkills: ["typescript", "sqlite"],
    missingSkills: [],
    matchReasons: ["High automation focus"],
    keyStrengths: ["Test leadership"],
    potentialConcerns: [],
    experienceMatch: 88,
    customizationRecommendations: ["Mention SQLite expertise"],
    analyzedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    resumeIntakeData: {
      jobId: `resume-${uniqueSuffix}`,
      jobTitle,
      company: companyName,
      targetSummary: "Lead automation suites that improve release confidence for SQLite stacks.",
      skillsPriority: ["Playwright", "TypeScript", "SQLite", "CI/CD"],
      experienceHighlights: [
        {
          company: "Job Finder",
          title: "QA Lead",
          pointsToEmphasize: [
            "Scaled Playwright test coverage across admin and viewer flows",
            "Built SQLite-backed pipelines for deterministic dev data",
          ],
        },
      ],
      projectsToInclude: [
        {
          name: "Content Items Unification",
          whyRelevant: "Demonstrates end-to-end data migrations with tight UI requirements.",
          pointsToHighlight: [
            "Designed nested editing experience with optimistic updates",
            "Introduced import/export workflow for resume data",
          ],
        },
        {
          name: "Automation Platform",
          whyRelevant: "Shows leadership driving headless Playwright adoption.",
          pointsToHighlight: [
            "Codified headless-only policy to protect prod environments",
            "Integrated API-level assertions into UI workflows",
          ],
        },
      ],
      achievementAngles: [
        "Automation-first leadership that protects production stability",
        "Hands-on TypeScript expertise across frontend and backend",
        "Data migrations that eliminate legacy schemas",
      ],
      atsKeywords: ["Playwright", "TypeScript", "SQLite", "Automation", "CI/CD"],
      gapMitigation: [
        {
          missingSkill: "Python",
          mitigationStrategy: "Highlight cross-language testing experience and fast ramp-up.",
          coverLetterPoint: "Note track record building automation across multiple stacks.",
        },
      ],
    },
    ...(overrides || {}),
  }

  const data = await apiPost<{ match: { id: string } }>(request, "/job-matches", payload)
  return data.match.id
}
