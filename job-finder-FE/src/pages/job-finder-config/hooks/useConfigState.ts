import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { configClient } from "@/api/config-client"
import {
  DEFAULT_TITLE_FILTER,
  DEFAULT_QUEUE_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_SCHEDULER_SETTINGS,
  DEFAULT_PERSONAL_INFO,
} from "@shared/types"
import type {
  TitleFilterConfig,
  MatchPolicy,
  QueueSettings,
  AISettings,
  SchedulerSettings,
} from "@shared/types"
import type { PersonalInfo } from "@shared/types"
import { deepClone, stableStringify } from "../utils/config-helpers"

export function useConfigState() {
  const { user } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [titleFilter, setTitleFilter] = useState<TitleFilterConfig>(DEFAULT_TITLE_FILTER)
  const [originalTitleFilter, setOriginalTitleFilter] = useState<TitleFilterConfig>(DEFAULT_TITLE_FILTER)

  // MatchPolicy is required - will throw if not found in DB
  const [matchPolicy, setMatchPolicy] = useState<MatchPolicy | null>(null)
  const [originalMatchPolicy, setOriginalMatchPolicy] = useState<MatchPolicy | null>(null)

  const [queueSettings, setQueueSettingsState] = useState<QueueSettings>(DEFAULT_QUEUE_SETTINGS)
  const [originalQueue, setOriginalQueue] = useState<QueueSettings>(DEFAULT_QUEUE_SETTINGS)

  const [aiSettings, setAISettings] = useState<AISettings>(DEFAULT_AI_SETTINGS)
  const [originalAI, setOriginalAI] = useState<AISettings>(DEFAULT_AI_SETTINGS)

  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings>(DEFAULT_SCHEDULER_SETTINGS)
  const [originalScheduler, setOriginalScheduler] = useState<SchedulerSettings>(DEFAULT_SCHEDULER_SETTINGS)

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    ...DEFAULT_PERSONAL_INFO,
    email: user?.email ?? DEFAULT_PERSONAL_INFO.email,
  })
  const [originalPersonalInfo, setOriginalPersonalInfo] = useState<PersonalInfo>({
    ...DEFAULT_PERSONAL_INFO,
    email: user?.email ?? DEFAULT_PERSONAL_INFO.email,
  })

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const entries = await configClient.listEntries()
      const map = entries.reduce<Record<string, unknown>>((acc, cur) => {
        acc[cur.id] = cur.payload
        return acc
      }, {})

      const titleFilterData = deepClone((map["title-filter"] as TitleFilterConfig) ?? DEFAULT_TITLE_FILTER)
      setTitleFilter(titleFilterData)
      setOriginalTitleFilter(deepClone(titleFilterData))

      // MatchPolicy may not exist yet - set to null if not found (UI will show setup prompt)
      const matchPolicyData = map["match-policy"] as MatchPolicy | undefined
      if (matchPolicyData) {
        setMatchPolicy(deepClone(matchPolicyData))
        setOriginalMatchPolicy(deepClone(matchPolicyData))
      } else {
        // Keep as null - ScoringConfigTab will show setup instructions
        setMatchPolicy(null)
        setOriginalMatchPolicy(null)
      }

      const queue = deepClone((map["queue-settings"] as QueueSettings) ?? DEFAULT_QUEUE_SETTINGS)
      setQueueSettingsState(queue)
      setOriginalQueue(deepClone(queue))

      const ai = deepClone((map["ai-settings"] as AISettings) ?? DEFAULT_AI_SETTINGS)
      setAISettings(ai)
      setOriginalAI(deepClone(ai))

      const sched = deepClone((map["scheduler-settings"] as SchedulerSettings) ?? DEFAULT_SCHEDULER_SETTINGS)
      setSchedulerSettings(sched)
      setOriginalScheduler(deepClone(sched))

      const personalFallback = { ...DEFAULT_PERSONAL_INFO, email: user?.email ?? DEFAULT_PERSONAL_INFO.email }
      const personal = deepClone((map["personal-info"] as PersonalInfo) ?? personalFallback)
      setPersonalInfo(personal)
      setOriginalPersonalInfo(deepClone(personal))
    } catch (err) {
      console.error(err)
      setError("Failed to load configuration settings")
    } finally {
      setIsLoading(false)
    }
  }, [user?.email])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleSaveTitleFilter = async (configOverride?: TitleFilterConfig) => {
    setIsSaving(true)
    setError(null)
    const payload = deepClone(configOverride ?? titleFilter)
    try {
      await configClient.updateTitleFilter(payload)
      setTitleFilter(payload)
      setOriginalTitleFilter(deepClone(payload))
      setSuccess("Title filter saved")
    } catch (_err) {
      setError("Failed to save title filter")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveMatchPolicy = async (configOverride?: MatchPolicy) => {
    setIsSaving(true)
    setError(null)
    const payload = deepClone(configOverride ?? matchPolicy)
    if (!payload) {
      setError("No match policy to save")
      setIsSaving(false)
      return
    }
    try {
      await configClient.updateMatchPolicy(payload)
      setMatchPolicy(payload)
      setOriginalMatchPolicy(deepClone(payload))
      setSuccess("Match policy saved")
    } catch (_err) {
      setError("Failed to save match policy")
    } finally {
      setIsSaving(false)
    }
  }

  const setQueueSettings = (updates: Partial<QueueSettings>) => {
    setQueueSettingsState((prev) => ({ ...prev, ...updates }))
  }

  const handleSaveQueueSettings = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await configClient.updateQueueSettings(queueSettings)
      setOriginalQueue(deepClone(queueSettings))
      setSuccess("Queue settings saved")
    } catch (_err) {
      setError("Failed to save queue settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAISettings = async () => {
    setIsSaving(true)
    setError(null)
    try {
      // Preserve any existing per-task settings even if UI doesn't edit them yet
      const merged = {
        ...aiSettings,
        worker: {
          ...(aiSettings.worker ?? {}),
          tasks: aiSettings.worker?.tasks ?? originalAI.worker?.tasks,
        },
        documentGenerator: {
          ...(aiSettings.documentGenerator ?? {}),
          tasks: aiSettings.documentGenerator?.tasks ?? originalAI.documentGenerator?.tasks,
        },
      }

      await configClient.updateAISettings(merged)
      setOriginalAI(deepClone(merged))
      setSuccess("AI settings saved")
    } catch (_err) {
      setError("Failed to save AI settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveScheduler = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await configClient.updateSchedulerSettings(schedulerSettings)
      setOriginalScheduler(deepClone(schedulerSettings))
      setSuccess("Scheduler settings saved")
    } catch (_err) {
      setError("Failed to save scheduler settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSavePersonalInfo = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const saved = await configClient.updatePersonalInfo(personalInfo, user?.email ?? "")
      setPersonalInfo(saved)
      setOriginalPersonalInfo(deepClone(saved))
      setSuccess("Personal info saved")
    } catch (_err) {
      setError("Failed to save personal info")
    } finally {
      setIsSaving(false)
    }
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

  const resetTitleFilter = () => {
    const resetValue = deepClone(originalTitleFilter)
    setTitleFilter(resetValue)
    setSuccess(null)
    return resetValue
  }

  const resetMatchPolicy = (): MatchPolicy => {
    if (!originalMatchPolicy) {
      throw new Error("Cannot reset match-policy: original config not loaded")
    }
    const resetValue = deepClone(originalMatchPolicy)
    setMatchPolicy(resetValue)
    setSuccess(null)
    return resetValue
  }

  const resetQueue = () => {
    setQueueSettingsState(deepClone(originalQueue))
    setSuccess(null)
  }

  const resetAI = () => {
    setAISettings(deepClone(originalAI))
    setSuccess(null)
  }

  const resetScheduler = () => {
    setSchedulerSettings(deepClone(originalScheduler))
    setSuccess(null)
  }

  const resetPersonal = () => {
    const fallback = { ...DEFAULT_PERSONAL_INFO, email: user?.email ?? DEFAULT_PERSONAL_INFO.email }
    setPersonalInfo(deepClone(originalPersonalInfo ?? fallback))
    setSuccess(null)
  }

  return {
    isLoading,
    isSaving,
    error,
    success,
    titleFilter,
    setTitleFilter,
    hasTitleFilterChanges: stableStringify(titleFilter) !== stableStringify(originalTitleFilter),
    handleSaveTitleFilter,
    resetTitleFilter,
    matchPolicy,
    setMatchPolicy,
    hasMatchPolicyChanges: stableStringify(matchPolicy) !== stableStringify(originalMatchPolicy),
    handleSaveMatchPolicy,
    resetMatchPolicy,

    queueSettings,
    setQueueSettings,
    hasQueueChanges: stableStringify(queueSettings) !== stableStringify(originalQueue),
    handleSaveQueueSettings,
    resetQueue,

    aiSettings,
    setAISettings,
    hasAIChanges: stableStringify(aiSettings) !== stableStringify(originalAI),
    handleSaveAISettings,
    resetAI,

    schedulerSettings,
    setSchedulerSettings,
    hasSchedulerChanges: stableStringify(schedulerSettings) !== stableStringify(originalScheduler),
    updateSchedulerState,
    handleSaveScheduler,
    resetScheduler,

    personalInfo,
    setPersonalInfo,
    hasPersonalInfoChanges: stableStringify(personalInfo) !== stableStringify(originalPersonalInfo),
    updatePersonalInfoState,
    handleSavePersonalInfo,
    resetPersonal,
  }
}

export type ConfigState = ReturnType<typeof useConfigState>
