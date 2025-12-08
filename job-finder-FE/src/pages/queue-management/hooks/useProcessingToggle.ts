import { useState, useEffect, useCallback } from "react"
import { configClient } from "@/api/config-client"
import { logger } from "@/services/logging/FrontendLogger"

interface UseProcessingToggleResult {
  isProcessingEnabled: boolean | null
  stopReason: string | null
  isToggling: boolean
  toggleProcessing: () => Promise<{ success: boolean; message: string }>
}

/**
 * Hook for managing queue processing toggle state.
 * Loads initial state from worker settings and provides toggle functionality.
 */
export function useProcessingToggle(): UseProcessingToggleResult {
  const [isProcessingEnabled, setIsProcessingEnabled] = useState<boolean | null>(null)
  const [stopReason, setStopReason] = useState<string | null>(null)
  const [isToggling, setIsToggling] = useState(false)

  // Load worker runtime settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await configClient.getWorkerSettings()
        const runtime = settings.runtime
        setIsProcessingEnabled(runtime.isProcessingEnabled ?? true)
        setStopReason(runtime.stopReason ?? null)
      } catch (err) {
        logger.error("ProcessingToggle", "loadSettings", "Failed to load worker settings", {
          error: { type: "FetchError", message: err instanceof Error ? err.message : String(err) },
        })
        setIsProcessingEnabled(true) // Default to enabled
      }
    }
    loadSettings()
  }, [])

  const toggleProcessing = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    const newValue = !isProcessingEnabled
    setIsToggling(true)

    try {
      const current = await configClient.getWorkerSettings()
      const runtime = { ...current.runtime, isProcessingEnabled: newValue }
      await configClient.updateWorkerSettings({ ...current, runtime })
      setIsProcessingEnabled(newValue)

      if (newValue) {
        // Worker clears stopReason when it starts processing
        setStopReason(null)
      }

      return {
        success: true,
        message: newValue ? "Queue processing started" : "Queue processing paused",
      }
    } catch (err) {
      logger.error("ProcessingToggle", "toggle", "Failed to toggle processing", {
        error: { type: "ToggleError", message: err instanceof Error ? err.message : String(err) },
      })
      return {
        success: false,
        message: "Failed to update queue processing state",
      }
    } finally {
      setIsToggling(false)
    }
  }, [isProcessingEnabled])

  return {
    isProcessingEnabled,
    stopReason,
    isToggling,
    toggleProcessing,
  }
}
