import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { consumeSavedProviderState, registerStateProvider } from "@/lib/restart-persistence"
import { logger } from "@/services/logging/FrontendLogger"

function isSerializable(value: unknown): boolean {
  if (value === null) return true
  if (["string", "number", "boolean"].includes(typeof value)) return true
  if (Array.isArray(value)) return true
  if (typeof value === "object") return true
  return false
}

/**
 * Persist a piece of state through a restart cycle initiated by the backend.
 * State is stored in the restart snapshot (sessionStorage) and rehydrated atomically on reload.
 */
export function useRestartPersistedState<T>(
  name: string,
  initialState: T | (() => T),
  version = 1
): [T, Dispatch<SetStateAction<T>>] {
  const saved = useMemo(() => consumeSavedProviderState<T>(name), [name])
  const [state, setState] = useState<T>(() => saved ?? (typeof initialState === "function" ? (initialState as () => T)() : initialState))

  useEffect(() => {
    registerStateProvider({
      name,
      version,
      serialize: () => state,
      hydrate: (data) => {
        if (!isSerializable(data)) {
          logger.warning("restart", "hydrate-incompatible", `Provider ${name} data incompatible`, { dataType: typeof data })
          return
        }
        try {
          setState(data as T)
        } catch (error) {
          logger.warning("restart", "hydrate-failed", `Provider ${name} hydrate threw`, {
            error: (error as Error).message,
          })
        }
      },
    })
  }, [name, state, version])

  return [state, setState]
}
