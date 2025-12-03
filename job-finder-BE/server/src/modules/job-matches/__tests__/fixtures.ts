import type { CreateJobMatchInput } from '../job-match.repository'
import type { JobListingRecord } from '@shared/types'

export const buildJobListingRecord = (
  overrides: Partial<JobListingRecord> = {}
): Omit<JobListingRecord, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date } => {
  const id = overrides.id ?? `listing-${Math.random().toString(36).slice(2)}`
  const counter = id.split('-').pop() ?? '0'

  return {
    id,
    url: overrides.url ?? `https://example.com/jobs/${id}`,
    sourceId: overrides.sourceId ?? null,
    companyId: overrides.companyId ?? null,
    title: overrides.title ?? `Engineer ${counter}`,
    companyName: overrides.companyName ?? `Company ${counter}`,
    location: overrides.location ?? 'Remote',
    salaryRange: overrides.salaryRange ?? '$100k-$150k',
    description: overrides.description ?? `Job description for position ${counter}`,
    postedDate: overrides.postedDate ?? null,
    status: overrides.status ?? 'pending',
    filterResult: overrides.filterResult ?? null,
  }
}

export const buildJobMatchInput = (
  overrides: Partial<CreateJobMatchInput> = {}
): CreateJobMatchInput => {
  const counter = overrides.queueItemId?.split('-').pop() ?? '0'
  const analyzedDate = new Date(2025, 0, (Number(counter) % 28) + 1)

  return {
    jobListingId: overrides.jobListingId ?? `listing-${counter}`,
    matchScore: overrides.matchScore ?? 90,
    matchedSkills: overrides.matchedSkills ?? ['TypeScript', 'React'],
    missingSkills: overrides.missingSkills ?? [],
    matchReasons: overrides.matchReasons ?? ['Strong frontend experience'],
    keyStrengths: overrides.keyStrengths ?? ['Mentors teammates'],
    potentialConcerns: overrides.potentialConcerns ?? [],
    experienceMatch: overrides.experienceMatch ?? 85,
    customizationRecommendations: overrides.customizationRecommendations ?? ['Highlight mentorship'],
    resumeIntakeData: overrides.resumeIntakeData ?? {
      jobId: `job-${counter}`,
      jobTitle: `Engineer ${counter}`,
      company: `Company ${counter}`,
      targetSummary: 'Impact-driven engineer',
      skillsPriority: ['TypeScript', 'Leadership'],
      experienceHighlights: [
        {
          company: 'PrevCo',
          title: 'Senior Engineer',
          pointsToEmphasize: ['Led migration to React']
        }
      ],
      projectsToInclude: [
        {
          name: 'Project Aurora',
          whyRelevant: 'Matches stack',
          pointsToHighlight: ['Cut render time by 30%']
        }
      ],
      achievementAngles: ['Scales developer tooling'],
      atsKeywords: ['TypeScript', 'React']
    },
    analyzedAt: overrides.analyzedAt ?? analyzedDate,
    createdAt: overrides.createdAt ?? analyzedDate,
    submittedBy: overrides.submittedBy ?? 'user-123',
    queueItemId: overrides.queueItemId ?? `queue-${counter}`,
    id: overrides.id
  }
}
