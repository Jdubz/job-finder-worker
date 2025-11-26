import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { ConfigState } from "../../hooks/useConfigState"

type CompanyScoringTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "currentScoring"
  | "hasCompanyScoringChanges"
  | "updateCompanyScoringState"
  | "handleSaveCompanyScoring"
  | "handleResetCompanyScoring"
>

export function CompanyScoringTab({
  isSaving,
  currentScoring,
  hasCompanyScoringChanges,
  updateCompanyScoringState,
  handleSaveCompanyScoring,
  handleResetCompanyScoring,
}: CompanyScoringTabProps) {
  return (
    <TabsContent value="scoring" className="space-y-4 mt-4">
      <TabCard
        title="Company Scoring"
        description="Tier thresholds, priority bonuses, and score adjustments"
        hasChanges={hasCompanyScoringChanges}
        isSaving={isSaving}
        onSave={handleSaveCompanyScoring}
        onReset={handleResetCompanyScoring}
      >
        <div>
          <Label className="text-base font-semibold">Company Tier Thresholds</Label>
          <p className="text-xs text-muted-foreground mb-3">Points needed for each company tier classification</p>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tier-s">S-Tier</Label>
              <Input
                id="tier-s"
                type="number"
                min="0"
                value={currentScoring.tierThresholds.s}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    tierThresholds: { ...c.tierThresholds, s: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tier-a">A-Tier</Label>
              <Input
                id="tier-a"
                type="number"
                min="0"
                value={currentScoring.tierThresholds.a}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    tierThresholds: { ...c.tierThresholds, a: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tier-b">B-Tier</Label>
              <Input
                id="tier-b"
                type="number"
                min="0"
                value={currentScoring.tierThresholds.b}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    tierThresholds: { ...c.tierThresholds, b: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tier-c">C-Tier</Label>
              <Input
                id="tier-c"
                type="number"
                min="0"
                value={currentScoring.tierThresholds.c}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    tierThresholds: { ...c.tierThresholds, c: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Priority Bonuses</Label>
          <p className="text-xs text-muted-foreground mb-3">Points added to company priority score</p>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="portland-office">Portland Office</Label>
              <Input
                id="portland-office"
                type="number"
                value={currentScoring.priorityBonuses.portlandOffice}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    priorityBonuses: { ...c.priorityBonuses, portlandOffice: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remote-first">Remote First</Label>
              <Input
                id="remote-first"
                type="number"
                value={currentScoring.priorityBonuses.remoteFirst}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    priorityBonuses: { ...c.priorityBonuses, remoteFirst: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-ml-focus">AI/ML Focus</Label>
              <Input
                id="ai-ml-focus"
                type="number"
                value={currentScoring.priorityBonuses.aiMlFocus}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    priorityBonuses: { ...c.priorityBonuses, aiMlFocus: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tech-stack-max">Tech Stack Max</Label>
              <Input
                id="tech-stack-max"
                type="number"
                value={currentScoring.priorityBonuses.techStackMax}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    priorityBonuses: { ...c.priorityBonuses, techStackMax: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Match Score Adjustments</Label>
          <p className="text-xs text-muted-foreground mb-3">Score modifiers based on company size</p>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="large-bonus">Large Co. Bonus</Label>
              <Input
                id="large-bonus"
                type="number"
                value={currentScoring.matchAdjustments.largeCompanyBonus}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    matchAdjustments: { ...c.matchAdjustments, largeCompanyBonus: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="small-penalty">Small Co. Penalty</Label>
              <Input
                id="small-penalty"
                type="number"
                value={currentScoring.matchAdjustments.smallCompanyPenalty}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    matchAdjustments: { ...c.matchAdjustments, smallCompanyPenalty: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="large-threshold">Large Threshold</Label>
              <Input
                id="large-threshold"
                type="number"
                min="0"
                value={currentScoring.matchAdjustments.largeCompanyThreshold}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    matchAdjustments: { ...c.matchAdjustments, largeCompanyThreshold: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="small-threshold">Small Threshold</Label>
              <Input
                id="small-threshold"
                type="number"
                min="0"
                value={currentScoring.matchAdjustments.smallCompanyThreshold}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    matchAdjustments: { ...c.matchAdjustments, smallCompanyThreshold: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Timezone Adjustments</Label>
          <p className="text-xs text-muted-foreground mb-3">Score modifiers based on timezone difference</p>
          <div className="grid grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tz-same">Same TZ</Label>
              <Input
                id="tz-same"
                type="number"
                value={currentScoring.timezoneAdjustments.sameTimezone}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    timezoneAdjustments: { ...c.timezoneAdjustments, sameTimezone: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tz-1-2">1-2hr Diff</Label>
              <Input
                id="tz-1-2"
                type="number"
                value={currentScoring.timezoneAdjustments.diff1to2hr}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    timezoneAdjustments: { ...c.timezoneAdjustments, diff1to2hr: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tz-3-4">3-4hr Diff</Label>
              <Input
                id="tz-3-4"
                type="number"
                value={currentScoring.timezoneAdjustments.diff3to4hr}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    timezoneAdjustments: { ...c.timezoneAdjustments, diff3to4hr: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tz-5-8">5-8hr Diff</Label>
              <Input
                id="tz-5-8"
                type="number"
                value={currentScoring.timezoneAdjustments.diff5to8hr}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    timezoneAdjustments: { ...c.timezoneAdjustments, diff5to8hr: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tz-9plus">9+hr Diff</Label>
              <Input
                id="tz-9plus"
                type="number"
                value={currentScoring.timezoneAdjustments.diff9plusHr}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    timezoneAdjustments: { ...c.timezoneAdjustments, diff9plusHr: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Priority Thresholds</Label>
          <p className="text-xs text-muted-foreground mb-3">Match score thresholds for priority classification</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="priority-high">High Priority</Label>
              <Input
                id="priority-high"
                type="number"
                min="0"
                max="100"
                value={currentScoring.priorityThresholds.high}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    priorityThresholds: { ...c.priorityThresholds, high: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority-medium">Medium Priority</Label>
              <Input
                id="priority-medium"
                type="number"
                min="0"
                max="100"
                value={currentScoring.priorityThresholds.medium}
                onChange={(e) =>
                  updateCompanyScoringState((c) => ({
                    ...c,
                    priorityThresholds: { ...c.priorityThresholds, medium: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </div>
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
