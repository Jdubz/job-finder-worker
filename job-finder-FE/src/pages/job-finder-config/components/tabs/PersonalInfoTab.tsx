import { useState, useEffect, useCallback } from "react"
import { useGoogleLogin } from "@react-oauth/google"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, User, Shield, Mail, Trash2, RefreshCw } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { gmailClient, type GmailAccountInfo, type TrackerScanResult } from "@/api/gmail-client"
import type { PersonalInfo } from "@shared/types"


type PersonalInfoTabProps = {
  isSaving: boolean
  currentPersonalInfo: PersonalInfo | null
  hasPersonalInfoChanges: boolean
  updatePersonalInfoState: (updates: Partial<PersonalInfo>) => void
  handleSavePersonalInfo: () => Promise<void> | void
  handleResetPersonalInfo: () => void
}

export function PersonalInfoTab({
  isSaving,
  currentPersonalInfo,
  hasPersonalInfoChanges,
  updatePersonalInfoState,
  handleSavePersonalInfo,
  handleResetPersonalInfo,
}: PersonalInfoTabProps) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState<{ avatar: boolean; logo: boolean }>({ avatar: false, logo: false })
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Gmail state
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccountInfo[]>([])
  const [gmailLoading, setGmailLoading] = useState(true)
  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [gmailRevoking, setGmailRevoking] = useState<string | null>(null)
  const [gmailScanning, setGmailScanning] = useState(false)
  const [gmailScanResults, setGmailScanResults] = useState<TrackerScanResult[] | null>(null)
  const [gmailError, setGmailError] = useState<string | null>(null)
  const [gmailSuccess, setGmailSuccess] = useState<string | null>(null)

  const fetchGmailAccounts = useCallback(async () => {
    setGmailError(null)
    try {
      const data = await gmailClient.listAccounts()
      setGmailAccounts(data)
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : "Failed to load Gmail accounts")
    } finally {
      setGmailLoading(false)
    }
  }, [])

  useEffect(() => { fetchGmailAccounts() }, [fetchGmailAccounts])

  useEffect(() => {
    if (!gmailSuccess) return
    const t = setTimeout(() => setGmailSuccess(null), 5000)
    return () => clearTimeout(t)
  }, [gmailSuccess])

  const connectGmail = useGoogleLogin({
    flow: "auth-code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    onSuccess: async (codeResponse) => {
      if (!user?.email) return
      setGmailConnecting(true)
      setGmailError(null)
      try {
        const result = await gmailClient.exchangeOAuthCode({
          code: codeResponse.code,
          redirectUri: "postmessage",
          userEmail: user.email,
        })
        setGmailSuccess(`Connected ${result.gmailEmail}`)
        await fetchGmailAccounts()
      } catch (err) {
        setGmailError(err instanceof Error ? err.message : "Failed to connect Gmail")
      } finally {
        setGmailConnecting(false)
      }
    },
    onError: (errorResponse) => {
      if (errorResponse.error === "access_denied") return
      setGmailError(errorResponse.error_description ?? "Gmail authorization failed")
    },
  })

  const handleGmailRevoke = async (gmailEmail: string) => {
    setGmailRevoking(gmailEmail)
    setGmailError(null)
    try {
      await gmailClient.revokeAccount(gmailEmail)
      setGmailSuccess(`Disconnected ${gmailEmail}`)
      await fetchGmailAccounts()
    } catch {
      setGmailError(`Failed to disconnect ${gmailEmail}`)
    } finally {
      setGmailRevoking(null)
    }
  }

  const handleGmailScan = async () => {
    setGmailScanning(true)
    setGmailError(null)
    setGmailScanResults(null)
    try {
      const results = await gmailClient.triggerScan({ days: 90 })
      setGmailScanResults(results)
      const total = results.reduce((s, r) => s + r.emailsProcessed, 0)
      const linked = results.reduce((s, r) => s + r.emailsLinked, 0)
      setGmailSuccess(`Scan complete: ${total} emails processed, ${linked} linked`)
    } catch {
      setGmailError("Email scan failed")
    } finally {
      setGmailScanning(false)
    }
  }

  if (!currentPersonalInfo) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertDescription>
              The personal-info configuration is not set in the database. Please add it before using this feature.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const fileToDataUrl = async (file: File) => {
    const reader = new FileReader()
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    return dataUrl
  }

  const resizeDataUrl = async (dataUrl: string, maxDimension: number) => {
    return new Promise<string>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("Canvas unavailable"))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const mimeMatch = dataUrl.match(/^data:(.*?);base64,/)
        const mime = mimeMatch?.[1] || "image/png"
        const outputMime = mime.includes("png") || mime.includes("svg") ? mime : "image/jpeg"
        const compressed = canvas.toDataURL(outputMime, outputMime === "image/png" ? undefined : 0.88)
        resolve(compressed)
      }
      img.onerror = reject
      img.src = dataUrl
    })
  }

  const handleImageChange = (type: "avatar" | "logo", maxDimension: number) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploadError(null)
      try {
        setUploading((p) => ({ ...p, [type]: true }))
        const raw = await fileToDataUrl(file)
        const resized = await resizeDataUrl(raw, maxDimension)
        updatePersonalInfoState({ [type]: resized })
      } catch (err) {
        console.error(`${type} upload failed`, err)
        setUploadError(`Failed to upload ${type === "avatar" ? "avatar" : "logo"}. Please try another image.`)
      } finally {
        setUploading((p) => ({ ...p, [type]: false }))
        e.target.value = ""
      }
    }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Personal Info</CardTitle>
        <CardDescription>
          Set the default personal details used when generating resumes and cover letters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {uploadError && (
          <Alert variant="destructive">
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Your name"
              value={currentPersonalInfo.name}
              onChange={(e) => updatePersonalInfoState({ name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={currentPersonalInfo.email}
              onChange={(e) => updatePersonalInfoState({ email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="City"
              value={currentPersonalInfo.city ?? ""}
              onChange={(e) => updatePersonalInfoState({ city: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone Offset</Label>
            <Input
              id="timezone"
              type="number"
              step="0.5"
              placeholder="e.g. -8"
              min={-12}
              max={14}
              value={currentPersonalInfo.timezone ?? ""}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === "") {
                  updatePersonalInfoState({ timezone: undefined })
                  return
                }
                const val = Number(raw)
                const clamped = Math.max(-12, Math.min(14, val))
                updatePersonalInfoState({ timezone: clamped })
              }}
            />
            <p className="text-sm text-muted-foreground">
              UTC offset in hours (e.g., -8 for PST, -5 for EST)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="relocationAllowed">Relocation Allowed</Label>
            <div className="flex items-center gap-2">
              <Input
                id="relocationAllowed"
                type="checkbox"
                className="h-4 w-4"
                checked={currentPersonalInfo.relocationAllowed ?? false}
                onChange={(e) => updatePersonalInfoState({ relocationAllowed: e.target.checked })}
              />
              <span className="text-sm text-muted-foreground">Willing to relocate for onsite/hybrid</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="(555) 123-4567"
              value={currentPersonalInfo.phone ?? ""}
              onChange={(e) => updatePersonalInfoState({ phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="City, State"
              value={currentPersonalInfo.location ?? ""}
              onChange={(e) => updatePersonalInfoState({ location: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              placeholder="https://your-site.com"
              value={currentPersonalInfo.website ?? ""}
              onChange={(e) => updatePersonalInfoState({ website: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn</Label>
            <Input
              id="linkedin"
              placeholder="https://linkedin.com/in/you"
              value={currentPersonalInfo.linkedin ?? ""}
              onChange={(e) => updatePersonalInfoState({ linkedin: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="github">GitHub</Label>
            <Input
              id="github"
              placeholder="https://github.com/you"
              value={currentPersonalInfo.github ?? ""}
              onChange={(e) => updatePersonalInfoState({ github: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accentColor">Accent Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="accentColor"
                type="color"
                className="w-20 p-1"
                value={currentPersonalInfo.accentColor ?? "#3b82f6"}
                onChange={(e) => updatePersonalInfoState({ accentColor: e.target.value })}
              />
              <Input
                value={currentPersonalInfo.accentColor ?? "#3b82f6"}
                onChange={(e) => updatePersonalInfoState({ accentColor: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="summary">Headline / Summary</Label>
          <Textarea
            id="summary"
            placeholder="Brief professional summary"
            value={currentPersonalInfo.summary ?? ""}
            onChange={(e) => updatePersonalInfoState({ summary: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Avatar</Label>
            <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/40">
              {currentPersonalInfo.avatar ? (
                <img
                  src={currentPersonalInfo.avatar}
                  alt="avatar"
                  className="h-14 w-14 rounded-full object-cover border shadow-sm"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-[11px] text-muted-foreground border">
                  No avatar
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md bg-background shadow-sm cursor-pointer text-sm font-medium text-foreground hover:bg-muted">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange("avatar", 512)}
                  disabled={uploading.avatar || isSaving}
                />
                {uploading.avatar ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
                {uploading.avatar ? "Uploading…" : "Upload image"}
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Logo</Label>
            <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/40">
              {currentPersonalInfo.logo ? (
                <img
                  src={currentPersonalInfo.logo}
                  alt="logo"
                  className="h-12 w-12 object-contain border rounded bg-background p-1 shadow-sm"
                />
              ) : (
                <div className="h-12 w-12 border rounded bg-muted flex items-center justify-center text-[11px] text-muted-foreground">
                  No logo
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md bg-background shadow-sm cursor-pointer text-sm font-medium text-foreground hover:bg-muted">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange("logo", 640)}
                  disabled={uploading.logo || isSaving}
                />
                {uploading.logo ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Shield className="h-4 w-4 text-muted-foreground" />
                )}
                {uploading.logo ? "Uploading…" : "Upload image"}
              </label>
            </div>
          </div>
        </div>

        {/* Application / EEO Info Section */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex gap-3 items-start">
            <div className="rounded-full bg-muted p-2">
              <Shield className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-medium">Application Information</h3>
              <p className="text-sm text-muted-foreground">
                Free-form text (markdown ok) for EEO and other application disclosures. Required for profile generation.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicationInfo">Application Info (required)</Label>
            <Textarea
              id="applicationInfo"
              rows={6}
              value={currentPersonalInfo.applicationInfo || ""}
              onChange={(e) => updatePersonalInfoState({ applicationInfo: e.target.value })}
              placeholder={
                "Gender: Non-binary\nRace: Latinx\nVeteran Status: Not a protected veteran\nWork Authorization: US Citizen"
              }
            />
            <p className="text-xs text-muted-foreground">
              Required free-text used for application/EEO disclosures; renderer inserts it verbatim.
            </p>
          </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleResetPersonalInfo} disabled={isSaving || !hasPersonalInfoChanges}>
            Reset
          </Button>
          <Button onClick={handleSavePersonalInfo} disabled={isSaving || !hasPersonalInfoChanges}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
        </div>

        {/* Gmail Integration */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 items-start">
              <div className="rounded-full bg-muted p-2">
                <Mail className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-medium">Gmail Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Connect Gmail to automatically track application status from emails.
                  Only read access is requested.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {gmailAccounts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGmailScan}
                  disabled={gmailScanning}
                  aria-label="Scan all Gmail accounts for application emails"
                >
                  {gmailScanning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Scan
                    </>
                  )}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => connectGmail()}
                disabled={gmailConnecting || gmailLoading}
              >
                {gmailConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Connect Gmail
                  </>
                )}
              </Button>
            </div>
          </div>

          {gmailError && (
            <Alert variant="destructive">
              <AlertDescription>{gmailError}</AlertDescription>
            </Alert>
          )}
          {gmailSuccess && (
            <Alert>
              <AlertDescription>{gmailSuccess}</AlertDescription>
            </Alert>
          )}

          {gmailLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading accounts…
            </div>
          ) : gmailAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Gmail accounts connected.
            </p>
          ) : (
            <div className="space-y-2">
              {gmailAccounts.map((account) => (
                <div
                  key={account.gmailEmail}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{account.gmailEmail}</span>
                      {account.hasRefreshToken ? (
                        <Badge variant="default" className="bg-green-600">Connected</Badge>
                      ) : (
                        <Badge variant="destructive">Token expired</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(account.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGmailRevoke(account.gmailEmail)}
                    disabled={gmailRevoking === account.gmailEmail}
                    aria-label={`Disconnect ${account.gmailEmail}`}
                  >
                    {gmailRevoking === account.gmailEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {gmailScanResults && gmailScanResults.length > 0 && (
            <div className="space-y-2">
              {gmailScanResults.map((result) => (
                <div key={result.gmailEmail} className="rounded-md border p-3 text-sm">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Processed: {result.emailsProcessed}</span>
                    <span>Linked: {result.emailsLinked}</span>
                    <span>Status changes: {result.statusChanges}</span>
                  </div>
                  {result.errors.length > 0 && (
                    <p className="text-xs text-destructive mt-1">{result.errors.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
