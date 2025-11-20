import type {
  QueueItem,
  ListQueueItemsResponse,
  SaveJobMatchRequest,
  ApiSuccessResponse,
} from '@shared/types'

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

function buildMatchPayload(item: QueueItem): SaveJobMatchRequest {
  const now = new Date()
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
    resumeIntakeData: { summary: 'Automation-first mindset' },
    analyzedAt: now.toISOString(),
    createdAt: now.toISOString(),
    submittedBy: item.submittedBy ?? null,
    queueItemId: item.id,
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
    const matchPayload = buildMatchPayload(item)

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
