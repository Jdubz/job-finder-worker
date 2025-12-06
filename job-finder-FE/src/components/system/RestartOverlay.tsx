import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { resolveApiBaseUrl } from "@/config/api"
import { persistAppSnapshot } from "@/lib/restart-persistence"
import { markAppRestarting } from "@/lib/restart-state"

type RestartState =
  | { status: "idle" }
  | { status: "waiting"; reason?: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const pollUntilReady = async (healthUrl: string) => {
  const start = Date.now()
  let consecutiveOk = 0

  while (true) {
    try {
      const res = await fetch(healthUrl, { cache: "no-store" })
      if (res.ok) {
        consecutiveOk += 1
        if (consecutiveOk >= 3) return true
      } else {
        consecutiveOk = 0
      }
    } catch {
      /* swallow and retry */
      consecutiveOk = 0
    }
    await wait(1200)
    if (Date.now() - start > 90000) {
      return false
    }
  }
}

export function RestartOverlay() {
  const [state, setState] = useState<RestartState>({ status: "idle" })
  const stateRef = useRef(state)
  stateRef.current = state

  const apiBase = useMemo(() => resolveApiBaseUrl().replace(/\/$/, ""), [])
  const healthUrl = `${apiBase}/healthz`
  const lifecycleUrl = `${apiBase}/api/lifecycle/events`

  const restartTriggered = useRef(false)

  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const source = new EventSource(lifecycleUrl, { withCredentials: true })

    const beginBlocking = async (reason?: string) => {
      if (restartTriggered.current) return
      restartTriggered.current = true
      markAppRestarting(reason)
      setState({ status: "waiting", reason })
      persistAppSnapshot(reason ?? "server-restarting")
      const ready = await pollUntilReady(healthUrl)
      if (ready) {
        window.location.replace(window.location.href)
      } else {
        setState({ status: "waiting", reason: "Still waiting for the API to come back up…" })
        restartTriggered.current = false
      }
    }

    source.addEventListener("restarting", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { reason?: string }
        void beginBlocking(data.reason)
      } catch {
        void beginBlocking()
      }
    })

    // Handle SSE connection errors - the server may have died without sending 'restarting'
    // This catches cases where watchtower/docker kills the container abruptly
    const CONSECUTIVE_ERROR_THRESHOLD = 2
    let errorCount = 0
    source.onerror = () => {
      // If a restart is already in progress (polling), reset counter and ignore.
      // This prevents re-triggering immediately if polling times out.
      if (restartTriggered.current) {
        errorCount = 0
        return
      }
      errorCount++
      // After consecutive errors, assume the server is down and trigger the restart flow
      if (errorCount >= CONSECUTIVE_ERROR_THRESHOLD) {
        void beginBlocking("connection-lost")
      }
    }

    // Reset error count when connection is re-established
    // If the modal is showing (we timed out waiting), retry polling now that the API is back
    source.onopen = () => {
      errorCount = 0
      // If we previously timed out and the modal is still showing, retry the reload
      // Delay briefly to let the server stabilize (SSE may connect before /healthz is ready)
      if (!restartTriggered.current && stateRef.current.status === "waiting") {
        setTimeout(() => {
          // Re-check conditions after delay in case state changed
          if (!restartTriggered.current && stateRef.current.status === "waiting") {
            void beginBlocking(stateRef.current.reason)
          }
        }, 1500)
      }
    }

    return () => {
      source.close()
    }
  }, [healthUrl, lifecycleUrl])

  if (state.status === "idle") return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm text-white">
      <div className="max-w-lg w-full mx-4 rounded-lg border border-white/10 bg-gray-900/90 p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full bg-amber-400 animate-pulse" aria-hidden />
          <h2 className="text-xl font-semibold">We’re updating the app</h2>
        </div>
        <p className="mt-3 text-sm text-gray-200">
          The server is restarting to deploy a new version. We’ve saved your current session and
          will reload automatically as soon as the API is reachable.
        </p>
        {state.reason ? (
          <p className="mt-2 text-xs text-gray-400">Reason: {state.reason}</p>
        ) : null}
        <p className="mt-4 text-xs text-gray-400">
          If this message remains for more than a minute, please refresh manually.
        </p>
      </div>
    </div>,
    document.body
  )
}
