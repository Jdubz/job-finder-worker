import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { configClient } from "@/api/config-client"
import { DEFAULT_AI_SETTINGS, DEFAULT_PERSONAL_INFO } from "@shared/types"
import type { MatchPolicy, AISettings, PreFilterPolicy, WorkerSettings } from "@shared/types"
import type { PersonalInfo } from "@shared/types"
import { deepClone, stableStringify } from "../utils/config-helpers"

export function useConfigState() {
  const { user } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [prefilterPolicy, setPrefilterPolicy] = useState<PreFilterPolicy | null>(null)
  const [originalPrefilterPolicy, setOriginalPrefilterPolicy] = useState<PreFilterPolicy | null>(null)

  const [matchPolicy, setMatchPolicy] = useState<MatchPolicy | null>(null)
  const [originalMatchPolicy, setOriginalMatchPolicy] = useState<MatchPolicy | null>(null)

  const [workerSettings, setWorkerSettings] = useState<WorkerSettings | null>(null)
  const [originalWorkerSettings, setOriginalWorkerSettings] = useState<WorkerSettings | null>(null)

  const [aiSettings, setAISettings] = useState<AISettings>(DEFAULT_AI_SETTINGS)
  const [originalAI, setOriginalAI] = useState<AISettings>(DEFAULT_AI_SETTINGS)

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

      const prefilter = map["prefilter-policy"] as PreFilterPolicy | undefined
      if (!prefilter) throw new Error("prefilter-policy config is missing")
      setPrefilterPolicy(deepClone(prefilter))
      setOriginalPrefilterPolicy(deepClone(prefilter))

      const matchPolicyData = map["match-policy"] as MatchPolicy | undefined
      if (matchPolicyData) {
        setMatchPolicy(deepClone(matchPolicyData))
        setOriginalMatchPolicy(deepClone(matchPolicyData))
      } else {
        setMatchPolicy(null)
        setOriginalMatchPolicy(null)
      }

      const worker = map["worker-settings"] as WorkerSettings | undefined
      if (!worker) throw new Error("worker-settings config is missing")
      setWorkerSettings(deepClone(worker))
      setOriginalWorkerSettings(deepClone(worker))

      const ai = deepClone((map["ai-settings"] as AISettings) ?? DEFAULT_AI_SETTINGS)
      setAISettings(ai)
      setOriginalAI(deepClone(ai))

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

  const handleSavePrefilter = async (configOverride?: PreFilterPolicy) => {
    setIsSaving(true)
    setError(null)
    const payload = deepClone(configOverride ?? prefilterPolicy)
    if (!payload) {
      setError("No pre-filter policy to save")
      setIsSaving(false)
      return
    }
    try {
      await configClient.updatePrefilterPolicy(payload)
      setPrefilterPolicy(payload)
      setOriginalPrefilterPolicy(deepClone(payload))
      setSuccess("Pre-filter policy saved")
    } catch (_err) {
      setError("Failed to save pre-filter policy")
    } finally {
    setIsSaving(false)
    }
  }

  const updatePersonalInfoState = (updates: Partial<PersonalInfo>) => {
    setPersonalInfo((prev) => ({ ...(prev ?? DEFAULT_PERSONAL_INFO), ...updates }))
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

  const setRuntimeSettings = (updates: Partial<WorkerSettings["runtime"]>) => {
    setWorkerSettings((prev) => (prev ? { ...prev, runtime: { ...prev.runtime, ...updates } } : prev))
  }

  const handleSaveWorkerSettings = async () => {
    if (!workerSettings) {
      setError("Worker settings not loaded")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await configClient.updateWorkerSettings(workerSettings)
      setOriginalWorkerSettings(deepClone(workerSettings))
      setSuccess("Worker settings saved")
    } catch (_err) {
      setError("Failed to save worker settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAISettings = async () => {
    setIsSaving(true)
    setError(null)
    try {
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

  const handleSavePersonalInfo = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await configClient.updatePersonalInfo(personalInfo, user?.email ?? "")
      setOriginalPersonalInfo(deepClone(personalInfo))
      setSuccess("Personal info saved")
    } catch (_err) {
      setError("Failed to save personal info")
    } finally {
      setIsSaving(false)
    }
  }

  return {
    isLoading,
    isSaving,
    error,
    success,

    prefilterPolicy,
    originalPrefilterPolicy,
    handleSavePrefilter,
    resetPrefilter: () => setPrefilterPolicy(deepClone(originalPrefilterPolicy)),

    matchPolicy,
    originalMatchPolicy,
    handleSaveMatchPolicy,
    resetMatchPolicy: () => setMatchPolicy(deepClone(originalMatchPolicy)),

    aiSettings,
    setAISettings,
    handleSaveAISettings,
    hasAIChanges: stableStringify(aiSettings) !== stableStringify(originalAI),
    resetAI: () => setAISettings(deepClone(originalAI)),

    workerSettings,
    setRuntimeSettings,
    handleSaveWorkerSettings,
    hasWorkerChanges: stableStringify(workerSettings) !== stableStringify(originalWorkerSettings),
    resetWorker: () => setWorkerSettings(deepClone(originalWorkerSettings)),

    personalInfo,
    updatePersonalInfoState,
    handleSavePersonalInfo,
    hasPersonalInfoChanges: stableStringify(personalInfo) !== stableStringify(originalPersonalInfo),
    resetPersonal: () => setPersonalInfo(deepClone(originalPersonalInfo)),
  }
}
