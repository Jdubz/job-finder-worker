/**
 * AI Prompts Hook
 *
 * Hook for managing AI prompts configuration with real-time updates
 */

import { useState, useCallback, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { promptsClient } from "@/api"
import type { PromptConfig } from "@shared/types"
import { DEFAULT_PROMPTS } from "@shared/types"

interface UseAIPromptsResult {
  prompts: PromptConfig
  loading: boolean
  error: Error | null
  saving: boolean
  savePrompts: (prompts: Omit<PromptConfig, "updatedAt" | "updatedBy">) => Promise<void>
  resetToDefaults: () => Promise<void>
}

/**
 * Hook to manage AI prompts configuration with real-time updates
 */
export function useAIPrompts(): UseAIPromptsResult {
  const { user } = useAuth()
  const [prompts, setPrompts] = useState<PromptConfig>(DEFAULT_PROMPTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [saving, setSaving] = useState(false)

  // Load prompts on mount (one-time fetch, not a subscription)
  useEffect(() => {
    let mounted = true

    const loadPrompts = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await promptsClient.getPrompts()
        if (mounted) {
          setPrompts(result ?? DEFAULT_PROMPTS)
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error)
          setPrompts(DEFAULT_PROMPTS)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadPrompts()

    return () => {
      mounted = false
    }
  }, [])

  /**
   * Save prompts via API
   */
  const savePrompts = useCallback(
    async (newPrompts: Omit<PromptConfig, "updatedAt" | "updatedBy">) => {
      if (!user?.email) {
        throw new Error("User email not found")
      }

      setSaving(true)
      setError(null)

      try {
        await promptsClient.savePrompts(newPrompts, user.email)
        // Update local state on successful save
        setPrompts({ ...newPrompts })
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [user?.email]
  )

  /**
   * Reset prompts to defaults
   */
  const resetToDefaults = useCallback(async () => {
    if (!user?.email) {
      throw new Error("User email not found")
    }

    setSaving(true)
    setError(null)

    try {
      await promptsClient.resetToDefaults(user.email)
      // Update local state on successful reset
      setPrompts(DEFAULT_PROMPTS)
    } catch (err) {
      setError(err as Error)
      throw err
    } finally {
      setSaving(false)
    }
  }, [user?.email])

  return {
    prompts,
    loading,
    error,
    saving,
    savePrompts,
    resetToDefaults,
  }
}
