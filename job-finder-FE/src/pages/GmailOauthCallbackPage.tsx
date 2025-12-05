import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useToast } from "@/components/ui/use-toast"
import { apiClient } from "@/api/base-client"
import { useAuth } from "@/contexts/AuthContext"
import { ROUTES } from "@/types/routes"

export function GmailOauthCallbackPage() {
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const code = params.get("code")
    const _scope = params.get("scope") // informational only
    if (!code) {
      toast({ title: "Missing authorization code", variant: "destructive" })
      navigate(ROUTES.JOB_FINDER_CONFIG, { replace: true })
      return
    }

    const redirectUri = `${window.location.origin}${ROUTES.GMAIL_OAUTH_CALLBACK}`
    const gmailEmail = params.get("hd") || user?.email || undefined
    const userEmail = user?.email

    void apiClient
      .post("/gmail/oauth/exchange", { code, redirectUri, userEmail, gmailEmail })
      .then(() => {
        toast({ title: "Gmail authorized" })
        navigate(ROUTES.JOB_FINDER_CONFIG, { replace: true })
      })
      .catch((error) => {
        toast({ title: "Gmail auth failed", description: String(error), variant: "destructive" })
        navigate(ROUTES.JOB_FINDER_CONFIG, { replace: true })
      })
  }, [location.search, navigate, toast, user?.email])

  return <p className="text-sm text-muted-foreground">Completing Gmail authorization…</p>
}
