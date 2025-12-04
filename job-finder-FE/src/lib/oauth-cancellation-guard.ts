import { toast } from "@/components/toast/toast-store"
import { logger } from "@/services/logging/FrontendLogger"

type OAuthErrorShape = {
  type?: string
  error?: string
  errorCode?: string
  error_description?: string
  message?: string
}

const CANCEL_CODES = new Set([
  "popup_closed",
  "popup_closed_by_user",
  "popup_failed_to_open",
  "user_cancel",
  "user_cancelled",
  "access_denied",
])

const CANCEL_CODES_BY_SPECIFICITY = Array.from(CANCEL_CODES).sort((a, b) => b.length - a.length)

let teardown: (() => void) | null = null

const extractCancelCode = (reason: unknown): string | null => {
  if (!reason) return null

  if (typeof reason === "string") {
    return CANCEL_CODES.has(reason) ? reason : null
  }

  if (reason instanceof Error && reason.message) {
    const message = reason.message.toLowerCase()
    for (const code of CANCEL_CODES_BY_SPECIFICITY) {
      if (message.includes(code)) return code
    }
  }

  if (typeof reason === "object") {
    const { type, error, errorCode, error_description, message } = reason as OAuthErrorShape
    const fields = [type, error, errorCode, error_description, message]

    for (const value of fields) {
      if (typeof value !== "string") continue
      const lower = value.toLowerCase()
      for (const code of CANCEL_CODES_BY_SPECIFICITY) {
        if (lower.includes(code)) return code
      }
    }
  }

  return null
}

const handleCancellation = (code: string) => {
  // Surface a friendly message instead of crashing the app
  toast.info({
    title: "Sign-in canceled",
    description: "You closed the sign-in window before finishing.",
    duration: 5000,
  })

  logger.info("auth", "oauth_cancelled", "OAuth window dismissed", {
    details: { code },
  })
}

/**
 * Installs a global listener that converts Google OAuth cancellation errors
 * (e.g. popup_closed_by_user) into a harmless toast so the UI doesn’t crash.
 */
export const installOAuthCancellationGuard = () => {
  if (typeof window === "undefined") return () => {}
  if (teardown) return teardown

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const code = extractCancelCode(event.reason)
    if (!code) return

    event.preventDefault()
    handleCancellation(code)
  }

  const errorHandler = (event: ErrorEvent) => {
    const code = extractCancelCode(event.error ?? event.message)
    if (!code) return

    event.preventDefault()
    handleCancellation(code)
  }

  window.addEventListener("unhandledrejection", rejectionHandler)
  window.addEventListener("error", errorHandler)

  teardown = () => {
    window.removeEventListener("unhandledrejection", rejectionHandler)
    window.removeEventListener("error", errorHandler)
    teardown = null
  }

  return teardown
}
