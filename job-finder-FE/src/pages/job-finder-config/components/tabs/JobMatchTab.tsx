import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabCard } from "../shared"
import type { JobMatchConfig } from "@shared/types"
import type { ConfigState } from "../../hooks/useConfigState"

type JobMatchTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "jobMatch"
  | "setJobMatch"
  | "hasJobMatchChanges"
  | "handleSaveJobMatch"
  | "handleResetJobMatch"
>

export function JobMatchTab({
  isSaving,
  jobMatch,
  setJobMatch,
  hasJobMatchChanges,
  handleSaveJobMatch,
  handleResetJobMatch,
}: JobMatchTabProps) {
  return (
    <TabsContent value="job-match" className="space-y-4 mt-4">
      <TabCard
        title="Job Match Configuration"
        description="Configure job matching thresholds and scoring preferences"
        hasChanges={hasJobMatchChanges}
        isSaving={isSaving}
        onSave={handleSaveJobMatch}
        onReset={handleResetJobMatch}
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="minMatchScore">Minimum Match Score</Label>
            <Input
              id="minMatchScore"
              type="number"
              min="0"
              max="100"
              value={jobMatch?.minMatchScore ?? 70}
              onChange={(e) =>
                setJobMatch((prev: JobMatchConfig | null) =>
                  prev ? { ...prev, minMatchScore: parseInt(e.target.value) || 70 } : null
                )
              }
            />
            <p className="text-xs text-gray-500">
              Minimum score required to create a job match (0-100)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="generateIntake">Generate Intake Data</Label>
            <Select
              value={jobMatch?.generateIntakeData ? "yes" : "no"}
              onValueChange={(value) =>
                setJobMatch((prev: JobMatchConfig | null) =>
                  prev ? { ...prev, generateIntakeData: value === "yes" } : null
                )
              }
            >
              <SelectTrigger id="generateIntake">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Generate resume intake data for matches</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="portlandBonus">Portland Office Bonus</Label>
            <Input
              id="portlandBonus"
              type="number"
              value={jobMatch?.portlandOfficeBonus ?? 15}
              onChange={(e) =>
                setJobMatch((prev: JobMatchConfig | null) =>
                  prev
                    ? { ...prev, portlandOfficeBonus: parseInt(e.target.value) || 0 }
                    : null
                )
              }
            />
            <p className="text-xs text-gray-500">Bonus points for Portland office jobs</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="userTimezone">User Timezone Offset</Label>
            <Input
              id="userTimezone"
              type="number"
              step="0.5"
              value={jobMatch?.userTimezone ?? -8}
              onChange={(e) =>
                setJobMatch((prev: JobMatchConfig | null) =>
                  prev
                    ? { ...prev, userTimezone: parseFloat(e.target.value) }
                    : null
                )
              }
            />
            <p className="text-xs text-gray-500">Offset from UTC (e.g., -8 for PST)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferLarge">Prefer Large Companies</Label>
            <Select
              value={jobMatch?.preferLargeCompanies ? "yes" : "no"}
              onValueChange={(value) =>
                setJobMatch((prev: JobMatchConfig | null) =>
                  prev ? { ...prev, preferLargeCompanies: value === "yes" } : null
                )
              }
            >
              <SelectTrigger id="preferLarge">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Apply scoring bonus for larger companies</p>
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
