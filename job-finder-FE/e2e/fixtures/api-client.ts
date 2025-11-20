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
      type: "company",
      userId: "e2e-owner",
      company: "E2E Experience Co",
      role: "QA Lead",
      location: "Remote",
      website: "https://jobs.example.com",
      startDate: "2024-01",
      summary: "Ensures SQLite-backed workflows ship quickly.",
      visibility: "published",
      order: 1,
      tags: ["e2e"],
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
