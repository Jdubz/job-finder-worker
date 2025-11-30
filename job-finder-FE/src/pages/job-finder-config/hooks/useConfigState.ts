import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { configClient } from "@/api/config-client"
import {
  DEFAULT_PREFILTER_POLICY,
  DEFAULT_MATCH_POLICY,
  DEFAULT_QUEUE_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_SCHEDULER_SETTINGS,
  DEFAULT_PERSONAL_INFO,
} from "@shared/types"
import type {
  PrefilterPolicy,
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

  const [prefilterPolicy, setPrefilterPolicy] = useState<PrefilterPolicy>(DEFAULT_PREFILTER_POLICY)
  const [originalPrefilter, setOriginalPrefilter] = useState<PrefilterPolicy>(DEFAULT_PREFILTER_POLICY)
  const [prefilterText, setPrefilterText] = useState(JSON.stringify(DEFAULT_PREFILTER_POLICY, null, 2))

  const [matchPolicy, setMatchPolicy] = useState<MatchPolicy>(DEFAULT_MATCH_POLICY)
  const [originalMatch, setOriginalMatch] = useState<MatchPolicy>(DEFAULT_MATCH_POLICY)
  const [matchText, setMatchText] = useState(JSON.stringify(DEFAULT_MATCH_POLICY, null, 2))

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

      const prefilter = deepClone((map["prefilter-policy"] as PrefilterPolicy) ?? DEFAULT_PREFILTER_POLICY)
      setPrefilterPolicy(prefilter)
      setOriginalPrefilter(deepClone(prefilter))
      setPrefilterText(JSON.stringify(prefilter, null, 2))

      const match = deepClone((map["match-policy"] as MatchPolicy) ?? DEFAULT_MATCH_POLICY)
      setMatchPolicy(match)
      setOriginalMatch(deepClone(match))
      setMatchText(JSON.stringify(match, null, 2))

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

  const parseJson = <T,>(text: string): { ok: boolean; value?: T; error?: string } => {
    try {
      return { ok: true, value: JSON.parse(text) as T }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" }
    }
  }

  const handleSavePrefilter = async () => {
    setIsSaving(true)
    setError(null)
    const parsed = parseJson<PrefilterPolicy>(prefilterText)
    if (!parsed.ok || !parsed.value) {
      setError(`Prefilter policy JSON error: ${parsed.error}`)
      setIsSaving(false)
      return
    }
    try {
      await configClient.updatePrefilterPolicy(parsed.value)
      setPrefilterPolicy(parsed.value)
      setOriginalPrefilter(deepClone(parsed.value))
      setSuccess("Prefilter policy saved")
    } catch (_err) {
      setError("Failed to save prefilter policy")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveMatch = async () => {
    setIsSaving(true)
    setError(null)
    const parsed = parseJson<MatchPolicy>(matchText)
    if (!parsed.ok || !parsed.value) {
      setError(`Match policy JSON error: ${parsed.error}`)
      setIsSaving(false)
      return
    }
    try {
      await configClient.updateMatchPolicy(parsed.value)
      setMatchPolicy(parsed.value)
      setOriginalMatch(deepClone(parsed.value))
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
      await configClient.updateAISettings(aiSettings)
      setOriginalAI(deepClone(aiSettings))
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

  const resetPrefilter = () => {
    setPrefilterPolicy(deepClone(originalPrefilter))
    setPrefilterText(JSON.stringify(originalPrefilter, null, 2))
    setSuccess(null)
  }

  const resetMatch = () => {
    setMatchPolicy(deepClone(originalMatch))
    setMatchText(JSON.stringify(originalMatch, null, 2))
    setSuccess(null)
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

    prefilterText,
    setPrefilterText,
    prefilterPolicy,
    hasPrefilterChanges: stableStringify(prefilterPolicy) !== stableStringify(originalPrefilter),
    handleSavePrefilter,
    resetPrefilter,

    matchText,
    setMatchText,
    matchPolicy,
    hasMatchChanges: stableStringify(matchPolicy) !== stableStringify(originalMatch),
    handleSaveMatch,
    resetMatch,

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
