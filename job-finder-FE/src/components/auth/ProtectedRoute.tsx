import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { ROUTES } from "@/types/routes"

interface ProtectedRouteProps {
  requireOwner?: boolean
  redirectTo?: string
  /** Where to send unauthenticated users (defaults to redirectTo). */
  unauthRedirectTo?: string
}

export function ProtectedRoute({
  requireOwner = false,
  redirectTo = ROUTES.UNAUTHORIZED,
  unauthRedirectTo,
}: ProtectedRouteProps) {
  const { user, loading, isOwner } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={unauthRedirectTo ?? redirectTo} replace />
  }

  if (requireOwner && !isOwner) {
    // Redirect to unauthorized page when not an owner
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />
  }

  return <Outlet />
}
