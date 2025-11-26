import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { router } from "@/router"
import { GoogleOAuthProvider } from "@react-oauth/google"
import ErrorBoundary from "@/components/error/ErrorBoundary"

function App() {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    throw new Error("VITE_GOOGLE_OAUTH_CLIENT_ID must be set for authentication.")
  }

  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={clientId}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}

export default App
