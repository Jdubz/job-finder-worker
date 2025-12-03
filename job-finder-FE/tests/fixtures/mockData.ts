import type {
  JobListing,
  JobMatch,
  QueueItem,
  QueueSource,
  QueueStatus,
  QueueItemType,
  Company,
  WorkerSettings,
  AISettings,
  MatchPolicy,
  PreFilterPolicy,
} from "@shared/types"

export const mockJobListing: JobListing = {
  id: "1",
  url: "https://example.com/job",
  title: "Software Engineer",
  company: "Example Co",
  location: "Remote",
  description: "Job description",
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const mockJobMatch: JobMatch = {
  id: "1",
  url: "https://example.com/job",
  company_name: "Example Co",
  company_id: null,
  job_title: "Software Engineer",
  location: "Remote",
  salary_range: null,
  job_description: "Job description",
  company_info: null,
  match_score: 90,
  matched_skills: [],
  missing_skills: [],
  match_reasons: [],
  key_strengths: [],
  potential_concerns: [],
  experience_match: null,
  application_priority: null,
  customization_recommendations: [],
  resume_intake_json: null,
  analyzed_at: new Date().toISOString(),
  submitted_by: null,
  queue_item_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const mockQueueItem: QueueItem = {
  id: "1",
  type: "job" as QueueItemType,
  status: "pending" as QueueStatus,
  url: "https://example.com/job",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const mockQueueSource: QueueSource = "automated_scan"

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
  worker: {
    selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" },
  },
  documentGenerator: {
    selected: { provider: "gemini", interface: "api", model: "gemini-2.0-flash" },
  },
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
  workArrangement: { allowRemote: true, allowHybrid: true, allowOnsite: true },
  employmentType: { allowFullTime: true, allowPartTime: true, allowContract: true },
  salary: { minimum: 80000 },
  technology: { rejected: ["php"] },
}

export const mockCompany: Company = {
  id: "1",
  name: "Example Co",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
