import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ToastViewport } from "@/components/toast"
import { hydrateAppSnapshot } from "@/lib/restart-persistence"
import { installOAuthCancellationGuard } from "@/lib/oauth-cancellation-guard"

// Swallow known OAuth cancellation errors (e.g. popup_closed_by_user) so the UI doesn't crash
installOAuthCancellationGuard()

hydrateAppSnapshot()

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Root element not found")
}

createRoot(rootElement).render(
  <StrictMode>
    <ToastViewport />
    <App />
  </StrictMode>
)
