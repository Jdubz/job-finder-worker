import type { CreateJobMatchInput } from '../job-match.repository'

export const buildJobMatchInput = (
  overrides: Partial<CreateJobMatchInput> = {}
): CreateJobMatchInput => {
  const counter = overrides.queueItemId?.split('-').pop() ?? Math.floor(Math.random() * 1000).toString()
  const baseCompany = overrides.companyName ?? `Company ${counter}`
  const analyzedDate = new Date(2025, 0, (Number(counter) % 28) + 1)

  return {
    url: overrides.url ?? `https://example.com/jobs/${counter}`,
    companyName: baseCompany,
    companyId: overrides.companyId ?? `company-${counter}`,
    jobTitle: overrides.jobTitle ?? `Engineer ${counter}`,
    location: overrides.location ?? 'Remote',
    salaryRange: overrides.salaryRange ?? '$150k',
    jobDescription: overrides.jobDescription ?? 'Build delightful products',
    companyInfo: overrides.companyInfo ?? 'Great culture',
    matchScore: overrides.matchScore ?? 90,
    matchedSkills: overrides.matchedSkills ?? ['TypeScript', 'React'],
    missingSkills: overrides.missingSkills ?? [],
    matchReasons: overrides.matchReasons ?? ['Strong frontend experience'],
    keyStrengths: overrides.keyStrengths ?? ['Mentors teammates'],
    potentialConcerns: overrides.potentialConcerns ?? [],
    experienceMatch: overrides.experienceMatch ?? 85,
    applicationPriority: overrides.applicationPriority ?? 'High',
    customizationRecommendations: overrides.customizationRecommendations ?? ['Highlight mentorship'],
    resumeIntakeData:
      overrides.resumeIntakeData ??
      {
        jobId: `job-${counter}`,
        jobTitle: `Engineer ${counter}`,
        company: baseCompany,
        targetSummary: 'Impact-driven engineer',
        skillsPriority: ['TypeScript', 'Leadership'],
        experienceHighlights: [
          {
            company: 'PrevCo',
            title: 'Senior Engineer',
            pointsToEmphasize: ['Led migration to React'],
          },
        ],
        projectsToInclude: [
          {
            name: 'Project Aurora',
            whyRelevant: 'Matches stack',
            pointsToHighlight: ['Cut render time by 30%'],
          },
        ],
        achievementAngles: ['Scales developer tooling'],
        atsKeywords: ['TypeScript', 'React'],
      },
    analyzedAt: overrides.analyzedAt ?? analyzedDate,
    createdAt: overrides.createdAt ?? analyzedDate,
    submittedBy: overrides.submittedBy ?? 'user-123',
    queueItemId: overrides.queueItemId ?? `queue-${counter}`,
    id: overrides.id,
  }
}
