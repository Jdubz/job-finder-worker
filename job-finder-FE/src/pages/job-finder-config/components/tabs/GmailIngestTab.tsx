import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { BaseApiClient } from "@/api/base-client"
import { API_CONFIG } from "@/config/api"
import { useAuth } from "@/contexts/AuthContext"
import { useGoogleLogin } from "@react-oauth/google"

type GmailAccount = {
  userEmail: string
  gmailEmail: string
  updatedAt: string
  hasRefreshToken: boolean
  expiryDate?: number
  scopes?: string[]
  historyId?: string
}

type IngestStatus = {
  lastSyncTime: string | null
  stats: {
    totalProcessed: number
    totalJobsFound: number
    totalJobsEnqueued: number
  }
}

type ConfigPayload = {
  enabled: boolean
  maxAgeDays?: number
  maxMessages?: number
  label?: string
  remoteSourceDefault?: boolean
  aiFallbackEnabled?: boolean
  defaultLabelOwner?: string | null
}

export function GmailIngestTab() {
  const { toast } = useToast()
  const apiClient = new BaseApiClient(() => API_CONFIG.baseUrl)
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<GmailAccount[]>([])
  const [config, setConfig] = useState<ConfigPayload | null>(null)
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    void loadConfig()
    void loadAccounts()
    void loadIngestStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadConfig() {
    try {
      const res = await apiClient.get<{ data: { config: { payload: ConfigPayload } } }>(
        "/config/gmail-ingest"
      )
      const payload = res.data.config.payload
      setConfig({
        maxAgeDays: payload.maxAgeDays ?? 7,
        maxMessages: payload.maxMessages ?? 50,
        enabled: payload.enabled,
        label: payload.label,
        remoteSourceDefault: payload.remoteSourceDefault,
        aiFallbackEnabled: payload.aiFallbackEnabled,
        defaultLabelOwner: payload.defaultLabelOwner ?? null,
      })
    } catch (error) {
      toast({ title: "Failed to load Gmail config", description: String(error), variant: "destructive" })
    }
  }

  async function loadAccounts() {
    try {
      const res = await apiClient.get<{ data: { accounts: GmailAccount[] } }>("/gmail/accounts")
      setAccounts(res.data.accounts)
    } catch (error) {
      toast({ title: "Failed to load linked inboxes", description: String(error), variant: "destructive" })
    }
  }

  async function loadIngestStatus() {
    try {
      const res = await apiClient.get<{ data: IngestStatus }>("/gmail/ingest/status")
      setIngestStatus(res.data)
    } catch {
      // Silently fail - status is optional/nice-to-have
      setIngestStatus(null)
    }
  }

  async function saveConfig() {
    if (!config) return
    setLoading(true)
    try {
      await apiClient.put("/config/gmail-ingest", { payload: config })
      toast({ title: "Saved Gmail ingest settings" })
    } catch (error) {
      toast({ title: "Save failed", description: String(error), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const startOAuth = useGoogleLogin({
    flow: "auth-code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    onSuccess: async (response) => {
      if (!user?.email) {
        toast({ title: "Login required", variant: "destructive" })
        return
      }
      try {
        await apiClient.post("/gmail/oauth/exchange", {
          code: response.code,
          redirectUri: "postmessage",
          userEmail: user.email,
          gmailEmail: user.email
        })
        toast({ title: "Gmail authorized" })
        await loadAccounts()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        toast({ title: "Gmail auth failed", description: message, variant: "destructive" })
      }
    },
    onError: (errorResponse) => {
      const message = errorResponse.error_description || errorResponse.error || "Authorization failed"
      toast({ title: "Gmail auth failed", description: message, variant: "destructive" })
    }
  })

  async function revokeAccount(gmailEmail: string) {
    setRevoking(gmailEmail)
    try {
      await apiClient.post(`/gmail/accounts/${encodeURIComponent(gmailEmail)}/revoke`)
      toast({ title: "Revoked Gmail access", description: gmailEmail })
      await loadAccounts()
    } catch (error) {
      toast({ title: "Revoke failed", description: String(error), variant: "destructive" })
    } finally {
      setRevoking(null)
    }
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading Gmail ingest config…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {ingestStatus && (
        <Card>
          <CardHeader>
            <CardTitle>Ingest Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Sync</p>
                <p className="text-lg font-semibold">
                  {ingestStatus.lastSyncTime
                    ? new Date(ingestStatus.lastSyncTime).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Emails Processed</p>
                <p className="text-lg font-semibold">{ingestStatus.stats.totalProcessed}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Jobs Found</p>
                <p className="text-lg font-semibold">{ingestStatus.stats.totalJobsFound}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Jobs Enqueued</p>
                <p className="text-lg font-semibold">{ingestStatus.stats.totalJobsEnqueued}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Gmail Ingest Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              id="gmail-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig((c) => (c ? { ...c, enabled: checked } : c))}
            />
            <Label htmlFor="gmail-enabled">Enable Gmail ingest</Label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                placeholder="job-alerts"
                value={config.label ?? ""}
                onChange={(e) => setConfig((c) => (c ? { ...c, label: e.target.value } : c))}
              />
            </div>
            <div>
              <Label htmlFor="maxAge">Look back (days)</Label>
              <Input
                id="maxAge"
                type="number"
                min={1}
                max={365}
                value={config.maxAgeDays ?? ""}
                onChange={(e) =>
                  setConfig((c) => (c ? { ...c, maxAgeDays: Number(e.target.value) } : c))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="maxMessages">Max messages per run</Label>
              <Input
                id="maxMessages"
                type="number"
                min={1}
                value={config.maxMessages ?? ""}
                onChange={(e) => setConfig((c) => (c ? { ...c, maxMessages: Number(e.target.value) } : c))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="remote-source"
                checked={config.remoteSourceDefault ?? false}
                onCheckedChange={(checked) => setConfig((c) => (c ? { ...c, remoteSourceDefault: checked } : c))}
              />
              <Label htmlFor="remote-source">Treat all as remote source</Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="aiFallback"
              checked={config.aiFallbackEnabled ?? false}
              onCheckedChange={(checked) => setConfig((c) => (c ? { ...c, aiFallbackEnabled: checked } : c))}
            />
            <Label htmlFor="aiFallback">Enable AI fallback parsing</Label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => startOAuth()} disabled={!user?.email}>
              Authorize Gmail
            </Button>
            <p className="text-xs text-muted-foreground">
              Uses your Google OAuth to grant read-only access for job alerts (offline access for cron).
            </p>
          </div>

          <Button onClick={saveConfig} disabled={loading}>
            {loading ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked Inboxes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length === 0 && <p className="text-sm text-muted-foreground">No inboxes linked yet.</p>}
          {accounts.map((acct) => (
            <div key={acct.gmailEmail} className="border rounded p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{acct.gmailEmail}</div>
                  <div className="text-xs text-muted-foreground">User: {acct.userEmail}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {acct.hasRefreshToken ? "Connected" : "Missing token"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Last update: {new Date(acct.updatedAt).toLocaleString()}
              </div>
              {acct.historyId && (
                <div className="text-xs text-muted-foreground">History ID: {acct.historyId}</div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={revoking === acct.gmailEmail}
                  onClick={() => revokeAccount(acct.gmailEmail)}
                >
                  {revoking === acct.gmailEmail ? "Revoking…" : "Revoke access"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
