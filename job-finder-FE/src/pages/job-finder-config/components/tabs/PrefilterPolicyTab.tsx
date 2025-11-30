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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { TabCard } from "../shared"
import { StringListField } from "../shared/StringListField"
import type {
  PrefilterPolicy,
  StopList,
  JobFiltersConfig,
  TechnologyRank,
  TechnologyRanksConfig,
} from "@shared/types"
import { DEFAULT_PREFILTER_POLICY } from "@shared/types"
import { Plus, Trash2 } from "lucide-react"

type TechnologyRankFormValue = {
  name: string
  rank: TechnologyRank["rank"]
  points?: number | null
  mentions?: number | null
}

type SeniorityStrikeFormValue = {
  level: string
  points: number | null
}

type StrikeEngineForm = Omit<JobFiltersConfig, "seniorityStrikes"> & {
  seniorityStrikesList: SeniorityStrikeFormValue[]
}

type TechnologyRanksForm = Omit<TechnologyRanksConfig, "technologies"> & {
  technologies: TechnologyRankFormValue[]
}

type PrefilterFormValues = {
  version?: string | null
  updatedBy?: string | null
  stopList: StopList
  strikeEngine: StrikeEngineForm
  technologyRanks: TechnologyRanksForm
}

type PrefilterPolicyTabProps = {
  isSaving: boolean
  policy: PrefilterPolicy
  onSave: (policy: PrefilterPolicy) => Promise<void> | void
  onReset: () => PrefilterPolicy
}

const numberOrUndefined = (value?: number | null) =>
  value === null || value === undefined || Number.isNaN(value) ? undefined : Number(value)

const cleanList = (items: string[]) => items.map((item) => item.trim()).filter(Boolean)

const mapPolicyToForm = (policy: PrefilterPolicy): PrefilterFormValues => {
  const merged = {
    ...DEFAULT_PREFILTER_POLICY,
    ...policy,
    stopList: {
      ...DEFAULT_PREFILTER_POLICY.stopList,
      ...policy.stopList,
    },
    strikeEngine: {
      ...DEFAULT_PREFILTER_POLICY.strikeEngine,
      ...policy.strikeEngine,
      hardRejections: {
        ...DEFAULT_PREFILTER_POLICY.strikeEngine.hardRejections,
        ...policy.strikeEngine?.hardRejections,
      },
      remotePolicy: {
        ...DEFAULT_PREFILTER_POLICY.strikeEngine.remotePolicy,
        ...policy.strikeEngine?.remotePolicy,
      },
      salaryStrike: {
        ...DEFAULT_PREFILTER_POLICY.strikeEngine.salaryStrike,
        ...policy.strikeEngine?.salaryStrike,
      },
      experienceStrike: {
        ...DEFAULT_PREFILTER_POLICY.strikeEngine.experienceStrike,
        ...policy.strikeEngine?.experienceStrike,
      },
      qualityStrikes: {
        ...DEFAULT_PREFILTER_POLICY.strikeEngine.qualityStrikes,
        ...policy.strikeEngine?.qualityStrikes,
      },
      ageStrike: {
        ...DEFAULT_PREFILTER_POLICY.strikeEngine.ageStrike,
        ...policy.strikeEngine?.ageStrike,
      },
    },
    technologyRanks: {
      ...DEFAULT_PREFILTER_POLICY.technologyRanks,
      ...policy.technologyRanks,
      strikes: {
        ...DEFAULT_PREFILTER_POLICY.technologyRanks.strikes,
        ...policy.technologyRanks?.strikes,
      },
    },
  }

  return {
    version: merged.version ?? "",
    updatedBy: merged.updatedBy ?? "",
    stopList: {
      excludedCompanies: merged.stopList.excludedCompanies ?? [],
      excludedKeywords: merged.stopList.excludedKeywords ?? [],
      excludedDomains: merged.stopList.excludedDomains ?? [],
    },
    strikeEngine: {
      ...merged.strikeEngine,
      seniorityStrikesList: Object.entries(merged.strikeEngine.seniorityStrikes ?? {}).map(([level, points]) => ({
        level,
        points,
      })),
    },
    technologyRanks: {
      ...merged.technologyRanks,
      technologies: Object.entries(merged.technologyRanks.technologies ?? {}).map(([name, data]) => ({
        name,
        rank: data.rank,
        points: data.points ?? null,
        mentions: data.mentions ?? null,
      })),
    },
  }
}

const mapFormToPolicy = (values: PrefilterFormValues): PrefilterPolicy => {
  const seniorityStrikes = values.strikeEngine.seniorityStrikesList.reduce<Record<string, number>>((acc, cur) => {
    const level = cur.level.trim()
    const points = numberOrUndefined(cur.points)
    if (level && points !== undefined) acc[level] = points
    return acc
  }, {})

  const technologies = values.technologyRanks.technologies.reduce<Record<string, TechnologyRank>>((acc, cur) => {
    const name = cur.name.trim()
    if (!name) return acc
    acc[name] = {
      rank: cur.rank,
      ...(numberOrUndefined(cur.points) !== undefined ? { points: numberOrUndefined(cur.points) } : {}),
      ...(numberOrUndefined(cur.mentions) !== undefined ? { mentions: numberOrUndefined(cur.mentions) } : {}),
    }
    return acc
  }, {})

  return {
    stopList: {
      excludedCompanies: cleanList(values.stopList.excludedCompanies),
      excludedKeywords: cleanList(values.stopList.excludedKeywords),
      excludedDomains: cleanList(values.stopList.excludedDomains),
    },
    strikeEngine: {
      enabled: values.strikeEngine.enabled,
      strikeThreshold: values.strikeEngine.strikeThreshold,
      hardRejections: {
        excludedJobTypes: cleanList(values.strikeEngine.hardRejections?.excludedJobTypes ?? []),
        excludedSeniority: cleanList(values.strikeEngine.hardRejections?.excludedSeniority ?? []),
        excludedCompanies: cleanList(values.strikeEngine.hardRejections?.excludedCompanies ?? []),
        excludedKeywords: cleanList(values.strikeEngine.hardRejections?.excludedKeywords ?? []),
        requiredTitleKeywords: cleanList(values.strikeEngine.hardRejections?.requiredTitleKeywords ?? []),
        minSalaryFloor: numberOrUndefined(values.strikeEngine.hardRejections?.minSalaryFloor),
        rejectCommissionOnly: values.strikeEngine.hardRejections?.rejectCommissionOnly ?? false,
      },
      remotePolicy: {
        allowRemote: values.strikeEngine.remotePolicy?.allowRemote ?? false,
        allowHybridPortland: values.strikeEngine.remotePolicy?.allowHybridPortland ?? false,
        allowOnsite: values.strikeEngine.remotePolicy?.allowOnsite ?? false,
      },
      salaryStrike: {
        enabled: values.strikeEngine.salaryStrike?.enabled ?? false,
        threshold: numberOrUndefined(values.strikeEngine.salaryStrike?.threshold),
        points: numberOrUndefined(values.strikeEngine.salaryStrike?.points),
      },
      experienceStrike: {
        enabled: values.strikeEngine.experienceStrike?.enabled ?? false,
        minPreferred: numberOrUndefined(values.strikeEngine.experienceStrike?.minPreferred),
        points: numberOrUndefined(values.strikeEngine.experienceStrike?.points),
      },
      seniorityStrikes,
      qualityStrikes: {
        minDescriptionLength: numberOrUndefined(values.strikeEngine.qualityStrikes?.minDescriptionLength),
        shortDescriptionPoints: numberOrUndefined(values.strikeEngine.qualityStrikes?.shortDescriptionPoints),
        buzzwords: cleanList(values.strikeEngine.qualityStrikes?.buzzwords ?? []),
        buzzwordPoints: numberOrUndefined(values.strikeEngine.qualityStrikes?.buzzwordPoints),
      },
      ageStrike: {
        enabled: values.strikeEngine.ageStrike?.enabled ?? false,
        strikeDays: numberOrUndefined(values.strikeEngine.ageStrike?.strikeDays),
        rejectDays: numberOrUndefined(values.strikeEngine.ageStrike?.rejectDays),
        points: numberOrUndefined(values.strikeEngine.ageStrike?.points),
      },
    },
    technologyRanks: {
      technologies,
      strikes: {
        missingAllRequired: numberOrUndefined(values.technologyRanks.strikes?.missingAllRequired),
        perBadTech: numberOrUndefined(values.technologyRanks.strikes?.perBadTech),
      },
      extractedFromJobs: numberOrUndefined(values.technologyRanks.extractedFromJobs),
      version: values.technologyRanks.version?.trim() || undefined,
    },
    version: values.version?.trim() || undefined,
    updatedBy: values.updatedBy?.trim() || undefined,
  }
}

export function PrefilterPolicyTab({ isSaving, policy, onSave, onReset }: PrefilterPolicyTabProps) {
  const form = useForm<PrefilterFormValues>({
    defaultValues: mapPolicyToForm(policy ?? DEFAULT_PREFILTER_POLICY),
    mode: "onChange",
  })

  const seniorityArray = useFieldArray({ control: form.control, name: "strikeEngine.seniorityStrikesList" })
  const techArray = useFieldArray({ control: form.control, name: "technologyRanks.technologies" })

  useEffect(() => {
    form.reset(mapPolicyToForm(policy ?? DEFAULT_PREFILTER_POLICY))
  }, [policy, form])

  const handleSubmit = async (values: PrefilterFormValues) => {
    const payload = mapFormToPolicy(values)
    await onSave(payload)
    form.reset(mapPolicyToForm(payload))
  }

  const handleReset = () => {
    const resetValue = onReset()
    form.reset(mapPolicyToForm(resetValue ?? policy ?? DEFAULT_PREFILTER_POLICY))
  }

  return (
    <TabsContent value="prefilter" className="space-y-4 mt-4">
      <Form {...form}>
        <TabCard
          title="Prefilter Policy"
          description="Stop list, strike engine, and technology ranks are validated here so production never sees malformed config."
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
                description="Optional semantic version marker stored with the policy."
              />
              <TextInputField
                control={form.control}
                name="updatedBy"
                label="Updated By"
                description="Name or email of the last editor."
              />
            </div>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold">Stop List</h3>
              <StringListField
                control={form.control}
                name="stopList.excludedCompanies"
                label="Excluded Companies"
                placeholder="Acme Corp"
                description="Companies that should never reach the match stage."
              />
              <StringListField
                control={form.control}
                name="stopList.excludedKeywords"
                label="Excluded Keywords"
                placeholder="blockchain"
                description="Jobs containing these keywords are ignored."
              />
              <StringListField
                control={form.control}
                name="stopList.excludedDomains"
                label="Excluded Domains"
                placeholder="example.com"
                description="Skip roles sourced from these domains."
              />
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-semibold">Strike Engine</h3>
              <div className="grid gap-6 md:grid-cols-2">
                <Controller
                  control={form.control}
                  name="strikeEngine.enabled"
                  render={({ field }) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox checked={field.value} onCheckedChange={(val) => field.onChange(Boolean(val))} />
                      <div>
                        <Label>Enable Strike Engine</Label>
                        <p className="text-xs text-muted-foreground">Disable only for emergency bypass.</p>
                      </div>
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="strikeEngine.strikeThreshold"
                  rules={{ required: "Required", min: { value: 0, message: "Must be zero or positive" } }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Strike Threshold</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? ""}
                          min={0}
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Total strike points before hard rejection.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <StringListField
                  control={form.control}
                  name="strikeEngine.hardRejections.excludedJobTypes"
                  label="Excluded Job Types"
                  placeholder="contract"
                />
                <StringListField
                  control={form.control}
                  name="strikeEngine.hardRejections.excludedSeniority"
                  label="Excluded Seniority"
                  placeholder="intern"
                />
                <StringListField
                  control={form.control}
                  name="strikeEngine.hardRejections.excludedCompanies"
                  label="Hard Reject Companies"
                  placeholder="Company name"
                />
                <StringListField
                  control={form.control}
                  name="strikeEngine.hardRejections.excludedKeywords"
                  label="Hard Reject Keywords"
                  placeholder="wordpress"
                />
                <StringListField
                  control={form.control}
                  name="strikeEngine.hardRejections.requiredTitleKeywords"
                  label="Required Title Keywords"
                  placeholder="engineer"
                  description="Title must include at least one of these keywords."
                />
                <FormField
                  control={form.control}
                  name="strikeEngine.hardRejections.minSalaryFloor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Salary Floor</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Reject roles below this salary if provided.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Controller
                  control={form.control}
                  name="strikeEngine.hardRejections.rejectCommissionOnly"
                  render={({ field }) => (
                    <div className="flex items-center space-x-3">
                      <Checkbox checked={Boolean(field.value)} onCheckedChange={(val) => field.onChange(Boolean(val))} />
                      <div>
                        <Label>Reject commission-only roles</Label>
                        <p className="text-xs text-muted-foreground">Blocks pure commission jobs.</p>
                      </div>
                    </div>
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <Controller
                  control={form.control}
                  name="strikeEngine.remotePolicy.allowRemote"
                  render={({ field }) => (
                    <CheckboxRow label="Allow Remote" description="Accept remote roles" field={field} />
                  )}
                />
                <Controller
                  control={form.control}
                  name="strikeEngine.remotePolicy.allowHybridPortland"
                  render={({ field }) => (
                    <CheckboxRow label="Allow Hybrid (Portland)" description="Hybrid if within Portland" field={field} />
                  )}
                />
                <Controller
                  control={form.control}
                  name="strikeEngine.remotePolicy.allowOnsite"
                  render={({ field }) => (
                    <CheckboxRow label="Allow Onsite" description="Permit onsite roles" field={field} />
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="strikeEngine.salaryStrike.threshold"
                  label="Salary Strike Threshold"
                  description="Salary below this triggers strike points."
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.salaryStrike.points"
                  label="Salary Strike Points"
                  description="Points added when salary is low."
                />
                <Controller
                  control={form.control}
                  name="strikeEngine.salaryStrike.enabled"
                  render={({ field }) => (
                    <CheckboxRow label="Enable Salary Strike" description="Apply salary rules" field={field} />
                  )}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="strikeEngine.experienceStrike.minPreferred"
                  label="Min Preferred Experience (years)"
                  description="Below this adds strike points."
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.experienceStrike.points"
                  label="Experience Strike Points"
                  description="Points added when experience is low."
                />
                <Controller
                  control={form.control}
                  name="strikeEngine.experienceStrike.enabled"
                  render={({ field }) => (
                    <CheckboxRow label="Enable Experience Strike" description="Apply experience rules" field={field} />
                  )}
                />
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Seniority Strikes</h4>
                    <p className="text-xs text-muted-foreground">Custom strike points by seniority label.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => seniorityArray.append({ level: "", points: null })}>
                    <Plus className="h-4 w-4 mr-1" /> Add level
                  </Button>
                </div>
                <div className="space-y-2">
                  {seniorityArray.fields.map((field, index) => (
                    <div key={field.id} className="grid gap-2 md:grid-cols-[2fr,1fr,auto] items-center">
                      <Input
                        placeholder="mid-level"
                        value={form.watch(`strikeEngine.seniorityStrikesList.${index}.level`) ?? ""}
                        onChange={(e) => form.setValue(`strikeEngine.seniorityStrikesList.${index}.level`, e.target.value, { shouldDirty: true })}
                      />
                      <Input
                        type="number"
                        value={form.watch(`strikeEngine.seniorityStrikesList.${index}.points`) ?? ""}
                        onChange={(e) =>
                          form.setValue(
                            `strikeEngine.seniorityStrikesList.${index}.points`,
                            e.target.value === "" ? null : Number(e.target.value),
                            { shouldDirty: true }
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove seniority strike"
                        onClick={() => seniorityArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {seniorityArray.fields.length === 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => seniorityArray.append({ level: "", points: null })}>
                      Add seniority rule
                    </Button>
                  )}
                </div>
              </section>

              <div className="grid gap-6 md:grid-cols-2">
                <NumericField
                  control={form.control}
                  name="strikeEngine.qualityStrikes.minDescriptionLength"
                  label="Min Description Length"
                  description="Jobs shorter than this trigger points."
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.qualityStrikes.shortDescriptionPoints"
                  label="Short Description Points"
                  description="Points added when descriptions are short."
                />
                <StringListField
                  control={form.control}
                  name="strikeEngine.qualityStrikes.buzzwords"
                  label="Buzzwords"
                  placeholder="synergy"
                  description="Buzzwords that reduce quality."
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.qualityStrikes.buzzwordPoints"
                  label="Buzzword Points"
                  description="Points added per buzzword occurrence."
                />
              </div>

              <div className="grid gap-6 md:grid-cols-4">
                <Controller
                  control={form.control}
                  name="strikeEngine.ageStrike.enabled"
                  render={({ field }) => (
                    <CheckboxRow label="Enable Age Strike" description="Apply posting-age rules" field={field} />
                  )}
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.ageStrike.strikeDays"
                  label="Strike Days"
                  description="Days after which strikes apply."
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.ageStrike.rejectDays"
                  label="Reject Days"
                  description="Days after which jobs are rejected."
                />
                <NumericField
                  control={form.control}
                  name="strikeEngine.ageStrike.points"
                  label="Age Strike Points"
                  description="Points added when posting is old."
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Technology Ranks</h3>
                  <p className="text-sm text-muted-foreground">Ranked technologies with optional point overrides.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => techArray.append({ name: "", rank: "ok", points: null, mentions: null })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add technology
                </Button>
              </div>
              <div className="space-y-3">
                {techArray.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 lg:grid-cols-[2fr,1fr,1fr,1fr,auto] items-center">
                    <Input
                      placeholder="TypeScript"
                      value={form.watch(`technologyRanks.technologies.${index}.name`) ?? ""}
                      onChange={(e) =>
                        form.setValue(`technologyRanks.technologies.${index}.name`, e.target.value, { shouldDirty: true })
                      }
                    />
                    <FormField
                      control={form.control}
                      name={`technologyRanks.technologies.${index}.rank` as const}
                      render={({ field: rankField }) => (
                        <FormItem>
                          <FormControl>
                            <Select
                              value={rankField.value}
                              onValueChange={(value) => rankField.onChange(value as TechnologyRank["rank"])}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="required">Required</SelectItem>
                                <SelectItem value="ok">OK</SelectItem>
                                <SelectItem value="strike">Strike</SelectItem>
                                <SelectItem value="fail">Fail</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Input
                      type="number"
                      placeholder="Points"
                      value={form.watch(`technologyRanks.technologies.${index}.points`) ?? ""}
                      onChange={(e) =>
                        form.setValue(
                          `technologyRanks.technologies.${index}.points`,
                          e.target.value === "" ? null : Number(e.target.value),
                          { shouldDirty: true }
                        )
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Min mentions"
                      value={form.watch(`technologyRanks.technologies.${index}.mentions`) ?? ""}
                      onChange={(e) =>
                        form.setValue(
                          `technologyRanks.technologies.${index}.mentions`,
                          e.target.value === "" ? null : Number(e.target.value),
                          { shouldDirty: true }
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove technology"
                      onClick={() => techArray.remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {techArray.fields.length === 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => techArray.append({ name: "", rank: "ok", points: null, mentions: null })}
                  >
                    Add technology
                  </Button>
                )}
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="technologyRanks.strikes.missingAllRequired"
                  label="Missing Required Strike"
                  description="Points when required tech is missing."
                />
                <NumericField
                  control={form.control}
                  name="technologyRanks.strikes.perBadTech"
                  label="Per Bad Tech Strike"
                  description="Points per disallowed technology."
                />
                <NumericField
                  control={form.control}
                  name="technologyRanks.extractedFromJobs"
                  label="Extracted From Jobs"
                  description="Percent weighting for extraction signal."
                />
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
  field: { value?: boolean; onChange: (val: boolean) => void }
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
  control: Control<PrefilterFormValues>
  name: FieldPath<PrefilterFormValues>
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
              value={typeof field.value === "number" || typeof field.value === "string" ? field.value : ""}
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
  control: Control<PrefilterFormValues>
  name: FieldPath<PrefilterFormValues>
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
            <Input {...field} value={(field.value as string | undefined) ?? ""} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
        </FormItem>
      )}
    />
  )
}
