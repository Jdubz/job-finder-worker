/**
 * Personal Info Hook
 *
 * Hook for managing user's personal information (user defaults for document generation)
 * Stored in job-finder-config/personal-info document
 */

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type { PersonalInfo } from "@shared/types"
import { configClient } from "@/api"

interface UsePersonalInfoResult {
  personalInfo: PersonalInfo | null
  loading: boolean
  error: Error | null
  updatePersonalInfo: (updates: Partial<Omit<PersonalInfo, "id" | "type">>) => Promise<void>
  refetch: () => Promise<void>
}

export function usePersonalInfo(): UsePersonalInfoResult {
  const { user } = useAuth()

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadPersonalInfo = useCallback(async () => {
    if (!user?.uid) {
      setPersonalInfo(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const info = await configClient.getPersonalInfo()
      setPersonalInfo(info)
    } catch (err) {
      console.error("Error loading personal info:", err)
      setError(err instanceof Error ? err : new Error("Failed to load personal info"))
      setPersonalInfo(null)
    } finally {
      setLoading(false)
    }
  }, [user?.uid])

  const updatePersonalInfo = useCallback(
    async (updates: Partial<Omit<PersonalInfo, "id" | "type">>) => {
      if (!user?.email) {
        throw new Error("User must be authenticated to update personal info")
      }

      try {
        setError(null)
        await configClient.updatePersonalInfo(updates, user.email)
        await loadPersonalInfo()
      } catch (err) {
        console.error("Error updating personal info:", err)
        const error = err instanceof Error ? err : new Error("Failed to update personal info")
        setError(error)
        throw error
      }
    },
    [user?.email, loadPersonalInfo]
  )

  /**
   * Refetch personal info
   */
  const refetch = useCallback(async () => {
    await loadPersonalInfo()
  }, [loadPersonalInfo])

  // Load personal info on mount and when user changes
  useEffect(() => {
    loadPersonalInfo()
  }, [loadPersonalInfo])

  return {
    personalInfo,
    loading,
    error,
    updatePersonalInfo,
    refetch,
  }
}
