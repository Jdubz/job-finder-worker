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
  const lastMessageTime = useRef(Date.now())

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

    const attemptReloadIfWaiting = () => {
      if (stateRef.current.status !== "waiting") return
      // Rely on a full reload to restore persisted state and reconnect SSE cleanly
      window.location.replace(window.location.href)
    }

    const handleLifecycleRecovery = (event: MessageEvent) => {
      if (stateRef.current.status !== "waiting") return
      // `ready` events are authoritative that the API is back. `status` events carry a ready flag.
      if (event.type === "ready") {
        attemptReloadIfWaiting()
        return
      }

      try {
        const data = JSON.parse(event.data) as { ready?: boolean; phase?: string }
        if (data.ready || data.phase === "ready") {
          attemptReloadIfWaiting()
        }
      } catch {
        /* ignore malformed status payloads */
      }
    }

    // Helper to track message timing for heartbeat detection
    // Must be defined before event listeners that use it
    function updateMessageTime() {
      lastMessageTime.current = Date.now()
    }

    source.addEventListener("restarting", (event) => {
      updateMessageTime()
      try {
        const data = JSON.parse((event as MessageEvent).data) as { reason?: string }
        void beginBlocking(data.reason)
      } catch {
        void beginBlocking()
      }
    })

    // The backend broadcasts a `ready` (and periodic `status`) event once it is accepting traffic again.
    // If polling failed due to a bad health URL or other transient issues, this acts as a second signal
    // to clear the overlay and reload when the API is definitively back online.
    source.addEventListener("ready", (event) => {
      updateMessageTime()
      handleLifecycleRecovery(event as MessageEvent)
    })
    source.addEventListener("status", (event) => {
      updateMessageTime()
      handleLifecycleRecovery(event as MessageEvent)
    })

    // Handle SSE connection errors with modern best practices:
    // 1. Don't assume server is down on network errors (ERR_NETWORK_CHANGED)
    // 2. Server sends status events ~every 15s (SSE comment heartbeats don't trigger listeners)
    //    Only actual events update lastMessageTime - 45s+ silence means stale connection
    // 3. Verify server is actually down before showing overlay
    const HEARTBEAT_TIMEOUT_MS = 45_000 // 3x expected event interval
    const TRANSIENT_ERROR_GRACE_MS = 5_000 // Recent message = transient network error

    source.onerror = async () => {
      // If a restart is already in progress, ignore additional errors
      if (restartTriggered.current) return

      const timeSinceLastMessage = Date.now() - lastMessageTime.current

      // If we recently received a message, this is a transient network error
      // (e.g., ERR_NETWORK_CHANGED from WiFi switch, VPN change, etc.)
      // Browser will auto-reconnect with exponential backoff - don't show overlay
      if (timeSinceLastMessage < TRANSIENT_ERROR_GRACE_MS) return

      // If no events for 45+ seconds, verify server health before showing overlay
      if (timeSinceLastMessage > HEARTBEAT_TIMEOUT_MS) {
        try {
          const res = await fetch(healthUrl, { cache: "no-store" })
          if (res.ok) {
            // Server is actually up - SSE connection issue, let browser reconnect
            return
          }
        } catch {
          // Health check failed - server is likely down
          void beginBlocking("connection-lost")
        }
      }
    }

    // Reset state when connection is re-established
    source.onopen = () => {
      lastMessageTime.current = Date.now()
      // If we previously timed out and the modal is still showing, retry the reload
      // Delay briefly to let the server stabilize (SSE may connect before /healthz is ready)
      if (!restartTriggered.current && stateRef.current.status === "waiting") {
        setTimeout(() => {
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
