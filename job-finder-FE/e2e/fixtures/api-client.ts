import type { APIRequestContext } from "@playwright/test"

const API_BASE = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
// Use dev-admin-token which is recognized by the backend in test mode
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "dev-admin-token"

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
  // Fetch all queue items with a high limit to ensure we get everything
  const response = await request.get(`${API_BASE}/queue?limit=1000`, {
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
    applicationPriority: "High",
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
