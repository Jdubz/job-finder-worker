import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom"
import { isChunkLoadError, RELOAD_KEY } from "@/lib/lazyWithRetry"

/**
 * Route-level error boundary component for React Router.
 * Handles chunk loading errors with a user-friendly message and retry option.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()

  const isChunkError = isChunkLoadError(error)

  const handleRetry = () => {
    // Clear the reload timestamp to allow a fresh reload attempt
    sessionStorage.removeItem(RELOAD_KEY)
    window.location.reload()
  }

  const handleGoHome = () => {
    navigate("/", { replace: true })
  }

  // Handle 404 and other HTTP error responses
  if (isRouteErrorResponse(error)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-6xl font-bold text-muted-foreground mb-4">
            {error.status}
          </h1>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {error.statusText || "Page Not Found"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {error.data?.message || "The page you're looking for doesn't exist."}
          </p>
          <button
            onClick={handleGoHome}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  // Handle chunk loading errors specifically
  if (isChunkError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-6 border">
          <h1 className="text-xl font-bold text-foreground mb-2">
            Update Available
          </h1>
          <p className="text-muted-foreground mb-4">
            A new version of the app is available. Please refresh to get the latest updates.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Refresh Page
            </button>
            <button
              onClick={handleGoHome}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Handle generic errors
  const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-6 border">
        <h1 className="text-xl font-bold text-foreground mb-2">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mb-4">
          {errorMessage}
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={handleGoHome}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
