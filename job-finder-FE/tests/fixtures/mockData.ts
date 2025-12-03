import type {
  AISettings,
  Company,
  JobListing,
  JobListingRecord,
  JobMatchWithListing,
  MatchPolicy,
  PreFilterPolicy,
  QueueItem,
  QueueSource,
  QueueStatus,
  QueueStats,
  WorkerSettings,
} from "@shared/types"

const now = () => new Date()

export const mockJobListing: JobListing = {
  title: "Software Engineer",
  company: "Example Co",
  companyWebsite: "https://example.com",
  location: "Remote",
  description: "Job description",
  url: "https://example.com/job",
  postedDate: null,
  salary: null,
}

const mockListingRecord: JobListingRecord = {
  id: "listing-1",
  url: mockJobListing.url,
  sourceId: "source-1",
  companyId: "company-1",
  title: mockJobListing.title,
  companyName: mockJobListing.company,
  location: mockJobListing.location,
  salaryRange: null,
  description: mockJobListing.description,
  postedDate: null,
  status: "pending",
  filterResult: null,
  analysisResult: null,
  matchScore: null,
  createdAt: now(),
  updatedAt: now(),
}

export const mockJobMatch: JobMatchWithListing = {
  id: "match-1",
  jobListingId: mockListingRecord.id,
  matchScore: 92,
  matchedSkills: ["typescript", "react"],
  missingSkills: [],
  matchReasons: ["Stack alignment"],
  keyStrengths: ["Backend experience"],
  potentialConcerns: [],
  experienceMatch: 88,
  applicationPriority: "High",
  customizationRecommendations: [],
  analyzedAt: now(),
  createdAt: now(),
  submittedBy: "tester@example.com",
  queueItemId: "queue-1",
  resumeIntakeData: undefined,
  listing: mockListingRecord,
  company: undefined,
}

export const mockHighScoreJobMatch: JobMatchWithListing = {
  ...mockJobMatch,
  id: "match-high",
  matchScore: 98,
  listing: { ...mockListingRecord, id: "listing-high" },
}

export const mockLowScoreJobMatch: JobMatchWithListing = {
  ...mockJobMatch,
  id: "match-low",
  matchScore: 40,
  listing: { ...mockListingRecord, id: "listing-low" },
}

export const mockQueueItem: QueueItem = {
  id: "queue-1",
  type: "job",
  status: "pending" as QueueStatus,
  url: mockJobListing.url,
  created_at: now(),
  updated_at: now(),
  company_name: mockJobListing.company,
  source: "user_submission" as QueueSource,
}

export const mockProcessingQueueItem: QueueItem = {
  ...mockQueueItem,
  id: "queue-2",
  status: "processing",
}

export const mockCompletedQueueItem: QueueItem = {
  ...mockQueueItem,
  id: "queue-3",
  status: "success",
  completed_at: now(),
}

export const mockFailedQueueItem: QueueItem = {
  ...mockQueueItem,
  id: "queue-4",
  status: "failed",
  error_details: "Failed during scraping",
}

export const mockQueueStats: QueueStats = {
  pending: 10,
  processing: 2,
  success: 5,
  failed: 1,
  skipped: 0,
  filtered: 0,
  total: 18,
}

export const mockWorkerSettings: WorkerSettings = {
  scraping: {
    requestTimeoutSeconds: 30,
    maxHtmlSampleLength: 20000,
  },
  textLimits: {
    minCompanyPageLength: 200,
    minSparseCompanyInfoLength: 100,
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

export const mockAISettings: AISettings = {
  worker: { selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" } },
  documentGenerator: { selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" } },
  options: [],
}

export const baseMatchPolicy: MatchPolicy = {
  minScore: 60,
  weights: { skillMatch: 40, experienceMatch: 30, seniorityMatch: 30 },
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
    allowOnsite: false,
    userTimezone: -8,
    maxTimezoneDiffHours: 4,
    perHourScore: -3,
    hybridSameCityScore: 10,
  },
  technology: {
    required: ["typescript"],
    preferred: ["react"],
    disliked: ["java"],
    rejected: ["php"],
    requiredScore: 10,
    preferredScore: 5,
    dislikedScore: -5,
  },
  salary: { minimum: 100000, target: 170000, belowTargetScore: -10 },
  experience: { userYears: 10, maxRequired: 12, overqualifiedScore: -5 },
  freshness: {
    freshDays: 2,
    freshScore: 10,
    staleDays: 3,
    staleScore: -10,
    veryStaleDays: 12,
    veryStaleScore: -20,
    repostScore: -5,
  },
  roleFit: {
    preferred: ["backend"],
    acceptable: ["fullstack"],
    penalized: ["frontend"],
    rejected: ["management"],
    preferredScore: 5,
    penalizedScore: -5,
  },
  company: {
    preferredCityScore: 20,
    preferredCity: "portland",
    remoteFirstScore: 15,
    aiMlFocusScore: 10,
    largeCompanyScore: 10,
    smallCompanyScore: 0,
    largeCompanyThreshold: 10000,
    smallCompanyThreshold: 100,
    startupScore: 0,
  },
}

export const basePrefilterPolicy: PreFilterPolicy = {
  title: {
    requiredKeywords: ["software", "engineer"],
    excludedKeywords: ["intern"],
  },
  freshness: { maxAgeDays: 30 },
  workArrangement: {
    allowRemote: true,
    allowHybrid: true,
    allowOnsite: true,
    willRelocate: true,
    userLocation: "Portland, OR",
  },
  employmentType: { allowFullTime: true, allowPartTime: true, allowContract: true },
  salary: { minimum: 80000 },
  technology: { rejected: ["php"] },
}

export const mockCompany: Company = {
  id: "company-1",
  name: mockJobListing.company,
  website: "https://example.com",
  createdAt: now(),
  updatedAt: now(),
}

export const mockErrorResponses = {
  unauthorized: { statusCode: 401, error: "Unauthorized", message: "Authentication required" },
  forbidden: { statusCode: 403, error: "Forbidden", message: "Missing permissions" },
  badRequest: { statusCode: 400, error: "Bad Request", message: "Invalid request payload" },
  notFound: { statusCode: 404, error: "Not Found", message: "Resource not found" },
  rateLimited: { statusCode: 429, error: "Too Many Requests", message: "Rate limit exceeded" },
  serverError: { statusCode: 500, error: "Server Error", message: "Unexpected server failure" },
  networkError: { statusCode: 503, error: "Network Error", message: "Network request failed" },
  validationError: { statusCode: 422, error: "Validation Error", message: "Validation failed" },
}

export const mockGenerateResumeRequest = {
  type: "resume" as const,
  jobMatchId: mockJobMatch.id ?? "match-1",
  jobTitle: mockJobListing.title,
  companyName: mockJobListing.company,
  jobUrl: mockJobListing.url,
  preferences: {
    provider: "openai",
    tone: "professional",
    includeProjects: true,
  },
  customization: {
    targetSummary: "Build resilient platforms",
    skillsPriority: ["typescript", "distributed systems"],
    experienceHighlights: [
      { company: "Example Co", title: "Engineer", pointsToEmphasize: ["Scaled APIs"] },
    ],
    projects: [],
  },
}

export const mockGenerateCoverLetterRequest = {
  type: "cover_letter" as const,
  jobMatchId: mockJobMatch.id ?? "match-1",
  jobTitle: mockJobListing.title,
  companyName: mockJobListing.company,
  preferences: {
    provider: "openai",
    tone: "confident",
  },
}
