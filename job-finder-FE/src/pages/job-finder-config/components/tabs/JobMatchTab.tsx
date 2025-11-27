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
import { Button } from "@/components/ui/button"
import { Loader2, Save, RotateCcw } from "lucide-react"
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
        showActions={false}
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

      <TabCard
        title="Company Influence Weights"
        description="Adjust how company attributes affect job match scores"
        hasChanges={hasJobMatchChanges}
        isSaving={isSaving}
        onSave={handleSaveJobMatch}
        onReset={handleResetJobMatch}
        showActions={false}
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="remoteFirstBonus">Remote-first Bonus</Label>
            <Input
              id="remoteFirstBonus"
              type="number"
              value={jobMatch?.companyWeights?.bonuses.remoteFirst ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          bonuses: {
                            ...prev.companyWeights?.bonuses,
                            remoteFirst: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aiMlFocusBonus">AI/ML Focus Bonus</Label>
            <Input
              id="aiMlFocusBonus"
              type="number"
              value={jobMatch?.companyWeights?.bonuses.aiMlFocus ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          bonuses: {
                            ...prev.companyWeights?.bonuses,
                            aiMlFocus: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="largeBonus">Large Company Bonus</Label>
            <Input
              id="largeBonus"
              type="number"
              value={jobMatch?.companyWeights?.sizeAdjustments.largeCompanyBonus ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          sizeAdjustments: {
                            ...prev.companyWeights?.sizeAdjustments,
                            largeCompanyBonus: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smallPenalty">Small Company Penalty</Label>
            <Input
              id="smallPenalty"
              type="number"
              value={jobMatch?.companyWeights?.sizeAdjustments.smallCompanyPenalty ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          sizeAdjustments: {
                            ...prev.companyWeights?.sizeAdjustments,
                            smallCompanyPenalty: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="largeThreshold">Large Threshold (employees)</Label>
            <Input
              id="largeThreshold"
              type="number"
              value={jobMatch?.companyWeights?.sizeAdjustments.largeCompanyThreshold ?? 10000}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          sizeAdjustments: {
                            ...prev.companyWeights?.sizeAdjustments,
                            largeCompanyThreshold: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smallThreshold">Small Threshold (employees)</Label>
            <Input
              id="smallThreshold"
              type="number"
              value={jobMatch?.companyWeights?.sizeAdjustments.smallCompanyThreshold ?? 100}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          sizeAdjustments: {
                            ...prev.companyWeights?.sizeAdjustments,
                            smallCompanyThreshold: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tzSame">Timezone Bonus (same)</Label>
            <Input
              id="tzSame"
              type="number"
              value={jobMatch?.companyWeights?.timezoneAdjustments.sameTimezone ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          timezoneAdjustments: {
                            ...prev.companyWeights?.timezoneAdjustments,
                            sameTimezone: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tz1to2">Timezone 1-2h</Label>
            <Input
              id="tz1to2"
              type="number"
              value={jobMatch?.companyWeights?.timezoneAdjustments.diff1to2hr ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          timezoneAdjustments: {
                            ...prev.companyWeights?.timezoneAdjustments,
                            diff1to2hr: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tz3to4">Timezone 3-4h</Label>
            <Input
              id="tz3to4"
              type="number"
              value={jobMatch?.companyWeights?.timezoneAdjustments.diff3to4hr ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          timezoneAdjustments: {
                            ...prev.companyWeights?.timezoneAdjustments,
                            diff3to4hr: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tz5to8">Timezone 5-8h</Label>
            <Input
              id="tz5to8"
              type="number"
              value={jobMatch?.companyWeights?.timezoneAdjustments.diff5to8hr ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          timezoneAdjustments: {
                            ...prev.companyWeights?.timezoneAdjustments,
                            diff5to8hr: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tz9plus">Timezone 9h+</Label>
            <Input
              id="tz9plus"
              type="number"
              value={jobMatch?.companyWeights?.timezoneAdjustments.diff9plusHr ?? 0}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          timezoneAdjustments: {
                            ...prev.companyWeights?.timezoneAdjustments,
                            diff9plusHr: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priorityHigh">High Priority Threshold</Label>
            <Input
              id="priorityHigh"
              type="number"
              value={jobMatch?.companyWeights?.priorityThresholds.high ?? 85}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          priorityThresholds: {
                            ...prev.companyWeights?.priorityThresholds,
                            high: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priorityMedium">Medium Priority Threshold</Label>
            <Input
              id="priorityMedium"
              type="number"
              value={jobMatch?.companyWeights?.priorityThresholds.medium ?? 70}
              onChange={(e) =>
                setJobMatch((prev) =>
                  prev
                    ? {
                        ...prev,
                        companyWeights: {
                          ...prev.companyWeights,
                          priorityThresholds: {
                            ...prev.companyWeights?.priorityThresholds,
                            medium: parseInt(e.target.value) || 0,
                          },
                        },
                      }
                    : null
                )
              }
            />
          </div>
        </div>
      </TabCard>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleResetJobMatch}
          disabled={!hasJobMatchChanges || isSaving}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
        <Button onClick={handleSaveJobMatch} disabled={!hasJobMatchChanges || isSaving}>
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
    </TabsContent>
  )
}
