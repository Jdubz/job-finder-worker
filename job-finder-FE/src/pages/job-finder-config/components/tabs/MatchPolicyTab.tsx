import { useEffect, useMemo } from "react"
import { useForm, useFieldArray, Controller } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import {
  Form,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TabCard } from "../shared"
import {
  CheckboxRow,
  NumericField,
  StringListField,
  TextInputField,
} from "../shared/form-fields"
import type { MatchPolicy, CompanyMatchWeights, MatchDealbreakers } from "@shared/types"
import { DEFAULT_MATCH_POLICY } from "@shared/types"
import { Plus, Trash2 } from "lucide-react"

type TechPreferenceFormValue = { name: string; weight: number | null }

type MatchFormValues = {
  version?: string | null
  updatedBy?: string | null
  jobMatch: MatchPolicy["jobMatch"]
  companyWeights: CompanyMatchWeights
  dealbreakers: MatchDealbreakers
  techPreferences: TechPreferenceFormValue[]
}

type MatchPolicyTabProps = {
  isSaving: boolean
  policy: MatchPolicy
  onSave: (policy: MatchPolicy) => Promise<void> | void
  onReset: () => MatchPolicy
}

const ImpactBadge = ({ label, tone = "neutral" }: { label: string; tone?: "positive" | "negative" | "neutral" }) => {
  const toneClasses = useMemo(() => {
    switch (tone) {
      case "positive":
        return "bg-emerald-50 text-emerald-700 border-emerald-100"
      case "negative":
        return "bg-rose-50 text-rose-700 border-rose-100"
      default:
        return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }, [tone])

  return <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0.5 ${toneClasses}`}>{label}</Badge>
}

const numberOrUndefined = (value?: number | null) =>
  value === null || value === undefined || Number.isNaN(value) ? undefined : Number(value)

const cleanList = (items: string[]) => items.map((item) => item.trim()).filter(Boolean)

const mapPolicyToForm = (policy: MatchPolicy): MatchFormValues => {
  const merged: MatchPolicy = {
    ...DEFAULT_MATCH_POLICY,
    ...policy,
    jobMatch: {
      ...DEFAULT_MATCH_POLICY.jobMatch,
      ...policy.jobMatch,
    },
    companyWeights: {
      ...DEFAULT_MATCH_POLICY.companyWeights,
      ...policy.companyWeights,
      bonuses: {
        ...DEFAULT_MATCH_POLICY.companyWeights.bonuses,
        ...policy.companyWeights?.bonuses,
      },
      sizeAdjustments: {
        ...DEFAULT_MATCH_POLICY.companyWeights.sizeAdjustments,
        ...policy.companyWeights?.sizeAdjustments,
      },
      timezoneAdjustments: {
        ...DEFAULT_MATCH_POLICY.companyWeights.timezoneAdjustments,
        ...policy.companyWeights?.timezoneAdjustments,
      },
      priorityThresholds: {
        ...DEFAULT_MATCH_POLICY.companyWeights.priorityThresholds,
        ...policy.companyWeights?.priorityThresholds,
      },
    },
    dealbreakers: {
      ...DEFAULT_MATCH_POLICY.dealbreakers,
      ...policy.dealbreakers,
    },
  }

  return {
    version: merged.version ?? "",
    updatedBy: merged.updatedBy ?? "",
    jobMatch: merged.jobMatch,
    companyWeights: merged.companyWeights,
    dealbreakers: {
      ...merged.dealbreakers,
      blockedLocations: merged.dealbreakers.blockedLocations ?? [],
    },
    techPreferences: Object.entries(merged.techPreferences ?? {}).map(([name, weight]) => ({
      name,
      weight,
    })),
  }
}

const mapFormToPolicy = (values: MatchFormValues): MatchPolicy => {
  const techPreferences = values.techPreferences.reduce<Record<string, number>>((acc, cur) => {
    const name = cur.name.trim()
    const weight = numberOrUndefined(cur.weight)
    if (name && weight !== undefined) acc[name] = weight
    return acc
  }, {})

  return {
    jobMatch: {
      ...values.jobMatch,
    },
    companyWeights: {
      ...values.companyWeights,
    },
    dealbreakers: {
      ...values.dealbreakers,
      blockedLocations: cleanList(values.dealbreakers.blockedLocations ?? []),
    },
    techPreferences: Object.keys(techPreferences).length ? techPreferences : undefined,
    version: values.version?.trim() || undefined,
    updatedBy: values.updatedBy?.trim() || undefined,
  }
}

export function MatchPolicyTab({ isSaving, policy, onSave, onReset }: MatchPolicyTabProps) {
  const form = useForm<MatchFormValues>({
    defaultValues: mapPolicyToForm(policy ?? DEFAULT_MATCH_POLICY),
    mode: "onChange",
  })

  const techPreferencesArray = useFieldArray({ control: form.control, name: "techPreferences" })

  useEffect(() => {
    form.reset(mapPolicyToForm(policy ?? DEFAULT_MATCH_POLICY))
  }, [policy, form])

  const handleSubmit = async (values: MatchFormValues) => {
    const payload = mapFormToPolicy(values)
    await onSave(payload)
    form.reset(mapPolicyToForm(payload))
  }

  const handleReset = () => {
    const resetValue = onReset()
    form.reset(mapPolicyToForm(resetValue ?? policy ?? DEFAULT_MATCH_POLICY))
  }

  return (
    <TabsContent value="match" className="space-y-4 mt-4">
      <Form {...form}>
        <TabCard
          title="Match Policy"
          description="Clarify what rejects a role vs. what nudges the score. Use the sections below to tune gates, weights, and tech overrides."
          hasChanges={form.formState.isDirty}
          isSaving={isSaving}
          onSave={form.handleSubmit(handleSubmit)}
          onReset={handleReset}
        >
          <div className="space-y-10">
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Dealbreakers</h3>
                <ImpactBadge label="Reject" tone="negative" />
                <p className="text-sm text-muted-foreground">Hard gates applied before scoring. If these fail, the job never surfaces.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="dealbreakers.maxTimezoneDiffHours"
                  label="Max Timezone Difference (hrs)"
                  description="Reject when offset exceeds this window."
                  info="Hard reject if absolute difference between user timezone and job timezone is greater than this number of hours."
                  inputClassName="max-w-[8rem]"
                />
                <Controller
                  control={form.control}
                  name="dealbreakers.requireRemote"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Require Remote"
                      description="Reject non-remote roles."
                      info="If checked, any job not marked remote is rejected before scoring."
                      field={field}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="dealbreakers.allowHybridInTimezone"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Allow Hybrid in Timezone"
                      description="Allow hybrid only if within timezone window."
                      info="Hybrid jobs pass only when their timezone offset is within the max difference above; otherwise they are rejected."
                      field={field}
                    />
                  )}
                />
              </div>
              <StringListField
                control={form.control}
                name="dealbreakers.blockedLocations"
                label="Blocked Locations"
                placeholder="Location keyword"
                description="Locations that should always be rejected."
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Job Match Scoring</h3>
                <ImpactBadge label="Score" tone="neutral" />
                <p className="text-sm text-muted-foreground">Controls the base match score per job before company adjustments.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="jobMatch.minMatchScore"
                  label="Minimum Match Score"
                  description="Floor score required to surface a job."
                  info="After all scoring and bonuses, jobs must meet or exceed this score to be shown."
                  inputClassName="max-w-[8rem]"
                />
                <NumericField
                  control={form.control}
                  name="jobMatch.portlandOfficeBonus"
                  label="Portland Office Bonus"
                  description="Adds points for Portland-based roles."
                  info="Added to the match score when the job is tagged as having a Portland office."
                  inputClassName="max-w-[8rem]"
                />
                <NumericField
                  control={form.control}
                  name="jobMatch.userTimezone"
                  label="User Timezone Offset"
                  description="Offset from UTC (e.g. -8 for PST)."
                  info="Used to compute timezone difference vs. job timezone for bonuses/penalties."
                  inputClassName="max-w-[7rem]"
                />
                <Controller
                  control={form.control}
                  name="jobMatch.preferLargeCompanies"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Prefer Large Companies"
                      description="Adds bias toward bigger orgs."
                      info="When enabled, larger company sizes get a small positive adjustment during scoring."
                      field={field}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="jobMatch.generateIntakeData"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Generate Intake Data"
                      description="Produce intake payloads for matches."
                      info="If enabled, matched roles will generate intake payloads alongside scoring."
                      field={field}
                    />
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Company Weighting</h3>
                <ImpactBadge label="Score" tone="positive" />
                <p className="text-sm text-muted-foreground">Bonuses and penalties that tilt scores based on company traits.</p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Bonuses <ImpactBadge label="+ points" tone="positive" /></h4>
                <div className="grid gap-6 md:grid-cols-2">
                  <NumericField
                    control={form.control}
                    name="companyWeights.bonuses.remoteFirst"
                    label="Remote-first Bonus"
                    description="Boost for remote-first cultures."
                    info="Adds these points when the company is flagged as remote-first."
                    inputClassName="max-w-[9rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.bonuses.aiMlFocus"
                    label="AI/ML Focus Bonus"
                    description="Boost for AI/ML driven companies."
                    info="Adds these points when the company is tagged with AI/ML focus."
                    inputClassName="max-w-[9rem]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Size Adjustments <ImpactBadge label="+/− points" tone="neutral" /></h4>
                <div className="grid gap-6 md:grid-cols-4 lg:grid-cols-5">
                  <NumericField
                    control={form.control}
                    name="companyWeights.sizeAdjustments.largeCompanyBonus"
                    label="Large Company Bonus"
                    description="Points added for large orgs."
                    info="If employee count >= Large Threshold, add these points."
                    inputClassName="max-w-[8rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.sizeAdjustments.smallCompanyPenalty"
                    label="Small Company Penalty"
                    description="Points removed for small orgs."
                    info="If employee count <= Small Threshold, subtract these points."
                    inputClassName="max-w-[8rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.sizeAdjustments.largeCompanyThreshold"
                    label="Large Threshold (employees)"
                    description="Minimum employees to count as large."
                    info="Employee count at or above this value triggers the Large Company Bonus."
                    inputClassName="max-w-[9rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.sizeAdjustments.smallCompanyThreshold"
                    label="Small Threshold (employees)"
                    description="Maximum employees to count as small."
                    info="Employee count at or below this value triggers the Small Company Penalty."
                    inputClassName="max-w-[9rem]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Timezone Adjustments <ImpactBadge label="+/− points" tone="neutral" /></h4>
                <div className="grid gap-6 md:grid-cols-5">
                  <NumericField
                    control={form.control}
                    name="companyWeights.timezoneAdjustments.sameTimezone"
                    label="Same TZ"
                    description="Bonus when in same timezone."
                    info="Adds these points when job timezone matches the user offset."
                    inputClassName="max-w-[7rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.timezoneAdjustments.diff1to2hr"
                    label="1–2 hr diff"
                    description="Minor difference adjustment."
                    info="Adjustment applied when offset difference is between 1 and 2 hours."
                    inputClassName="max-w-[7rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.timezoneAdjustments.diff3to4hr"
                    label="3–4 hr diff"
                    description="Moderate difference adjustment."
                    info="Adjustment applied when offset difference is between 3 and 4 hours."
                    inputClassName="max-w-[7rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.timezoneAdjustments.diff5to8hr"
                    label="5–8 hr diff"
                    description="Large difference adjustment."
                    info="Adjustment applied when offset difference is between 5 and 8 hours."
                    inputClassName="max-w-[7rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.timezoneAdjustments.diff9plusHr"
                    label=">=9 hr diff"
                    description="Huge difference adjustment."
                    info="Adjustment applied when offset difference is 9 hours or more."
                    inputClassName="max-w-[7rem]"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Priority Thresholds <ImpactBadge label="Score gates" tone="neutral" /></h4>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <NumericField
                    control={form.control}
                    name="companyWeights.priorityThresholds.high"
                    label="High Priority Threshold"
                    description="Min score for high priority."
                    info="If final score >= this value, mark as high priority."
                    inputClassName="max-w-[8rem]"
                  />
                  <NumericField
                    control={form.control}
                    name="companyWeights.priorityThresholds.medium"
                    label="Medium Priority Threshold"
                    description="Min score for medium priority."
                    info="If final score >= this value but below high threshold, mark as medium priority."
                    inputClassName="max-w-[8rem]"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Tech Preferences</h3>
                <ImpactBadge label="Per-tech score override" tone="positive" />
                <p className="text-sm text-muted-foreground">Overrides add/subtract points for specific technologies when present.</p>
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Technology</TableHead>
                      <TableHead className="w-[20%]">Weight Δ (pts)</TableHead>
                      <TableHead className="w-[10%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {techPreferencesArray.fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <Input
                            placeholder="TypeScript"
                            {...form.register(`techPreferences.${index}.name` as const)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            placeholder="e.g. +3"
                            className="max-w-[7rem]"
                            {...form.register(`techPreferences.${index}.weight` as const, {
                              setValueAs: (v) => (v === "" ? null : Number(v)),
                            })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove tech preference"
                            onClick={() => techPreferencesArray.remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {techPreferencesArray.fields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                          No overrides yet. Add technologies to boost or penalize specific stacks.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Typical range: −5 to +5. Leave blank to ignore.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => techPreferencesArray.append({ name: "", weight: null })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add technology
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Meta</h3>
                <ImpactBadge label="Audit" tone="neutral" />
                <p className="text-sm text-muted-foreground">Optional versioning for traceability.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <TextInputField
                  control={form.control}
                  name="version"
                  label="Policy Version"
                  description="Semantic version or tag."
                  disabled={isSaving}
                />
                <TextInputField
                  control={form.control}
                  name="updatedBy"
                  label="Updated By"
                  description="Name or email of last editor."
                  disabled={isSaving}
                />
              </div>
            </section>
          </div>
        </TabCard>
      </Form>
    </TabsContent>
  )
}

// helper components moved to shared/form-fields.tsx
