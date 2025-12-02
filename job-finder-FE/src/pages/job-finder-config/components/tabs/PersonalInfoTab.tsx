import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, User, Shield } from "lucide-react"
import type { PersonalInfo } from "@shared/types"

type PersonalInfoTabProps = {
  isSaving: boolean
  currentPersonalInfo: PersonalInfo
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
  const [uploading, setUploading] = useState<{ avatar: boolean; logo: boolean }>({ avatar: false, logo: false })
  const [uploadError, setUploadError] = useState<string | null>(null)

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

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleResetPersonalInfo} disabled={isSaving || !hasPersonalInfoChanges}>
            Reset
          </Button>
          <Button onClick={handleSavePersonalInfo} disabled={isSaving || !hasPersonalInfoChanges}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
