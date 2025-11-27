import { useState, useEffect } from "react"
import { configClient } from "@/api/config-client"
import {
  DEFAULT_JOB_FILTERS,
  DEFAULT_JOB_MATCH,
  DEFAULT_TECH_RANKS,
  DEFAULT_SCHEDULER_SETTINGS,
  DEFAULT_COMPANY_SCORING,
  DEFAULT_WORKER_SETTINGS,
  DEFAULT_AI_SETTINGS,
} from "@shared/types"
import type {
  StopList,
  QueueSettings,
  AISettings,
  JobMatchConfig,
  JobFiltersConfig,
  TechnologyRanksConfig,
  SchedulerSettings,
  TechnologyRank,
  CompanyScoringConfig,
  WorkerSettings,
} from "@shared/types"
import { deepClone, stableStringify, createSaveHandler, createResetHandler } from "../utils/config-helpers"

export type TabType = "stop-list" | "queue" | "ai" | "job-match" | "filters" | "tech" | "scheduler" | "scoring" | "worker"

export function useConfigState() {
  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>("stop-list")

  // Stop List state
  const [stopList, setStopList] = useState<StopList | null>(null)
  const [originalStopList, setOriginalStopList] = useState<StopList | null>(null)
  const [newCompany, setNewCompany] = useState("")
  const [newKeyword, setNewKeyword] = useState("")
  const [newDomain, setNewDomain] = useState("")

  // Queue Settings state
  const [queueSettings, setQueueSettings] = useState<QueueSettings | null>(null)
  const [originalQueueSettings, setOriginalQueueSettings] = useState<QueueSettings | null>(null)

  // AI Settings state
  const [aiSettings, setAISettings] = useState<AISettings | null>(null)
  const [originalAISettings, setOriginalAISettings] = useState<AISettings | null>(null)

  // Job Match state
  const [jobMatch, setJobMatch] = useState<JobMatchConfig | null>(null)
  const [originalJobMatch, setOriginalJobMatch] = useState<JobMatchConfig | null>(null)

  // Job Filters
  const [jobFilters, setJobFilters] = useState<JobFiltersConfig | null>(null)
  const [originalJobFilters, setOriginalJobFilters] = useState<JobFiltersConfig | null>(null)

  // Technology Ranks
  const [techRanks, setTechRanks] = useState<TechnologyRanksConfig | null>(null)
  const [originalTechRanks, setOriginalTechRanks] = useState<TechnologyRanksConfig | null>(null)
  const [newTechName, setNewTechName] = useState("")
  const [newTechRank, setNewTechRank] = useState<TechnologyRank["rank"]>("required")
  const [newTechPoints, setNewTechPoints] = useState(0)

  // Scheduler Settings
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings | null>(null)
  const [originalSchedulerSettings, setOriginalSchedulerSettings] = useState<SchedulerSettings | null>(null)

  // Company Scoring
  const [companyScoring, setCompanyScoring] = useState<CompanyScoringConfig | null>(null)
  const [originalCompanyScoring, setOriginalCompanyScoring] = useState<CompanyScoringConfig | null>(null)

  // Worker Settings
  const [workerSettings, setWorkerSettings] = useState<WorkerSettings | null>(null)
  const [originalWorkerSettings, setOriginalWorkerSettings] = useState<WorkerSettings | null>(null)

  // Load all settings on mount
  useEffect(() => {
    loadAllSettings()
  }, [])

  const loadAllSettings = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [stopListData, queueData, aiData, jobMatchData, filtersData, techData, schedulerData, scoringData, workerData] = await Promise.all([
        configClient.getStopList(),
        configClient.getQueueSettings(),
        configClient.getAISettings(),
        configClient.getJobMatch(),
        configClient.getJobFilters(),
        configClient.getTechnologyRanks(),
        configClient.getSchedulerSettings(),
        configClient.getCompanyScoring(),
        configClient.getWorkerSettings(),
      ])

      setStopList(stopListData)
      setOriginalStopList(stopListData)
      setQueueSettings(queueData)
      setOriginalQueueSettings(queueData)
      setAISettings(aiData)
      setOriginalAISettings(aiData)

      const jobMatchPayload = deepClone(jobMatchData ?? DEFAULT_JOB_MATCH)
      setJobMatch(jobMatchPayload)
      setOriginalJobMatch(deepClone(jobMatchPayload))

      const filtersPayload = deepClone(filtersData ?? DEFAULT_JOB_FILTERS)
      setJobFilters(filtersPayload)
      setOriginalJobFilters(deepClone(filtersPayload))

      const techPayload = deepClone(techData ?? DEFAULT_TECH_RANKS)
      setTechRanks(techPayload)
      setOriginalTechRanks(deepClone(techPayload))

      const schedulerPayload = deepClone(schedulerData ?? DEFAULT_SCHEDULER_SETTINGS)
      setSchedulerSettings(schedulerPayload)
      setOriginalSchedulerSettings(deepClone(schedulerPayload))

      const scoringPayload = deepClone(scoringData ?? DEFAULT_COMPANY_SCORING)
      setCompanyScoring(scoringPayload)
      setOriginalCompanyScoring(deepClone(scoringPayload))

      const workerPayload = deepClone(workerData ?? DEFAULT_WORKER_SETTINGS)
      setWorkerSettings(workerPayload)
      setOriginalWorkerSettings(deepClone(workerPayload))
    } catch (err) {
      setError("Failed to load configuration settings")
      console.error("Error loading settings:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // State updaters
  const updateJobFiltersState = (updater: (current: JobFiltersConfig) => JobFiltersConfig) => {
    setJobFilters((prev) => updater(prev ?? deepClone(DEFAULT_JOB_FILTERS)))
  }

  const updateTechRanksState = (updater: (current: TechnologyRanksConfig) => TechnologyRanksConfig) => {
    setTechRanks((prev) =>
      updater(
        prev ?? {
          technologies: {},
          strikes: { ...DEFAULT_TECH_RANKS.strikes },
        }
      )
    )
  }

  const updateSchedulerState = (updates: Partial<SchedulerSettings>) => {
    setSchedulerSettings((prev) => ({
      ...(prev ?? DEFAULT_SCHEDULER_SETTINGS),
      ...updates,
    }))
  }

  const updateCompanyScoringState = (updater: (current: CompanyScoringConfig) => CompanyScoringConfig) => {
    setCompanyScoring((prev) => updater(prev ?? deepClone(DEFAULT_COMPANY_SCORING)))
  }

  const updateWorkerSettingsState = (updater: (current: WorkerSettings) => WorkerSettings) => {
    setWorkerSettings((prev) => updater(prev ?? deepClone(DEFAULT_WORKER_SETTINGS)))
  }

  // Save handlers
  const handleSaveStopList = () =>
    createSaveHandler({
      data: stopList,
      updateFn: configClient.updateStopList,
      setOriginal: setOriginalStopList,
      configName: "stop list",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveQueueSettings = () =>
    createSaveHandler({
      data: queueSettings,
      updateFn: configClient.updateQueueSettings,
      setOriginal: setOriginalQueueSettings,
      configName: "queue settings",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveAISettings = () =>
    createSaveHandler({
      data: aiSettings,
      updateFn: configClient.updateAISettings,
      setOriginal: setOriginalAISettings,
      configName: "AI settings",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveJobMatch = () =>
    createSaveHandler({
      data: jobMatch,
      updateFn: configClient.updateJobMatch,
      setOriginal: setOriginalJobMatch,
      configName: "job match settings",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveJobFilters = () =>
    createSaveHandler({
      data: jobFilters,
      updateFn: configClient.updateJobFilters,
      setOriginal: setOriginalJobFilters,
      configName: "job filters",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveTechRanks = () =>
    createSaveHandler({
      data: techRanks,
      updateFn: configClient.updateTechnologyRanks,
      setOriginal: setOriginalTechRanks,
      configName: "technology ranks",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveScheduler = () =>
    createSaveHandler({
      data: schedulerSettings,
      updateFn: configClient.updateSchedulerSettings,
      setOriginal: setOriginalSchedulerSettings,
      configName: "scheduler settings",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveCompanyScoring = () =>
    createSaveHandler({
      data: companyScoring,
      updateFn: configClient.updateCompanyScoring,
      setOriginal: setOriginalCompanyScoring,
      configName: "company scoring",
      setIsSaving,
      setError,
      setSuccess,
    })

  const handleSaveWorkerSettings = () =>
    createSaveHandler({
      data: workerSettings,
      updateFn: configClient.updateWorkerSettings,
      setOriginal: setOriginalWorkerSettings,
      configName: "worker settings",
      setIsSaving,
      setError,
      setSuccess,
    })

  // Stop list handlers
  const handleAddCompany = () => {
    if (!newCompany.trim() || !stopList) return
    setStopList({
      ...stopList,
      excludedCompanies: [...(stopList.excludedCompanies || []), newCompany.trim()],
    })
    setNewCompany("")
  }

  const handleRemoveCompany = (company: string) => {
    if (!stopList) return
    setStopList({
      ...stopList,
      excludedCompanies: (stopList.excludedCompanies || []).filter((c) => c !== company),
    })
  }

  const handleAddKeyword = () => {
    if (!newKeyword.trim() || !stopList) return
    setStopList({
      ...stopList,
      excludedKeywords: [...(stopList.excludedKeywords || []), newKeyword.trim()],
    })
    setNewKeyword("")
  }

  const handleRemoveKeyword = (keyword: string) => {
    if (!stopList) return
    setStopList({
      ...stopList,
      excludedKeywords: (stopList.excludedKeywords || []).filter((k) => k !== keyword),
    })
  }

  const handleAddDomain = () => {
    if (!newDomain.trim() || !stopList) return
    setStopList({
      ...stopList,
      excludedDomains: [...(stopList.excludedDomains || []), newDomain.trim()],
    })
    setNewDomain("")
  }

  const handleRemoveDomain = (domain: string) => {
    if (!stopList) return
    setStopList({
      ...stopList,
      excludedDomains: (stopList.excludedDomains || []).filter((d) => d !== domain),
    })
  }

  // Reset handlers
  const handleResetStopList = () =>
    createResetHandler(
      setStopList,
      originalStopList,
      { excludedCompanies: [], excludedKeywords: [], excludedDomains: [] },
      setError,
      setSuccess
    )

  const handleResetQueueSettings = () =>
    createResetHandler(
      setQueueSettings,
      originalQueueSettings,
      { processingTimeoutSeconds: 1800 },
      setError,
      setSuccess
    )

  const handleResetAISettings = () =>
    createResetHandler(
      setAISettings,
      originalAISettings,
      DEFAULT_AI_SETTINGS,
      setError,
      setSuccess
    )

  const handleResetJobMatch = () =>
    createResetHandler(
      setJobMatch,
      originalJobMatch,
      DEFAULT_JOB_MATCH,
      setError,
      setSuccess
    )

  const handleResetJobFilters = () =>
    createResetHandler(setJobFilters, originalJobFilters, DEFAULT_JOB_FILTERS, setError, setSuccess)

  const handleResetTechRanks = () =>
    createResetHandler(
      setTechRanks,
      originalTechRanks,
      { technologies: {}, strikes: { ...DEFAULT_TECH_RANKS.strikes } },
      setError,
      setSuccess
    )

  const handleResetSchedulerSettings = () =>
    createResetHandler(
      setSchedulerSettings,
      originalSchedulerSettings,
      DEFAULT_SCHEDULER_SETTINGS,
      setError,
      setSuccess
    )

  const handleResetCompanyScoring = () =>
    createResetHandler(
      setCompanyScoring,
      originalCompanyScoring,
      DEFAULT_COMPANY_SCORING,
      setError,
      setSuccess
    )

  const handleResetWorkerSettings = () =>
    createResetHandler(
      setWorkerSettings,
      originalWorkerSettings,
      DEFAULT_WORKER_SETTINGS,
      setError,
      setSuccess
    )

  // Technology handlers
  const handleAddTechnology = () => {
    const name = newTechName.trim()
    if (!name) return

    updateTechRanksState((current) => ({
      ...current,
      technologies: {
        ...current.technologies,
        [name]: {
          ...(current.technologies[name] ?? {}),
          rank: newTechRank,
          points: newTechPoints,
        },
      },
    }))

    setNewTechName("")
    setNewTechPoints(newTechRank === "strike" ? 2 : 0)
  }

  // Change detection
  const hasStopListChanges = stableStringify(stopList) !== stableStringify(originalStopList)
  const hasQueueChanges = stableStringify(queueSettings) !== stableStringify(originalQueueSettings)
  const hasAIChanges = stableStringify(aiSettings) !== stableStringify(originalAISettings)
  const hasJobMatchChanges = stableStringify(jobMatch) !== stableStringify(originalJobMatch)
  const hasJobFilterChanges = stableStringify(jobFilters) !== stableStringify(originalJobFilters)
  const hasTechRankChanges = stableStringify(techRanks) !== stableStringify(originalTechRanks)
  const hasSchedulerChanges = stableStringify(schedulerSettings) !== stableStringify(originalSchedulerSettings)
  const hasCompanyScoringChanges = stableStringify(companyScoring) !== stableStringify(originalCompanyScoring)
  const hasWorkerSettingsChanges = stableStringify(workerSettings) !== stableStringify(originalWorkerSettings)

  // Current values with defaults
  const currentJobFilters = jobFilters ?? DEFAULT_JOB_FILTERS
  const currentTechRanks = techRanks ?? {
    technologies: {},
    strikes: { ...DEFAULT_TECH_RANKS.strikes },
  }
  const currentScheduler = schedulerSettings ?? DEFAULT_SCHEDULER_SETTINGS
  const currentScoring = companyScoring ?? DEFAULT_COMPANY_SCORING
  const currentWorker = workerSettings ?? DEFAULT_WORKER_SETTINGS

  return {
    // UI state
    isLoading,
    isSaving,
    error,
    success,
    activeTab,
    setActiveTab,

    // Stop List
    stopList,
    setStopList,
    newCompany,
    setNewCompany,
    newKeyword,
    setNewKeyword,
    newDomain,
    setNewDomain,
    hasStopListChanges,
    handleAddCompany,
    handleRemoveCompany,
    handleAddKeyword,
    handleRemoveKeyword,
    handleAddDomain,
    handleRemoveDomain,
    handleSaveStopList,
    handleResetStopList,

    // Queue Settings
    queueSettings,
    setQueueSettings,
    hasQueueChanges,
    handleSaveQueueSettings,
    handleResetQueueSettings,

    // AI Settings
    aiSettings,
    setAISettings,
    hasAIChanges,
    handleSaveAISettings,
    handleResetAISettings,

    // Job Match
    jobMatch,
    setJobMatch,
    hasJobMatchChanges,
    handleSaveJobMatch,
    handleResetJobMatch,

    // Job Filters
    jobFilters,
    currentJobFilters,
    hasJobFilterChanges,
    updateJobFiltersState,
    handleSaveJobFilters,
    handleResetJobFilters,

    // Technology Ranks
    techRanks,
    currentTechRanks,
    newTechName,
    setNewTechName,
    newTechRank,
    setNewTechRank,
    newTechPoints,
    setNewTechPoints,
    hasTechRankChanges,
    updateTechRanksState,
    handleAddTechnology,
    handleSaveTechRanks,
    handleResetTechRanks,

    // Scheduler
    schedulerSettings,
    currentScheduler,
    hasSchedulerChanges,
    updateSchedulerState,
    handleSaveScheduler,
    handleResetSchedulerSettings,

    // Company Scoring
    companyScoring,
    currentScoring,
    hasCompanyScoringChanges,
    updateCompanyScoringState,
    handleSaveCompanyScoring,
    handleResetCompanyScoring,

    // Worker Settings
    workerSettings,
    currentWorker,
    hasWorkerSettingsChanges,
    updateWorkerSettingsState,
    handleSaveWorkerSettings,
    handleResetWorkerSettings,
  }
}

export type ConfigState = ReturnType<typeof useConfigState>
