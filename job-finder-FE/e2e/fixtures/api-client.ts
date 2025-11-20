import type { APIRequestContext } from "@playwright/test"

const API_BASE = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "e2e-test-token"

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
      visibility: "published",
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

export async function seedJobMatch(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const payload = {
    jobTitle: "E2E Automation Engineer",
    companyName: "SQLite Systems",
    url: `https://example.com/jobs/e2e-automation-${uniqueSuffix}`,
    matchScore: 92,
    queueItemId: overrides.queueItemId ?? null,
    location: "Remote",
    salaryRange: "$150k",
    jobDescription: "Owns automation coverage.",
    companyInfo: "Automation focused org",
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
    resumeIntakeData: { summary: "Hands-on automation" },
    ...(overrides || {}),
  }

  const data = await apiPost<{ match: { id: string } }>(request, "/job-matches", payload)
  return data.match.id
}
