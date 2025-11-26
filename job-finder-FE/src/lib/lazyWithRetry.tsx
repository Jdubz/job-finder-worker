import { lazy, type ComponentType } from "react"

const RELOAD_KEY = "chunk_reload_timestamp"
const RELOAD_THRESHOLD_MS = 10000 // 10 seconds - prevent reload loops

/**
 * Checks if an error is caused by a failed chunk/module load
 * This typically happens after deployments when cached HTML references old chunk hashes
 */
function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("loading chunk") ||
      message.includes("loading css chunk") ||
      message.includes("dynamically imported module")
    )
  }
  return false
}

/**
 * Checks if we should reload the page to get fresh assets
 * Returns false if we've recently reloaded (to prevent infinite loops)
 */
function shouldReload(): boolean {
  const lastReload = sessionStorage.getItem(RELOAD_KEY)
  if (!lastReload) return true

  const timeSinceLastReload = Date.now() - parseInt(lastReload, 10)
  return timeSinceLastReload > RELOAD_THRESHOLD_MS
}

/**
 * Marks that we're about to reload to prevent loops
 */
function markReload(): void {
  sessionStorage.setItem(RELOAD_KEY, Date.now().toString())
}

/**
 * A wrapper around React.lazy that handles chunk loading failures gracefully.
 * When a chunk fails to load (common after deployments), it will:
 * 1. Attempt to reload the page once to get fresh assets
 * 2. If reload doesn't help, throw the error to be caught by error boundaries
 *
 * @param importFn - A function that returns a dynamic import promise
 * @returns A lazy-loaded React component
 *
 * @example
 * const MyPage = lazyWithRetry(() =>
 *   import("./MyPage").then((m) => ({ default: m.MyPage }))
 * )
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importFn()
    } catch (error) {
      // If it's a chunk loading error and we haven't recently reloaded, refresh the page
      if (isChunkLoadError(error) && shouldReload()) {
        markReload()
        window.location.reload()
        // Return a never-resolving promise while the page reloads
        return new Promise(() => {})
      }

      // Either not a chunk error, or we've already tried reloading - let it bubble up
      throw error
    }
  })
}
