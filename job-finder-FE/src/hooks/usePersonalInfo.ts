/**
 * Personal Info Hook
 *
 * Hook for managing user's personal information (user defaults for document generation)
 * Stored in job-finder-config/personal-info document
 */

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useFirestore } from "@/contexts/FirestoreContext"
import type { PersonalInfo } from "@shared/types"
import type { DocumentWithId } from "@/services/firestore/types"

interface UsePersonalInfoResult {
  personalInfo: DocumentWithId<PersonalInfo> | null
  loading: boolean
  error: Error | null
  updatePersonalInfo: (updates: Partial<Omit<PersonalInfo, "id" | "type">>) => Promise<void>
  refetch: () => Promise<void>
}

const PERSONAL_INFO_DOC_ID = "personal-info"

/**
 * Hook to manage personal information for document generation
 *
 * @returns Personal info data, loading state, error state, and update function
 */
export function usePersonalInfo(): UsePersonalInfoResult {
  const { user } = useAuth()
  const { service } = useFirestore()

  const [personalInfo, setPersonalInfo] = useState<DocumentWithId<PersonalInfo> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Load personal info from Firestore
   */
  const loadPersonalInfo = useCallback(async () => {
    if (!user?.uid) {
      setPersonalInfo(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const doc = (await service.getDocument(
        "job-finder-config",
        PERSONAL_INFO_DOC_ID
      )) as DocumentWithId<PersonalInfo> | null

      setPersonalInfo(doc)
    } catch (err) {
      console.error("Error loading personal info:", err)
      setError(err instanceof Error ? err : new Error("Failed to load personal info"))
      setPersonalInfo(null)
    } finally {
      setLoading(false)
    }
  }, [user?.uid, service])

  /**
   * Update personal info in Firestore
   */
  const updatePersonalInfo = useCallback(
    async (updates: Partial<Omit<PersonalInfo, "id" | "type">>) => {
      if (!user?.email) {
        throw new Error("User must be authenticated to update personal info")
      }

      try {
        setError(null)

        // If document doesn't exist, create it
        if (!personalInfo) {
          await service.setDocument("job-finder-config", PERSONAL_INFO_DOC_ID, {
            name: updates.name || "",
            email: updates.email || user.email,
            phone: updates.phone,
            location: updates.location,
            website: updates.website,
            github: updates.github,
            linkedin: updates.linkedin,
            avatar: updates.avatar,
            logo: updates.logo,
            accentColor: updates.accentColor || "#3b82f6", // Default blue
          } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        } else {
          // Update existing document
          await service.updateDocument("job-finder-config", PERSONAL_INFO_DOC_ID, updates)
        }

        // Reload to get fresh data
        await loadPersonalInfo()
      } catch (err) {
        console.error("Error updating personal info:", err)
        const error = err instanceof Error ? err : new Error("Failed to update personal info")
        setError(error)
        throw error
      }
    },
    [user?.email, personalInfo, service, loadPersonalInfo]
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
