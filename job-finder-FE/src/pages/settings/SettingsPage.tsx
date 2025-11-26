import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { usePersonalInfo } from "@/hooks/usePersonalInfo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Loader2, Save, User, Shield, Bell } from "lucide-react"
import type { PersonalInfo } from "@shared/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generatorClient } from "@/api"

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function SettingsPage() {
  const { user, isOwner } = useAuth()
  const {
    personalInfo,
    loading: isLoading,
    error: loadError,
    updatePersonalInfo,
  } = usePersonalInfo()

  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // User defaults state (mapped from PersonalInfo)
  const [userDefaults, setUserDefaults] = useState<Partial<PersonalInfo>>({
    name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: "",
    accentColor: "#3b82f6",
    avatar: "",
    logo: "",
  })
  const [originalDefaults, setOriginalDefaults] = useState<Partial<PersonalInfo>>({
    name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: "",
    accentColor: "#3b82f6",
    avatar: "",
    logo: "",
  })
  const [uploading, setUploading] = useState<{ avatar: boolean; logo: boolean }>({ avatar: false, logo: false })

  // Theme preference (stored in localStorage)
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system")

  // Load personal info into state when it changes
  useEffect(() => {
    if (personalInfo) {
        const defaults = {
          name: personalInfo.name || "",
          email: personalInfo.email || "",
          phone: personalInfo.phone || "",
          location: personalInfo.location || "",
          linkedin: personalInfo.linkedin || "",
          github: personalInfo.github || "",
          website: personalInfo.website || "",
          accentColor: personalInfo.accentColor || "#3b82f6",
          avatar: personalInfo.avatar || "",
          logo: personalInfo.logo || "",
        }
        setUserDefaults(defaults)
        setOriginalDefaults(defaults)
      }
  }, [personalInfo])

  // Set error from load error
  useEffect(() => {
    if (loadError) {
      setError(loadError.message)
    }
  }, [loadError])

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | "system" | null
    if (savedTheme) {
      setTheme(savedTheme)
      applyTheme(savedTheme)
    }
  }, [])

  const handleSaveDefaults = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updatePersonalInfo(userDefaults)
      setOriginalDefaults(userDefaults)
      setSuccess("Settings saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save settings")
      console.error("Error saving settings:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetDefaults = () => {
    setUserDefaults(originalDefaults)
    setError(null)
    setSuccess(null)
  }

  const applyTheme = (newTheme: "light" | "dark" | "system") => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    if (newTheme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(newTheme)
    }
  }

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme)
    localStorage.setItem("theme", newTheme)
    applyTheme(newTheme)
    setSuccess("Theme preference saved!")
    setTimeout(() => setSuccess(null), 3000)
  }

  const hasChanges = JSON.stringify(userDefaults) !== JSON.stringify(originalDefaults)

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your account preferences and default information
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Account Information */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>Account Information</CardTitle>
          </div>
          <CardDescription>Your account details and authentication status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-600">Email</Label>
              <p className="font-medium">{user?.email || "Not available"}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Email Verified</Label>
              <div>
                {user?.emailVerified ? (
                  <Badge variant="default" className="bg-green-500">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not Verified</Badge>
                )}
              </div>
            </div>
            <div>
              <Label className="text-sm text-gray-600">User ID</Label>
              <p className="font-mono text-xs text-gray-600">{user?.id || "Not available"}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Role</Label>
              <div>
                {isOwner ? (
                  <Badge variant="default" className="bg-blue-500">
                    <Shield className="h-3 w-3 mr-1" />
                    Editor
                  </Badge>
                ) : (
                  <Badge variant="secondary">User</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how the application looks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={theme}
              onValueChange={(value: "light" | "dark" | "system") => handleThemeChange(value)}
            >
              <SelectTrigger id="theme" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Choose your preferred color theme or use system preference
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Default Information */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Default Document Information</CardTitle>
              <CardDescription>
                Information used to pre-fill resume and cover letter generation
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetDefaults}
                disabled={!hasChanges || isSaving}
              >
                Reset
              </Button>
              <Button onClick={handleSaveDefaults} size="sm" disabled={!hasChanges || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={userDefaults.name}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={userDefaults.email}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={userDefaults.phone || ""}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                placeholder="(123) 456-7890"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={userDefaults.location || ""}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    location: e.target.value,
                  }))
                }
                placeholder="San Francisco, CA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input
                id="linkedin"
                value={userDefaults.linkedin || ""}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    linkedin: e.target.value,
                  }))
                }
                placeholder="linkedin.com/in/johndoe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="github">GitHub</Label>
              <Input
                id="github"
                value={userDefaults.github || ""}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    github: e.target.value,
                  }))
                }
                placeholder="github.com/johndoe"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={userDefaults.website || ""}
                onChange={(e) =>
                  setUserDefaults((prev: Partial<PersonalInfo>) => ({
                    ...prev,
                    website: e.target.value,
                  }))
                }
                placeholder="https://johndoe.com"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="accentColor">Accent Color (for document styling)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="accentColor"
                  type="color"
                  value={userDefaults.accentColor || "#3b82f6"}
                  onChange={(e) =>
                    setUserDefaults((prev: Partial<PersonalInfo>) => ({
                      ...prev,
                      accentColor: e.target.value,
                    }))
                  }
                  className="h-10 w-20"
                />
                <Input
                  type="text"
                  value={userDefaults.accentColor || "#3b82f6"}
                  onChange={(e) =>
                    setUserDefaults((prev: Partial<PersonalInfo>) => ({
                      ...prev,
                      accentColor: e.target.value,
                    }))
                  }
                  placeholder="#3b82f6"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-gray-500">
                Choose a color to personalize your resumes and cover letters
              </p>
            </div>

            <div className="space-y-3 col-span-2">
              <Label>Avatar</Label>
              <div className="flex items-center gap-4 p-3 border rounded-lg bg-gray-50">
                {userDefaults.avatar ? (
                  <img
                    src={
                      userDefaults.avatar.startsWith('http')
                        ? userDefaults.avatar
                        : `/api/generator/artifacts${userDefaults.avatar}`
                    }
                    alt="avatar"
                    className="h-14 w-14 rounded-full object-cover border shadow-sm"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center text-[11px] text-gray-500 border">
                    No avatar
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md bg-white shadow-sm cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        try {
                          setUploading((p) => ({ ...p, avatar: true }))
                          const dataUrl = await fileToDataUrl(file)
                          const res = await generatorClient.uploadAsset({ type: "avatar", dataUrl })

                          // Persist to backend and refresh defaults so the UI stays in sync
                          await updatePersonalInfo({ avatar: res.path })
                          setSuccess("Avatar uploaded")
                          setError(null)
                        } catch (err) {
                          console.error("Avatar upload failed", err)
                          setError("Failed to upload avatar")
                        } finally {
                          setUploading((p) => ({ ...p, avatar: false }))
                          e.target.value = ""
                        }
                      }}
                      disabled={uploading.avatar || isSaving}
                    />
                    {uploading.avatar ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    ) : (
                      <User className="h-4 w-4 text-gray-600" />
                    )}
                    {uploading.avatar ? 'Uploading…' : 'Upload image'}
                  </label>
                  <p className="text-xs text-gray-500">JPEG/PNG/SVG up to 2MB. Appears in resume header.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 col-span-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4 p-3 border rounded-lg bg-gray-50">
                {userDefaults.logo ? (
                  <img
                    src={
                      userDefaults.logo.startsWith('http')
                        ? userDefaults.logo
                        : `/api/generator/artifacts${userDefaults.logo}`
                    }
                    alt="logo"
                    className="h-12 w-12 object-contain border rounded bg-white p-1 shadow-sm"
                  />
                ) : (
                  <div className="h-12 w-12 border rounded bg-gray-100 flex items-center justify-center text-[11px] text-gray-500">No logo</div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md bg-white shadow-sm cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        try {
                          setUploading((p) => ({ ...p, logo: true }))
                          const dataUrl = await fileToDataUrl(file)
                          const res = await generatorClient.uploadAsset({ type: "logo", dataUrl })

                          await updatePersonalInfo({ logo: res.path })
                          setUserDefaults((prev) => ({ ...prev, logo: res.path }))
                          setSuccess("Logo uploaded")
                          setError(null)
                        } catch (err) {
                          console.error("Logo upload failed", err)
                          setError("Failed to upload logo")
                        } finally {
                          setUploading((p) => ({ ...p, logo: false }))
                          e.target.value = ""
                        }
                      }}
                      disabled={uploading.logo || isSaving}
                    />
                    {uploading.logo ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    ) : (
                      <Shield className="h-4 w-4 text-gray-600" />
                    )}
                    {uploading.logo ? 'Uploading…' : 'Upload image'}
                  </label>
                  <p className="text-xs text-gray-500">Use a square SVG/PNG. Shown in resume header/footer.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications (Placeholder for future) */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Manage your notification preferences (Coming soon)</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Email and in-app notification settings will be available in a future update.
          </p>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions that affect your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold">Delete Account</h4>
                <p className="text-sm text-gray-600">
                  Permanently delete your account and all associated data
                </p>
              </div>
              <Button variant="destructive" disabled>
                Delete Account
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Account deletion is not yet available. Please contact support if you need to delete
              your account.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
