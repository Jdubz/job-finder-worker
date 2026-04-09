import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { EntityModalProvider } from "@/contexts/EntityModalContext"
import { router } from "@/router"
import { GoogleOAuthProvider } from "@react-oauth/google"
import ErrorBoundary from "@/components/error/ErrorBoundary"
import { RestartOverlay } from "@/components/system/RestartOverlay"
import { ChatWidget } from "@/components/chat-widget/ChatWidget"

function App() {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    throw new Error("VITE_GOOGLE_OAUTH_CLIENT_ID must be set for authentication.")
  }

  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={clientId}>
        <AuthProvider>
          <EntityModalProvider>
            <RestartOverlay />
            <RouterProvider router={router} />
            <ChatWidget />
          </EntityModalProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}

export default App
