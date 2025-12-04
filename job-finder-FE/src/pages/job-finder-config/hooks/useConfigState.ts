import { useState, useEffect, useCallback } from "react"
import { configClient } from "@/api/config-client"
import type { MatchPolicy, AISettings, PreFilterPolicy, WorkerSettings, PersonalInfo } from "@shared/types"
import { deepClone, stableStringify } from "../utils/config-helpers"

export function useConfigState() {

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [missingConfigs, setMissingConfigs] = useState<string[]>([])

  const [prefilterPolicy, setPrefilterPolicy] = useState<PreFilterPolicy | null>(null)
  const [originalPrefilterPolicy, setOriginalPrefilterPolicy] = useState<PreFilterPolicy | null>(null)

  const [matchPolicy, setMatchPolicy] = useState<MatchPolicy | null>(null)
  const [originalMatchPolicy, setOriginalMatchPolicy] = useState<MatchPolicy | null>(null)

  const [workerSettings, setWorkerSettings] = useState<WorkerSettings | null>(null)
  const [originalWorkerSettings, setOriginalWorkerSettings] = useState<WorkerSettings | null>(null)

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

      // Pre-filter policy - required
      const prefilter = map["prefilter-policy"] as PreFilterPolicy | undefined
      if (prefilter) {
        setPrefilterPolicy(deepClone(prefilter))
        setOriginalPrefilterPolicy(deepClone(prefilter))
      } else {
        missing.push("prefilter-policy")
        setPrefilterPolicy(null)
        setOriginalPrefilterPolicy(null)
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

      // Worker settings - required
      const worker = map["worker-settings"] as WorkerSettings | undefined
      if (worker) {
        setWorkerSettings(deepClone(worker))
        setOriginalWorkerSettings(deepClone(worker))
      } else {
        missing.push("worker-settings")
        setWorkerSettings(null)
        setOriginalWorkerSettings(null)
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

  const setRuntimeSettings = (updates: Partial<WorkerSettings["runtime"]>) => {
    setWorkerSettings((prev) => (prev ? { ...prev, runtime: { ...prev.runtime, ...updates } } : prev))
  }

  const setScrapingSettings = (updates: Partial<WorkerSettings["scraping"]>) => {
    setWorkerSettings((prev) => (prev ? { ...prev, scraping: { ...prev.scraping, ...updates } } : prev))
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

  const updatePersonalInfoState = (updates: Partial<PersonalInfo>) => {
    setPersonalInfo((prev) => {
      if (!prev) return null
      return { ...prev, ...updates }
    })
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

  return {
    isLoading,
    isSaving,
    error,
    success,
    missingConfigs,

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
    setScrapingSettings,
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
