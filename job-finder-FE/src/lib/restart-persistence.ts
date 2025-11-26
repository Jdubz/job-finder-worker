import { logger } from "@/services/logging/FrontendLogger"

type StateProvider = {
  name: string
  version: number
  serialize: () => unknown
  hydrate: (data: unknown) => void
}

type ProviderSnapshot = {
  name: string
  version: number
  data: unknown
}

type StoredSnapshot = {
  version: number
  savedAt: string
  reason: string
  route: string
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
  providers: ProviderSnapshot[]
}

const STORAGE_KEY = "app:restart-snapshot:v1"

const providers = new Map<string, StateProvider>()
const pendingHydration = new Map<string, unknown>()

const copyStorage = (storage: Storage): Record<string, string> => {
  const payload: Record<string, string> = {}
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key) continue
    const value = storage.getItem(key)
    if (value !== null) {
      payload[key] = value
    }
  }
  return payload
}

function restoreStorage(snapshot: Record<string, string>, target: Storage, label: string) {
  Object.entries(snapshot).forEach(([key, value]) => {
    try {
      target.setItem(key, value)
    } catch (error) {
      logger.warning("restart", "hydrate-storage-failed", `Failed to restore ${label} key ${key}`, {
        details: {
          error: {
            type: (error as Error).name,
            message: (error as Error).message,
            stack: (error as Error).stack,
          },
        },
      })
    }
  })
}

export function registerStateProvider(provider: StateProvider) {
  providers.set(provider.name, provider)
}

export function consumeSavedProviderState<T>(name: string): T | null {
  if (!pendingHydration.has(name)) return null
  const value = pendingHydration.get(name) as T
  pendingHydration.delete(name)
  return value ?? null
}

export function persistAppSnapshot(reason: string): StoredSnapshot | null {
  if (typeof window === "undefined") return null
  const providerSnapshots: ProviderSnapshot[] = []

    providers.forEach((provider) => {
      try {
        providerSnapshots.push({
          name: provider.name,
          version: provider.version,
          data: provider.serialize(),
        })
      } catch (error) {
        logger.warning("restart", "provider-serialize-failed", `Provider ${provider.name} failed to serialize`, {
          details: {
            error: {
              type: (error as Error).name,
              message: (error as Error).message,
              stack: (error as Error).stack,
            },
          },
        })
      }
    })

  const snapshot: StoredSnapshot = {
    version: 1,
    savedAt: new Date().toISOString(),
    reason,
    route: window.location.href,
    localStorage: copyStorage(window.localStorage),
    sessionStorage: copyStorage(window.sessionStorage),
    providers: providerSnapshots,
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  logger.info("restart", "snapshot-created", "Persisted app snapshot for restart", {
    details: { providers: providerSnapshots.length },
  })
  return snapshot
}

export function hydrateAppSnapshot(): { restoredProviders: number; errors: number } {
  if (typeof window === "undefined") return { restoredProviders: 0, errors: 0 }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return { restoredProviders: 0, errors: 0 }

  window.sessionStorage.removeItem(STORAGE_KEY)
  try {
    const snapshot = JSON.parse(raw) as StoredSnapshot
    if (snapshot.version !== 1) {
      logger.warning("restart", "snapshot-version-mismatch", "Snapshot version not supported", {
        details: { version: snapshot.version },
      })
      return { restoredProviders: 0, errors: 1 }
    }

    restoreStorage(snapshot.localStorage, window.localStorage, "localStorage")
    restoreStorage(snapshot.sessionStorage, window.sessionStorage, "sessionStorage")

    snapshot.providers.forEach((provider) => {
      pendingHydration.set(provider.name, provider.data)
    })

    logger.info("restart", "snapshot-restored", "Restored persisted snapshot after restart", {
      details: { providers: snapshot.providers.length },
    })

    return { restoredProviders: snapshot.providers.length, errors: 0 }
  } catch (error) {
    logger.error("restart", "hydrate-failed", "Failed to hydrate saved snapshot", {
      error: {
        type: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      },
    })
    return { restoredProviders: 0, errors: 1 }
  }
}

export function clearPendingHydration() {
  pendingHydration.clear()
}

export function getRegisteredProvidersCount() {
  return providers.size
}
