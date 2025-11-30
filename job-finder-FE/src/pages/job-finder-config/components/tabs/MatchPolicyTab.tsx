import { useEffect } from "react"
import { useForm, useFieldArray, Controller, type Control, type FieldPath } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { TabCard } from "../shared"
import { StringListField } from "../shared/StringListField"
import type { MatchPolicy, JobMatchConfig, CompanyMatchWeights, MatchDealbreakers } from "@shared/types"
import { DEFAULT_MATCH_POLICY } from "@shared/types"
import { Plus, Trash2 } from "lucide-react"

type TechPreferenceFormValue = { name: string; weight: number | null }

type MatchFormValues = {
  version?: string | null
  updatedBy?: string | null
  jobMatch: JobMatchConfig
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
          description="Scoring weights and dealbreakers are enforced through this validated form."
          hasChanges={form.formState.isDirty}
          isSaving={isSaving}
          onSave={form.handleSubmit(handleSubmit)}
          onReset={handleReset}
        >
          <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <TextInputField
                control={form.control}
                name="version"
                label="Policy Version"
                description="Optional semantic version marker."
              />
              <TextInputField
                control={form.control}
                name="updatedBy"
                label="Updated By"
                description="Name or email of last editor."
              />
            </div>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold">Job Match Scoring</h3>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="jobMatch.minMatchScore"
                  label="Minimum Match Score"
                  description="Floor score required to surface a job."
                />
                <NumericField
                  control={form.control}
                  name="jobMatch.portlandOfficeBonus"
                  label="Portland Office Bonus"
                  description="Bonus points for Portland-based roles."
                />
                <NumericField
                  control={form.control}
                  name="jobMatch.userTimezone"
                  label="User Timezone Offset"
                  description="Offset from UTC (e.g. -8 for PST)."
                />
                <Controller
                  control={form.control}
                  name="jobMatch.preferLargeCompanies"
                  render={({ field }) => (
                    <CheckboxRow label="Prefer Large Companies" description="Adds bias toward bigger orgs." field={field} />
                  )}
                />
                <Controller
                  control={form.control}
                  name="jobMatch.generateIntakeData"
                  render={({ field }) => (
                    <CheckboxRow label="Generate Intake Data" description="Produce intake payloads for matches." field={field} />
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Company Weights</h3>
                <p className="text-sm text-muted-foreground">Fine-tune how company attributes influence scoring.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <NumericField
                  control={form.control}
                  name="companyWeights.bonuses.remoteFirst"
                  label="Remote-first Bonus"
                  description="Bonus for remote-first cultures."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.bonuses.aiMlFocus"
                  label="AI/ML Focus Bonus"
                  description="Bonus for AI/ML driven companies."
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="companyWeights.sizeAdjustments.largeCompanyBonus"
                  label="Large Company Bonus"
                  description="Points added for large orgs."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.sizeAdjustments.smallCompanyPenalty"
                  label="Small Company Penalty"
                  description="Points removed for small orgs."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.sizeAdjustments.largeCompanyThreshold"
                  label="Large Company Threshold"
                  description="Employee count threshold for large."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.sizeAdjustments.smallCompanyThreshold"
                  label="Small Company Threshold"
                  description="Employee count threshold for small."
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="companyWeights.timezoneAdjustments.sameTimezone"
                  label="Same Timezone Bonus"
                  description="Bonus when in same timezone."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.timezoneAdjustments.diff1to2hr"
                  label="1-2 Hr Difference"
                  description="Adjustment for minor difference."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.timezoneAdjustments.diff3to4hr"
                  label="3-4 Hr Difference"
                  description="Adjustment for moderate difference."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.timezoneAdjustments.diff5to8hr"
                  label="5-8 Hr Difference"
                  description="Adjustment for large difference."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.timezoneAdjustments.diff9plusHr"
                  label=">=9 Hr Difference"
                  description="Adjustment for huge difference."
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <NumericField
                  control={form.control}
                  name="companyWeights.priorityThresholds.high"
                  label="High Priority Threshold"
                  description="Minimum score for high priority."
                />
                <NumericField
                  control={form.control}
                  name="companyWeights.priorityThresholds.medium"
                  label="Medium Priority Threshold"
                  description="Minimum score for medium priority."
                />
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Dealbreakers</h3>
                <p className="text-sm text-muted-foreground">Hard constraints enforced before scoring.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="dealbreakers.maxTimezoneDiffHours"
                  label="Max Timezone Difference"
                  description="Reject jobs beyond this hour difference."
                />
                <Controller
                  control={form.control}
                  name="dealbreakers.requireRemote"
                  render={({ field }) => (
                    <CheckboxRow label="Require Remote" description="Reject non-remote roles." field={field} />
                  )}
                />
                <Controller
                  control={form.control}
                  name="dealbreakers.allowHybridInTimezone"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Allow Hybrid in Timezone"
                      description="Hybrid allowed if within timezone window."
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Tech Preferences</h3>
                  <p className="text-sm text-muted-foreground">Optional weight overrides per technology.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => techPreferencesArray.append({ name: "", weight: null })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add technology
                </Button>
              </div>
              <div className="space-y-2">
                {techPreferencesArray.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-2 md:grid-cols-[2fr,1fr,auto] items-center">
                    <Input
                      placeholder="TypeScript"
                      value={form.watch(`techPreferences.${index}.name`) ?? ""}
                      onChange={(e) => form.setValue(`techPreferences.${index}.name`, e.target.value, { shouldDirty: true })}
                    />
                    <Input
                      type="number"
                      placeholder="Weight"
                      value={form.watch(`techPreferences.${index}.weight`) ?? ""}
                      onChange={(e) =>
                        form.setValue(
                          `techPreferences.${index}.weight`,
                          e.target.value === "" ? null : Number(e.target.value),
                          { shouldDirty: true }
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove tech preference"
                      onClick={() => techPreferencesArray.remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {techPreferencesArray.fields.length === 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => techPreferencesArray.append({ name: "", weight: null })}
                  >
                    Add tech preference
                  </Button>
                )}
              </div>
            </section>
          </div>
        </TabCard>
      </Form>
    </TabsContent>
  )
}

type CheckboxRowProps = {
  label: string
  description?: string
  field: { value: boolean; onChange: (val: boolean) => void }
}

function CheckboxRow({ label, description, field }: CheckboxRowProps) {
  return (
    <div className="flex items-center space-x-3">
      <Checkbox checked={Boolean(field.value)} onCheckedChange={(val) => field.onChange(Boolean(val))} />
      <div>
        <Label>{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  )
}

type NumericFieldProps = {
  control: Control<MatchFormValues>
  name: FieldPath<MatchFormValues>
  label: string
  description?: string
}

function NumericField({ control, name, label, description }: NumericFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

type TextInputFieldProps = {
  control: Control<MatchFormValues>
  name: FieldPath<MatchFormValues>
  label: string
  description?: string
}

function TextInputField({ control, name, label, description }: TextInputFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
        </FormItem>
      )}
    />
  )
}
