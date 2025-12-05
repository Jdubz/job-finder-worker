import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { apiClient } from "@/api/base-client"

type GmailAccount = {
  userEmail: string
  gmailEmail: string
  updatedAt: string
  hasRefreshToken: boolean
  expiryDate?: number
  scopes?: string[]
  historyId?: string
}

type ConfigPayload = {
  enabled: boolean
  label?: string
  query?: string
  maxMessages?: number
  allowedSenders?: string[]
  allowedDomains?: string[]
  remoteSourceDefault?: boolean
  aiFallbackEnabled?: boolean
  defaultLabelOwner?: string | null
}

export function GmailIngestTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<GmailAccount[]>([])
  const [config, setConfig] = useState<ConfigPayload | null>(null)

  const allowedSenders = useMemo(
    () => (config?.allowedSenders ?? []).join(", "),
    [config?.allowedSenders]
  )
  const allowedDomains = useMemo(
    () => (config?.allowedDomains ?? []).join(", "),
    [config?.allowedDomains]
  )

  useEffect(() => {
    void loadConfig()
    void loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadConfig() {
    try {
      const res = await apiClient.get("/config/gmail-ingest")
      setConfig(res.data.config.payload as ConfigPayload)
    } catch (error) {
      toast({ title: "Failed to load Gmail config", description: String(error), variant: "destructive" })
    }
  }

  async function loadAccounts() {
    try {
      const res = await apiClient.get("/gmail/accounts")
      setAccounts(res.data.accounts as GmailAccount[])
    } catch (error) {
      toast({ title: "Failed to load linked inboxes", description: String(error), variant: "destructive" })
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

  const handleCsvChange = (field: "allowedSenders" | "allowedDomains", value: string) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            [field]: value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          }
        : prev
    )
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
              <Label htmlFor="query">Query</Label>
              <Input
                id="query"
                placeholder="newer_than:2d"
                value={config.query ?? ""}
                onChange={(e) => setConfig((c) => (c ? { ...c, query: e.target.value } : c))}
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="allowedSenders">Allowed senders (comma separated)</Label>
              <Input
                id="allowedSenders"
                placeholder="alerts@example.com, noreply@jobboard.com"
                value={allowedSenders}
                onChange={(e) => handleCsvChange("allowedSenders", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="allowedDomains">Allowed domains (comma separated)</Label>
              <Input
                id="allowedDomains"
                placeholder="greenhouse.io, lever.co"
                value={allowedDomains}
                onChange={(e) => handleCsvChange("allowedDomains", e.target.value)}
              />
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
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
