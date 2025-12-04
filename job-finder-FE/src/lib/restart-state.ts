let restarting = false
let restartReason: string | undefined

type Listener = (state: { restarting: boolean; reason?: string }) => void

const listeners = new Set<Listener>()

export function markAppRestarting(reason?: string) {
  if (restarting && restartReason === reason) return
  restarting = true
  if (reason) {
    restartReason = reason
  }
  listeners.forEach((listener) => listener({ restarting, reason: restartReason }))
}

export function isAppRestarting() {
  return restarting
}

export function getRestartReason() {
  return restartReason
}

export function onRestartStateChange(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Exported for tests/debug tooling only
export function __resetRestartState() {
  restarting = false
  restartReason = undefined
  listeners.clear()
}
