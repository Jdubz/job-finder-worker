import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { ROUTES } from "@/types/routes"

interface PublicRouteProps {
  redirectIfAuthenticated?: boolean
  redirectTo?: string
}

export function PublicRoute({
  redirectIfAuthenticated = false,
  redirectTo = ROUTES.HOME,
}: PublicRouteProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (redirectIfAuthenticated && user) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
