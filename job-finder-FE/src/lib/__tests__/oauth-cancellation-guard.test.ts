import { describe, it, vi, expect, beforeEach, afterEach } from "vitest"
import { installOAuthCancellationGuard } from "@/lib/oauth-cancellation-guard"

vi.mock("@/components/toast/toast-store", () => ({
  toast: {
    info: vi.fn(),
  },
}))

vi.mock("@/services/logging/FrontendLogger", () => ({
  logger: {
    info: vi.fn(),
  },
}))

// Imports must come after the mocks to receive the mocked implementations
import { toast } from "@/components/toast/toast-store"
import { logger } from "@/services/logging/FrontendLogger"

describe("installOAuthCancellationGuard", () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Remove any listeners between tests
    installOAuthCancellationGuard()()
  })

  it("prevents crashes when the popup is closed by the user", () => {
    installOAuthCancellationGuard()

    const reason = { type: "popup_closed_by_user" }
    const promise = Promise.reject(reason)
    promise.catch(() => {})

    const event = new PromiseRejectionEvent("unhandledrejection", { promise, reason })
    const preventSpy = vi.spyOn(event, "preventDefault")

    window.dispatchEvent(event)

    expect(preventSpy).toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith({
      title: "Sign-in canceled",
      description: "You closed the sign-in window before finishing.",
      duration: 5000,
    })
    expect(logger.info).toHaveBeenCalledWith(
      "auth",
      "oauth_cancelled",
      "OAuth window dismissed",
      { details: { code: "popup_closed_by_user" } }
    )
  })

  it("ignores unrelated rejections", () => {
    installOAuthCancellationGuard()

    const reason = new Error("something else")
    const promise = Promise.reject(reason)
    promise.catch(() => {})

    const event = new PromiseRejectionEvent("unhandledrejection", { promise, reason })
    const preventSpy = vi.spyOn(event, "preventDefault")

    window.dispatchEvent(event)

    expect(preventSpy).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })
})
