import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Personal Info</CardTitle>
        <CardDescription>
          Set the default personal details used when generating resumes and cover letters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
