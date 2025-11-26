import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { TabCard, StringListEditor, SeniorityStrikesEditor } from "../shared"
import { DEFAULT_JOB_FILTERS } from "@shared/types"
import type { ConfigState } from "../../hooks/useConfigState"

type JobFiltersTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "currentJobFilters"
  | "hasJobFilterChanges"
  | "updateJobFiltersState"
  | "handleSaveJobFilters"
  | "handleResetJobFilters"
>

export function JobFiltersTab({
  isSaving,
  currentJobFilters,
  hasJobFilterChanges,
  updateJobFiltersState,
  handleSaveJobFilters,
  handleResetJobFilters,
}: JobFiltersTabProps) {
  const hardRejections = currentJobFilters.hardRejections ?? DEFAULT_JOB_FILTERS.hardRejections
  const remotePolicy = currentJobFilters.remotePolicy ?? DEFAULT_JOB_FILTERS.remotePolicy
  const salaryStrike = currentJobFilters.salaryStrike ?? DEFAULT_JOB_FILTERS.salaryStrike
  const experienceStrike = currentJobFilters.experienceStrike ?? DEFAULT_JOB_FILTERS.experienceStrike
  const qualityStrikes = currentJobFilters.qualityStrikes ?? DEFAULT_JOB_FILTERS.qualityStrikes
  const ageStrike = currentJobFilters.ageStrike ?? DEFAULT_JOB_FILTERS.ageStrike

  return (
    <TabsContent value="filters" className="space-y-4 mt-4">
      <TabCard
        title="Job Filters"
        description="Strike rules and hard rejections used by the worker"
        hasChanges={hasJobFilterChanges}
        isSaving={isSaving}
        onSave={handleSaveJobFilters}
        onReset={handleResetJobFilters}
      >
        <div className="grid grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="filters-enabled"
              checked={currentJobFilters.enabled}
              onCheckedChange={(checked) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  enabled: checked === true,
                }))
              }
            />
            <div>
              <Label htmlFor="filters-enabled">Filtering Enabled</Label>
              <p className="text-xs text-gray-500">
                Toggle strike-based filtering for incoming jobs.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="strike-threshold">Strike Threshold</Label>
            <Input
              id="strike-threshold"
              type="number"
              min="1"
              value={currentJobFilters.strikeThreshold}
              onChange={(e) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  strikeThreshold: parseInt(e.target.value) || 0,
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Total strikes allowed before a job is rejected.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <StringListEditor
            label="Excluded Job Types"
            values={hardRejections.excludedJobTypes ?? []}
            placeholder="sales, hr, recruiter..."
            description="Hard reject if the title matches any of these types."
            onChange={(values) =>
              updateJobFiltersState((current) => ({
                ...current,
                hardRejections: { ...current.hardRejections, excludedJobTypes: values },
              }))
            }
          />
          <StringListEditor
            label="Excluded Seniority"
            values={hardRejections.excludedSeniority ?? []}
            placeholder="junior, entry-level..."
            description="Hard reject titles that include these seniority levels."
            onChange={(values) =>
              updateJobFiltersState((current) => ({
                ...current,
                hardRejections: { ...current.hardRejections, excludedSeniority: values },
              }))
            }
          />
          <StringListEditor
            label="Excluded Companies"
            values={hardRejections.excludedCompanies ?? []}
            placeholder="Companies to avoid..."
            onChange={(values) =>
              updateJobFiltersState((current) => ({
                ...current,
                hardRejections: { ...current.hardRejections, excludedCompanies: values },
              }))
            }
          />
          <StringListEditor
            label="Excluded Keywords"
            values={hardRejections.excludedKeywords ?? []}
            placeholder="clearance required, relocation..."
            onChange={(values) =>
              updateJobFiltersState((current) => ({
                ...current,
                hardRejections: { ...current.hardRejections, excludedKeywords: values },
              }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="min-salary-floor">Minimum Salary Floor</Label>
            <Input
              id="min-salary-floor"
              type="number"
              min="0"
              value={hardRejections.minSalaryFloor ?? 0}
              onChange={(e) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  hardRejections: {
                    ...current.hardRejections,
                    minSalaryFloor: parseInt(e.target.value) || 0,
                  },
                }))
              }
            />
            <p className="text-xs text-gray-500">
              Hard reject roles with salary below this floor (if parsed).
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="reject-commission"
              checked={hardRejections.rejectCommissionOnly ?? true}
              onCheckedChange={(checked) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  hardRejections: {
                    ...current.hardRejections,
                    rejectCommissionOnly: checked === true,
                  },
                }))
              }
            />
            <div>
              <Label htmlFor="reject-commission">Reject commission-only roles</Label>
              <p className="text-xs text-gray-500">
                Hard reject when the description mentions commission-only compensation.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-remote"
              checked={remotePolicy.allowRemote ?? true}
              onCheckedChange={(checked) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  remotePolicy: {
                    ...current.remotePolicy,
                    allowRemote: checked === true,
                  },
                }))
              }
            />
            <Label htmlFor="allow-remote" className="cursor-pointer">
              Allow Remote
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-hybrid"
              checked={remotePolicy.allowHybridPortland ?? true}
              onCheckedChange={(checked) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  remotePolicy: {
                    ...current.remotePolicy,
                    allowHybridPortland: checked === true,
                  },
                }))
              }
            />
            <Label htmlFor="allow-hybrid" className="cursor-pointer">
              Allow Hybrid (Portland)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-onsite"
              checked={remotePolicy.allowOnsite ?? false}
              onCheckedChange={(checked) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  remotePolicy: {
                    ...current.remotePolicy,
                    allowOnsite: checked === true,
                  },
                }))
              }
            />
            <Label htmlFor="allow-onsite" className="cursor-pointer">
              Allow Onsite
            </Label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="salary-strike-enabled"
                checked={salaryStrike.enabled ?? true}
                onCheckedChange={(checked) =>
                  updateJobFiltersState((current) => ({
                    ...current,
                    salaryStrike: {
                      ...current.salaryStrike,
                      enabled: checked === true,
                    },
                  }))
                }
              />
              <Label htmlFor="salary-strike-enabled" className="cursor-pointer">
                Salary Strike
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="salary-threshold">Threshold ($)</Label>
                <Input
                  id="salary-threshold"
                  type="number"
                  min="0"
                  value={salaryStrike.threshold ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      salaryStrike: {
                        ...current.salaryStrike,
                        threshold: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary-points">Points</Label>
                <Input
                  id="salary-points"
                  type="number"
                  min="0"
                  value={salaryStrike.points ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      salaryStrike: {
                        ...current.salaryStrike,
                        points: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="experience-strike-enabled"
                checked={experienceStrike.enabled ?? true}
                onCheckedChange={(checked) =>
                  updateJobFiltersState((current) => ({
                    ...current,
                    experienceStrike: {
                      ...current.experienceStrike,
                      enabled: checked === true,
                    },
                  }))
                }
              />
              <Label htmlFor="experience-strike-enabled" className="cursor-pointer">
                Experience Strike
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-preferred">Min Preferred Years</Label>
                <Input
                  id="min-preferred"
                  type="number"
                  min="0"
                  value={experienceStrike.minPreferred ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      experienceStrike: {
                        ...current.experienceStrike,
                        minPreferred: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="experience-points">Points</Label>
                <Input
                  id="experience-points"
                  type="number"
                  min="0"
                  value={experienceStrike.points ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      experienceStrike: {
                        ...current.experienceStrike,
                        points: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <SeniorityStrikesEditor
          strikes={currentJobFilters.seniorityStrikes ?? {}}
          onChange={(next) =>
            updateJobFiltersState((current) => ({
              ...current,
              seniorityStrikes: next,
            }))
          }
        />

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Quality Strikes</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-desc-length">Min Description Length</Label>
                <Input
                  id="min-desc-length"
                  type="number"
                  min="0"
                  value={qualityStrikes.minDescriptionLength ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      qualityStrikes: {
                        ...current.qualityStrikes,
                        minDescriptionLength: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="short-desc-points">Short Description Points</Label>
                <Input
                  id="short-desc-points"
                  type="number"
                  min="0"
                  value={qualityStrikes.shortDescriptionPoints ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      qualityStrikes: {
                        ...current.qualityStrikes,
                        shortDescriptionPoints: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buzzword-points">Buzzword Points</Label>
                <Input
                  id="buzzword-points"
                  type="number"
                  min="0"
                  value={qualityStrikes.buzzwordPoints ?? 0}
                  onChange={(e) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      qualityStrikes: {
                        ...current.qualityStrikes,
                        buzzwordPoints: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <StringListEditor
            label="Buzzwords"
            values={qualityStrikes.buzzwords ?? []}
            placeholder="rockstar, ninja, 10x..."
            onChange={(values) =>
              updateJobFiltersState((current) => ({
                ...current,
                qualityStrikes: { ...current.qualityStrikes, buzzwords: values },
              }))
            }
          />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="age-strike-enabled"
              checked={ageStrike.enabled ?? true}
              onCheckedChange={(checked) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  ageStrike: { ...current.ageStrike, enabled: checked === true },
                }))
              }
            />
            <Label htmlFor="age-strike-enabled" className="cursor-pointer">
              Age Strike
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="age-strike-days">Strike After (days)</Label>
            <Input
              id="age-strike-days"
              type="number"
              min="0"
              value={ageStrike.strikeDays ?? 0}
              onChange={(e) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  ageStrike: {
                    ...current.ageStrike,
                    strikeDays: parseInt(e.target.value) || 0,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="age-reject-days">Hard Reject After (days)</Label>
            <Input
              id="age-reject-days"
              type="number"
              min="0"
              value={ageStrike.rejectDays ?? 0}
              onChange={(e) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  ageStrike: {
                    ...current.ageStrike,
                    rejectDays: parseInt(e.target.value) || 0,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="age-strike-points">Points</Label>
            <Input
              id="age-strike-points"
              type="number"
              min="0"
              value={ageStrike.points ?? 0}
              onChange={(e) =>
                updateJobFiltersState((current) => ({
                  ...current,
                  ageStrike: {
                    ...current.ageStrike,
                    points: parseInt(e.target.value) || 0,
                  },
                }))
              }
            />
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
