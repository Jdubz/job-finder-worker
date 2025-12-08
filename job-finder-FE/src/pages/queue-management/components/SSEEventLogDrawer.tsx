import { Bug } from "lucide-react"
import { EVENT_LOG_MAX_SIZE } from "@/config/constants"

interface SSEEventEntry {
  id: string
  event: string
  timestamp: number
  payload: unknown
}

interface SSEEventLogDrawerProps {
  isOpen: boolean
  onClose: () => void
  eventLog: SSEEventEntry[]
}

/**
 * Sliding drawer that displays incoming SSE events for debugging.
 */
export function SSEEventLogDrawer({ isOpen, onClose, eventLog }: SSEEventLogDrawerProps) {
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString()

  return (
    <div
      className={`fixed left-0 top-24 bottom-4 w-96 bg-slate-900 text-slate-50 shadow-2xl border-r border-slate-800 transition-transform duration-300 ease-in-out transform ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4" />
          <div>
            <div className="text-sm font-semibold">Incoming SSE Events</div>
            <div className="text-xs text-slate-400">
              Most recent first • capped at {EVENT_LOG_MAX_SIZE}
            </div>
          </div>
        </div>
        <button
          className="text-slate-400 hover:text-white text-sm"
          onClick={onClose}
          aria-label="Close SSE log"
        >
          Close
        </button>
      </div>
      <div className="h-full overflow-y-auto px-4 py-3 space-y-2 text-xs font-mono leading-relaxed">
        {eventLog.length === 0 ? (
          <div className="text-slate-500">No events yet</div>
        ) : (
          eventLog.map((entry) => (
            <div key={entry.id} className="bg-slate-800/70 border border-slate-700 rounded p-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="uppercase tracking-wide">{entry.event}</span>
                <span className="text-slate-500">{formatTime(entry.timestamp)}</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words text-slate-100">
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
