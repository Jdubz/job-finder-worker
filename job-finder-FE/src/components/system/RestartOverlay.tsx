import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { resolveApiBaseUrl } from "@/config/api"
import { persistAppSnapshot } from "@/lib/restart-persistence"

type RestartState =
  | { status: "idle" }
  | { status: "waiting"; reason?: string }

const pollUntilReady = async (healthUrl: string) => {
  const start = Date.now()
  while (true) {
    try {
      const res = await fetch(healthUrl, { cache: "no-store" })
      if (res.ok) return
    } catch {
      /* swallow and retry */
    }
    // Avoid hammering the server while it spins up
    await new Promise((resolve) => setTimeout(resolve, 1200))
    // Safety timeout after ~60s
    if (Date.now() - start > 60000) {
      return
    }
  }
}

export function RestartOverlay() {
  const [state, setState] = useState<RestartState>({ status: "idle" })
  const apiBase = useMemo(() => resolveApiBaseUrl().replace(/\/$/, ""), [])
  const healthUrl = `${apiBase}/healthz`
  const lifecycleUrl = `${apiBase}/api/lifecycle/events`

  const restartTriggered = useRef(false)

  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const source = new EventSource(lifecycleUrl, { withCredentials: true })

    const handleRestart = async (reason?: string) => {
      if (restartTriggered.current) return
      restartTriggered.current = true
      setState({ status: "waiting", reason })
      persistAppSnapshot(reason ?? "server-restarting")
      await pollUntilReady(healthUrl)
      // Hard refresh to pick up new bundle
      window.location.replace(window.location.href)
    }

    source.addEventListener("restarting", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { reason?: string }
        handleRestart(data.reason)
      } catch {
        handleRestart()
      }
    })

    // If the lifecycle stream errors out, it likely means the server is restarting.
    source.onerror = () => handleRestart("lifecycle-stream-disconnected")

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
