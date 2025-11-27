import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { resolveApiBaseUrl } from "@/config/api"
import { persistAppSnapshot } from "@/lib/restart-persistence"

type RestartState =
  | { status: "idle" }
  | { status: "waiting"; reason?: string }

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
    // Avoid hammering the server while it spins up
    await new Promise((resolve) => setTimeout(resolve, 1200))
    // Safety timeout after ~90s
    if (Date.now() - start > 90000) {
      return false
    }
  }
}

export function RestartOverlay() {
  const [state, setState] = useState<RestartState>({ status: "idle" })
  const apiBase = useMemo(() => resolveApiBaseUrl().replace(/\/$/, ""), [])
  const healthUrl = `${apiBase}/healthz`
  const lifecycleUrl = `${apiBase}/api/lifecycle/events`

  const restartTriggered = useRef(false)
  const errorStreak = useRef(0)

  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const source = new EventSource(lifecycleUrl, { withCredentials: true })

    const handleRestart = async (reason?: string) => {
      if (restartTriggered.current) return
      restartTriggered.current = true
      setState({ status: "waiting", reason })
      persistAppSnapshot(reason ?? "server-restarting")
      const ready = await pollUntilReady(healthUrl)
      if (ready) {
        // Hard refresh to pick up new bundle
        window.location.replace(window.location.href)
      } else {
        // Stay on the page; user can manually refresh once they’re ready
        setState({ status: "waiting", reason: "Still waiting for the API to come back up…" })
        restartTriggered.current = false
      }
    }

    source.addEventListener("restarting", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { reason?: string }
        handleRestart(data.reason)
      } catch {
        handleRestart()
      }
    })

    // Reset error streak once connection is open again
    source.onopen = () => {
      errorStreak.current = 0
    }

    // Only treat repeated failures + failing healthcheck as a restart
    source.onerror = async () => {
      errorStreak.current += 1
      // quick health probe to avoid false positives from transient network hiccups
      const healthy = await fetch(healthUrl, { cache: "no-store" })
        .then((r) => r.ok)
        .catch(() => false)
      if (!healthy && errorStreak.current >= 2) {
        handleRestart("lifecycle stream disconnected & healthcheck failed")
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
