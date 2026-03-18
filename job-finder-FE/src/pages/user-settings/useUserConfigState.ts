import { useState, useEffect, useCallback } from "react"
import { userConfigClient } from "@/api/user-config-client"
import type { MatchPolicy, PreFilterPolicy, PersonalInfo } from "@shared/types"

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value))
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject)
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

export function useUserConfigState() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [prefilterPolicy, setPrefilterPolicy] = useState<PreFilterPolicy | null>(null)
  const [originalPrefilterPolicy, setOriginalPrefilterPolicy] = useState<PreFilterPolicy | null>(null)

  const [matchPolicy, setMatchPolicy] = useState<MatchPolicy | null>(null)
  const [originalMatchPolicy, setOriginalMatchPolicy] = useState<MatchPolicy | null>(null)

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null)
  const [originalPersonalInfo, setOriginalPersonalInfo] = useState<PersonalInfo | null>(null)

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const entries = await userConfigClient.listUserConfigs()
      const map = entries.reduce<Record<string, unknown>>((acc, cur) => {
        acc[cur.id] = cur.payload
        return acc
      }, {})

      const prefilter = map["prefilter-policy"] as PreFilterPolicy | undefined
      if (prefilter) {
        setPrefilterPolicy(deepClone(prefilter))
        setOriginalPrefilterPolicy(deepClone(prefilter))
      } else {
        setPrefilterPolicy(null)
        setOriginalPrefilterPolicy(null)
      }

      const matchPolicyData = map["match-policy"] as MatchPolicy | undefined
      if (matchPolicyData) {
        setMatchPolicy(deepClone(matchPolicyData))
        setOriginalMatchPolicy(deepClone(matchPolicyData))
      } else {
        setMatchPolicy(null)
        setOriginalMatchPolicy(null)
      }

      const personalData = map["personal-info"] as PersonalInfo | undefined
      if (personalData) {
        setPersonalInfo(deepClone(personalData))
        setOriginalPersonalInfo(deepClone(personalData))
      } else {
        setPersonalInfo(null)
        setOriginalPersonalInfo(null)
      }
    } catch (err) {
      console.error(err)
      setError("Failed to load user settings")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Auto-clear success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const handleSavePrefilter = async (configOverride?: PreFilterPolicy) => {
    const payload = deepClone(configOverride ?? prefilterPolicy)
    if (!payload) {
      setError("No pre-filter policy to save")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await userConfigClient.updatePrefilterPolicy(payload)
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
      await userConfigClient.updateMatchPolicy(deepClone(payload))
      setMatchPolicy(deepClone(payload))
      setOriginalMatchPolicy(deepClone(payload))
      setSuccess("Match policy saved")
    } catch (_err) {
      setError("Failed to save match policy")
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
      const saved = await userConfigClient.updatePersonalInfo(personalInfo)
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

    prefilterPolicy,
    handleSavePrefilter,
    resetPrefilter: () => setPrefilterPolicy(deepClone(originalPrefilterPolicy)),

    matchPolicy,
    handleSaveMatchPolicy,
    resetMatchPolicy: () => setMatchPolicy(deepClone(originalMatchPolicy)),

    personalInfo,
    updatePersonalInfoState,
    handleSavePersonalInfo,
    hasPersonalInfoChanges: stableStringify(personalInfo) !== stableStringify(originalPersonalInfo),
    resetPersonal: () => setPersonalInfo(deepClone(originalPersonalInfo)),
  }
}
