import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { configClient } from "@/api/config-client"
import {
  DEFAULT_JOB_FILTERS,
  DEFAULT_JOB_MATCH,
  DEFAULT_TECH_RANKS,
  DEFAULT_SCHEDULER_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_PERSONAL_INFO,
  DEFAULT_STOP_LIST,
  DEFAULT_QUEUE_SETTINGS,
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
} from "@shared/types"
import type { PersonalInfo } from "@shared/types"
import { deepClone, stableStringify, createSaveHandler, createResetHandler } from "../utils/config-helpers"

export function useConfigState() {
  const { user } = useAuth()
  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

  // Personal Info
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null)
  const [originalPersonalInfo, setOriginalPersonalInfo] = useState<PersonalInfo | null>(null)

  const loadAllSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const entries = await configClient.listEntries()
      const configMap = entries.reduce<Record<string, unknown>>((acc, entry) => {
        acc[entry.id] = entry.payload
        return acc
      }, {})

      const getConfig = <T>(id: string, fallback: T): T => {
        const value = configMap[id]
        return deepClone((value as T | undefined) ?? fallback)
      }

      const stopListPayload = getConfig<StopList>("stop-list", DEFAULT_STOP_LIST)
      setStopList(stopListPayload)
      setOriginalStopList(deepClone(stopListPayload))

      const queuePayload = getConfig<QueueSettings>("queue-settings", DEFAULT_QUEUE_SETTINGS)
      setQueueSettings(queuePayload)
      setOriginalQueueSettings(deepClone(queuePayload))

      const aiPayload = getConfig<AISettings>("ai-settings", DEFAULT_AI_SETTINGS)
      setAISettings(aiPayload)
      setOriginalAISettings(deepClone(aiPayload))

      const jobMatchPayload = getConfig<JobMatchConfig>("job-match", DEFAULT_JOB_MATCH)
      setJobMatch(jobMatchPayload)
      setOriginalJobMatch(deepClone(jobMatchPayload))

      const filtersPayload = getConfig<JobFiltersConfig>("job-filters", DEFAULT_JOB_FILTERS)
      setJobFilters(filtersPayload)
      setOriginalJobFilters(deepClone(filtersPayload))

      const techPayload = getConfig<TechnologyRanksConfig>("technology-ranks", DEFAULT_TECH_RANKS)
      setTechRanks(techPayload)
      setOriginalTechRanks(deepClone(techPayload))

      const schedulerPayload = getConfig<SchedulerSettings>("scheduler-settings", DEFAULT_SCHEDULER_SETTINGS)
      setSchedulerSettings(schedulerPayload)
      setOriginalSchedulerSettings(deepClone(schedulerPayload))

      const personalFallback = { ...DEFAULT_PERSONAL_INFO, email: user?.email ?? DEFAULT_PERSONAL_INFO.email }
      const personalPayload = getConfig<PersonalInfo>("personal-info", personalFallback)
      setPersonalInfo(personalPayload)
      setOriginalPersonalInfo(deepClone(personalPayload))
    } catch (err) {
      setError("Failed to load configuration settings")
      console.error("Error loading settings:", err)
    } finally {
      setIsLoading(false)
    }
  }, [user?.email])

  // Load all settings on mount
  useEffect(() => {
    loadAllSettings()
  }, [loadAllSettings])

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

  const updatePersonalInfoState = (updates: Partial<PersonalInfo>) => {
    setPersonalInfo((prev) => ({
      ...(prev ?? { ...DEFAULT_PERSONAL_INFO, email: user?.email ?? DEFAULT_PERSONAL_INFO.email }),
      ...updates,
    }))
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

  const handleSavePersonalInfo = () =>
    createSaveHandler({
      data: personalInfo,
      // personal info requires user email for creation
      updateFn: async (payload) => {
        await configClient.updatePersonalInfo(payload ?? {}, user?.email ?? "")
      },
      setOriginal: setOriginalPersonalInfo,
      configName: "personal info",
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
      DEFAULT_QUEUE_SETTINGS,
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

  const handleResetPersonalInfo = () =>
    createResetHandler(
      setPersonalInfo,
      originalPersonalInfo,
      { ...DEFAULT_PERSONAL_INFO, email: user?.email ?? DEFAULT_PERSONAL_INFO.email },
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
  const hasPersonalInfoChanges = stableStringify(personalInfo) !== stableStringify(originalPersonalInfo)

  // Current values with defaults
  const currentJobFilters = jobFilters ?? DEFAULT_JOB_FILTERS
  const currentTechRanks = techRanks ?? {
    technologies: {},
    strikes: { ...DEFAULT_TECH_RANKS.strikes },
  }
  const currentScheduler = schedulerSettings ?? DEFAULT_SCHEDULER_SETTINGS
  const currentPersonalInfo =
    personalInfo ?? { ...DEFAULT_PERSONAL_INFO, email: user?.email ?? DEFAULT_PERSONAL_INFO.email }

  return {
    // UI state
    isLoading,
    isSaving,
    error,
    success,
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

    // Personal Info
    personalInfo,
    currentPersonalInfo,
    hasPersonalInfoChanges,
    updatePersonalInfoState,
    handleSavePersonalInfo,
    handleResetPersonalInfo,
  }
}

export type ConfigState = ReturnType<typeof useConfigState>
