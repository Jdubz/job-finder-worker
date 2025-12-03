import { useState, useEffect, useCallback } from "react"
import { configClient } from "@/api/config-client"
import type {
  TitleFilterConfig,
  MatchPolicy,
  QueueSettings,
  AISettings,
  PersonalInfo,
} from "@shared/types"
import { deepClone, stableStringify } from "../utils/config-helpers"

export function useConfigState() {

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [missingConfigs, setMissingConfigs] = useState<string[]>([])

  const [titleFilter, setTitleFilter] = useState<TitleFilterConfig | null>(null)
  const [originalTitleFilter, setOriginalTitleFilter] = useState<TitleFilterConfig | null>(null)

  const [matchPolicy, setMatchPolicy] = useState<MatchPolicy | null>(null)
  const [originalMatchPolicy, setOriginalMatchPolicy] = useState<MatchPolicy | null>(null)

  const [queueSettings, setQueueSettingsState] = useState<QueueSettings | null>(null)
  const [originalQueue, setOriginalQueue] = useState<QueueSettings | null>(null)

  const [aiSettings, setAISettings] = useState<AISettings | null>(null)
  const [originalAI, setOriginalAI] = useState<AISettings | null>(null)

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null)
  const [originalPersonalInfo, setOriginalPersonalInfo] = useState<PersonalInfo | null>(null)

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setMissingConfigs([])
    const missing: string[] = []

    try {
      const entries = await configClient.listEntries()
      const map = entries.reduce<Record<string, unknown>>((acc, cur) => {
        acc[cur.id] = cur.payload
        return acc
      }, {})

      // Title filter - required
      const titleFilterData = map["title-filter"] as TitleFilterConfig | undefined
      if (titleFilterData) {
        setTitleFilter(deepClone(titleFilterData))
        setOriginalTitleFilter(deepClone(titleFilterData))
      } else {
        missing.push("title-filter")
        setTitleFilter(null)
        setOriginalTitleFilter(null)
      }

      // Match policy - required
      const matchPolicyData = map["match-policy"] as MatchPolicy | undefined
      if (matchPolicyData) {
        setMatchPolicy(deepClone(matchPolicyData))
        setOriginalMatchPolicy(deepClone(matchPolicyData))
      } else {
        missing.push("match-policy")
        setMatchPolicy(null)
        setOriginalMatchPolicy(null)
      }

      // Queue settings - required
      const queueData = map["queue-settings"] as QueueSettings | undefined
      if (queueData) {
        setQueueSettingsState(deepClone(queueData))
        setOriginalQueue(deepClone(queueData))
      } else {
        missing.push("queue-settings")
        setQueueSettingsState(null)
        setOriginalQueue(null)
      }

      // AI settings - required
      const aiData = map["ai-settings"] as AISettings | undefined
      if (aiData) {
        setAISettings(deepClone(aiData))
        setOriginalAI(deepClone(aiData))
      } else {
        missing.push("ai-settings")
        setAISettings(null)
        setOriginalAI(null)
      }

      // Personal info - required
      const personalData = map["personal-info"] as PersonalInfo | undefined
      if (personalData) {
        setPersonalInfo(deepClone(personalData))
        setOriginalPersonalInfo(deepClone(personalData))
      } else {
        missing.push("personal-info")
        setPersonalInfo(null)
        setOriginalPersonalInfo(null)
      }

      if (missing.length > 0) {
        setMissingConfigs(missing)
        setError(`Missing required configuration(s): ${missing.join(", ")}. Please configure them in the database.`)
      }
    } catch (err) {
      console.error(err)
      setError("Failed to load configuration settings")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleSaveTitleFilter = async (configOverride?: TitleFilterConfig) => {
    const payload = configOverride ?? titleFilter
    if (!payload) {
      setError("No title filter to save")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await configClient.updateTitleFilter(deepClone(payload))
      setTitleFilter(deepClone(payload))
      setOriginalTitleFilter(deepClone(payload))
      setSuccess("Title filter saved")
    } catch (_err) {
      setError("Failed to save title filter")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveMatchPolicy = async (configOverride?: MatchPolicy) => {
    const payload = configOverride ?? matchPolicy
    if (!payload) {
      setError("No match policy to save")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await configClient.updateMatchPolicy(deepClone(payload))
      setMatchPolicy(deepClone(payload))
      setOriginalMatchPolicy(deepClone(payload))
      setSuccess("Match policy saved")
    } catch (_err) {
      setError("Failed to save match policy")
    } finally {
      setIsSaving(false)
    }
  }

  const setQueueSettings = (updates: Partial<QueueSettings>) => {
    setQueueSettingsState((prev) => {
      if (!prev) return null
      return { ...prev, ...updates }
    })
  }

  const handleSaveQueueSettings = async () => {
    if (!queueSettings) {
      setError("No queue settings to save")
      return
    }
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
    if (!aiSettings) {
      setError("No AI settings to save")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      // Preserve any existing per-task settings even if UI doesn't edit them yet
      const merged: AISettings = {
        ...aiSettings,
        worker: {
          ...(aiSettings.worker ?? {}),
          tasks: aiSettings.worker?.tasks ?? originalAI?.worker?.tasks,
        },
        documentGenerator: {
          ...(aiSettings.documentGenerator ?? {}),
          tasks: aiSettings.documentGenerator?.tasks ?? originalAI?.documentGenerator?.tasks,
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

  const handleSavePersonalInfo = async () => {
    if (!personalInfo) {
      setError("No personal info to save")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const saved = await configClient.updatePersonalInfo(personalInfo)
      setPersonalInfo(saved)
      setOriginalPersonalInfo(deepClone(saved))
      setSuccess("Personal info saved")
    } catch (_err) {
      setError("Failed to save personal info")
    } finally {
      setIsSaving(false)
    }
  }

  const updatePersonalInfoState = (updates: Partial<PersonalInfo>) => {
    setPersonalInfo((prev) => {
      if (!prev) return null
      return { ...prev, ...updates }
    })
  }

  const resetTitleFilter = () => {
    if (!originalTitleFilter) return null
    const resetValue = deepClone(originalTitleFilter)
    setTitleFilter(resetValue)
    setSuccess(null)
    return resetValue
  }

  const resetMatchPolicy = (): MatchPolicy | null => {
    if (!originalMatchPolicy) return null
    const resetValue = deepClone(originalMatchPolicy)
    setMatchPolicy(resetValue)
    setSuccess(null)
    return resetValue
  }

  const resetQueue = () => {
    if (!originalQueue) return
    setQueueSettingsState(deepClone(originalQueue))
    setSuccess(null)
  }

  const resetAI = () => {
    if (!originalAI) return
    setAISettings(deepClone(originalAI))
    setSuccess(null)
  }

  const resetPersonal = () => {
    if (!originalPersonalInfo) return
    setPersonalInfo(deepClone(originalPersonalInfo))
    setSuccess(null)
  }

  return {
    isLoading,
    isSaving,
    error,
    success,
    missingConfigs,
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

    personalInfo,
    setPersonalInfo,
    hasPersonalInfoChanges: stableStringify(personalInfo) !== stableStringify(originalPersonalInfo),
    updatePersonalInfoState,
    handleSavePersonalInfo,
    resetPersonal,
  }
}

export type ConfigState = ReturnType<typeof useConfigState>
