import type {
  QueueItem,
  ListQueueItemsResponse,
  SaveJobMatchRequest,
  ApiSuccessResponse,
} from '@shared/types'
import path from 'node:path'

let listingRepo:
  | import('../../../job-finder-BE/server/src/modules/job-listings/job-listing.repository').JobListingRepository
  | null = null

async function getListingRepo() {
  if (!listingRepo) {
    // Ensure env is set before repository bootstraps the DB connection
    if (!process.env.DATABASE_PATH) {
      process.env.DATABASE_PATH = 'file:memory:?cache=shared'
    }
    if (!process.env.JF_SQLITE_MIGRATIONS_DIR) {
      process.env.JF_SQLITE_MIGRATIONS_DIR = path.resolve('infra/sqlite/migrations')
    }

    const { JobListingRepository } = await import(
      '../../../job-finder-BE/server/src/modules/job-listings/job-listing.repository'
    )
    listingRepo = new JobListingRepository()
  }

  return listingRepo
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Request failed ${res.status}: ${body}`)
  }
  return (await res.json()) as T
}

async function ensureJobListing(item: QueueItem): Promise<string> {
  const repo = await getListingRepo()
  const existing = repo.getByUrl(item.url)
  if (existing) return existing.id

  const created = repo.create({
    url: item.url,
    sourceId: null,
    companyId: item.companyId ?? null,
    title: item.metadata?.title ?? 'Mock Engineer',
    companyName: item.companyName || 'Mock Company',
    location: 'Remote',
    salaryRange: null,
    description:
      typeof item.metadata?.description === 'string'
        ? item.metadata.description
        : 'Mock description',
    postedDate: null,
    status: 'pending',
    filterResult: null,
  })

  return created.id
}

async function buildMatchPayload(item: QueueItem): Promise<SaveJobMatchRequest> {
  const now = new Date()
  const jobListingId = await ensureJobListing(item)
  return {
    id: undefined,
    url: item.url || `https://example.com/${item.id}`,
    companyName: item.companyName || 'Mock Company',
    jobTitle: item.metadata?.title ?? 'Mock Engineer',
    location: 'Remote',
    salaryRange: '$120k+',
    jobDescription: 'Mock description',
    companyInfo: 'Mock info',
    matchScore: 92,
    matchedSkills: ['python', 'sqlite'],
    missingSkills: [],
    matchReasons: ['Fits mock profile'],
    keyStrengths: ['End-to-end migration'],
    potentialConcerns: ['Needs role clarity'],
    experienceMatch: 80,
    applicationPriority: 'High',
    customizationRecommendations: ['Highlight SQLite migration work'],
    resumeIntakeData: {
      jobId: item.id ?? `job-${Date.now()}`,
      jobTitle: item.metadata?.title ?? 'Mock Engineer',
      company: item.companyName || 'Mock Company',
      targetSummary: 'Automation-first engineer focused on rapid iteration.',
      skillsPriority: ['Automation', 'SQLite'],
      experienceHighlights: [
        {
          company: 'PrevCo',
          title: 'Lead Engineer',
          pointsToEmphasize: ['Shipped automation pipeline', 'Mentored 5 engineers'],
        },
      ],
      projectsToInclude: [
        {
          name: 'Mock Importer',
          whyRelevant: 'Matches queue processing domain',
          pointsToHighlight: ['Handled 10k jobs/day'],
        },
      ],
      achievementAngles: ['Focus on reliability', 'Obsessed with DX'],
      atsKeywords: ['automation', 'sqlite', 'queueing'],
      gapMitigation: [
        {
          missingSkill: 'Go',
          mitigationStrategy: 'Highlight rapid learning from past migrations',
          coverLetterPoint: 'Explain adaptability to new stacks',
        },
      ],
    },
    analyzedAt: now.toISOString(),
    createdAt: now.toISOString(),
    submittedBy: item.submittedBy ?? null,
    queueItemId: item.id,
    jobListingId,
  }
}

export async function runMockWorker(apiBase: string, authToken: string): Promise<string[]> {
  const queueResp = await fetchJson<ApiSuccessResponse<ListQueueItemsResponse>>(
    `${apiBase}/queue?status=pending`,
    { headers: authHeaders(authToken) }
  )

  const processed: string[] = []
  for (const item of queueResp.data.items) {
    if (!item.id) continue
    const matchPayload = await buildMatchPayload(item)

    await fetchJson(`${apiBase}/job-matches`, {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify(matchPayload),
    })

    await fetchJson(`${apiBase}/queue/${item.id}`, {
      method: 'PATCH',
      headers: authHeaders(authToken),
      body: JSON.stringify({
        status: 'success',
        result_message: 'Mock worker saved job match',
      }),
    })

    processed.push(item.id)
  }

  return processed
}
