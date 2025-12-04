/**
 * Utility functions for the Job Finder Configuration page
 */

/**
 * Sorts object keys recursively for stable JSON stringification
 */
function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item))
  }
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

/**
 * Creates a stable JSON string representation of a value
 * Used for comparing objects to detect changes
 */
export const stableStringify = (value: unknown): string => JSON.stringify(sortObject(value))

/**
 * Deep clones an object using JSON serialization
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Configuration for the generic save handler
 */
export type SaveHandlerConfig<T> = {
  data: T | null
  updateFn: (data: T) => Promise<void>
  setOriginal: (data: T) => void
  configName: string
  setIsSaving: (saving: boolean) => void
  setError: (error: string | null) => void
  setSuccess: (success: string | null) => void
}

/**
 * Generic save handler factory to reduce duplication across config tabs
 */
export async function createSaveHandler<T>(config: SaveHandlerConfig<T>): Promise<void> {
  const { data, updateFn, setOriginal, configName, setIsSaving, setError, setSuccess } = config
  if (!data) return
  setIsSaving(true)
  setError(null)
  setSuccess(null)
  // Capitalize first letter for success message
  const displayName = configName.charAt(0).toUpperCase() + configName.slice(1)
  try {
    await updateFn(data)
    setOriginal(deepClone(data))
    setSuccess(`${displayName} saved successfully!`)
    setTimeout(() => setSuccess(null), 3000)
  } catch (err) {
    setError(`Failed to save ${configName}`)
    console.error(`Error saving ${configName}:`, err)
  } finally {
    setIsSaving(false)
  }
}

/**
 * Generic reset handler factory to reduce duplication across config tabs
 */
export function createResetHandler<T>(
  setter: (data: T) => void,
  original: T | null,
  defaultValue: T,
  setError: (error: string | null) => void,
  setSuccess: (success: string | null) => void
): void {
  setter(deepClone(original ?? defaultValue))
  setError(null)
  setSuccess(null)
}
