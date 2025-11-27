import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { ToastViewport } from "@/components/toast"
import { hydrateAppSnapshot } from "@/lib/restart-persistence"

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
