import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useToast } from "@/components/ui/use-toast"
import { BaseApiClient } from "@/api/base-client"
import { API_CONFIG } from "@/config/api"
import { useAuth } from "@/contexts/AuthContext"
import { ROUTES } from "@/types/routes"

const apiClient = new BaseApiClient(() => API_CONFIG.baseUrl)

export function GmailOauthCallbackPage() {
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    const params = new URLSearchParams(location.search)
    const code = params.get("code")
    if (!code) {
      toast({ title: "Missing authorization code", variant: "destructive" })
      navigate(ROUTES.JOB_FINDER_CONFIG, { replace: true })
      return
    }

    if (!user?.email) {
      toast({ title: "Login required to finish Gmail auth", variant: "destructive" })
      navigate(ROUTES.LOGIN, { replace: true })
      return
    }

    const redirectUri = `${window.location.origin}${ROUTES.GMAIL_OAUTH_CALLBACK}`
    const gmailEmail = params.get("hd") || user.email || undefined
    const userEmail = user.email

    void apiClient
      .post("/gmail/oauth/exchange", { code, redirectUri, userEmail, gmailEmail })
      .then(() => {
        toast({ title: "Gmail authorized" })
        navigate(ROUTES.JOB_FINDER_CONFIG, { replace: true })
      })
      .catch((error: unknown) => {
        toast({ title: "Gmail auth failed", description: String(error), variant: "destructive" })
        navigate(ROUTES.JOB_FINDER_CONFIG, { replace: true })
      })
  }, [loading, location.search, navigate, toast, user?.email])

  return <p className="text-sm text-muted-foreground">Completing Gmail authorization…</p>
}
