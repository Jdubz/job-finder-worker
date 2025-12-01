import { useEffect, useMemo } from "react"
import { useForm, useFieldArray, Controller } from "react-hook-form"
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
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TabCard } from "../shared"
import {
  CheckboxRow,
  NumericField,
  StringListField,
  TextInputField,
  InfoTooltip,
} from "../shared/form-fields"
import type {
  PrefilterPolicy,
  TechnologyRank,
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

type StrikeEngineForm = Omit<PrefilterPolicy['strikeEngine'], "seniorityStrikes"> & {
  seniorityStrikesList: SeniorityStrikeFormValue[]
}

type TechnologyRanksForm = Omit<PrefilterPolicy['technologyRanks'], "technologies"> & {
  technologies: TechnologyRankFormValue[]
}

type PrefilterFormValues = {
  version?: string | null
  updatedBy?: string | null
  stopList: PrefilterPolicy['stopList']
  strikeEngine: StrikeEngineForm
  technologyRanks: TechnologyRanksForm
}

type PrefilterPolicyTabProps = {
  isSaving: boolean
  policy: PrefilterPolicy
  onSave: (policy: PrefilterPolicy) => Promise<void> | void
  onReset: () => PrefilterPolicy
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
        allowHybridInTimezone: values.strikeEngine.remotePolicy?.allowHybridInTimezone ?? false,
        allowOnsite: values.strikeEngine.remotePolicy?.allowOnsite ?? false,
        maxTimezoneDiffHours: numberOrUndefined(values.strikeEngine.remotePolicy?.maxTimezoneDiffHours),
        perHourTimezonePenalty: numberOrUndefined(values.strikeEngine.remotePolicy?.perHourTimezonePenalty),
        hardTimezonePenalty: numberOrUndefined(values.strikeEngine.remotePolicy?.hardTimezonePenalty),
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

  const strikeEnabled = form.watch("strikeEngine.enabled")
  const salaryStrikeEnabled = form.watch("strikeEngine.salaryStrike.enabled")
  const experienceStrikeEnabled = form.watch("strikeEngine.experienceStrike.enabled")
  const ageStrikeEnabled = form.watch("strikeEngine.ageStrike.enabled")

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
          description="Separate hard stops from strike-based scoring so it’s clear what blocks a role vs. what just reduces score."
          hasChanges={form.formState.isDirty}
          isSaving={isSaving}
          onSave={form.handleSubmit(handleSubmit)}
          onReset={handleReset}
        >
          <div className="space-y-10">
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Stop List</h3>
                <ImpactBadge label="Reject" tone="negative" />
                <p className="text-sm text-muted-foreground">Absolute blockers applied before strikes or scoring.</p>
              </div>
              <div className="space-y-3">
                <StringListField
                  control={form.control}
                  name="stopList.excludedCompanies"
                  label="Excluded Companies"
                  placeholder="Acme Corp"
                  description="Companies that should never reach the match stage."
                  info="If company name contains any of these, the job is rejected before scoring."
                />
                <StringListField
                  control={form.control}
                  name="stopList.excludedKeywords"
                  label="Excluded Keywords"
                  placeholder="blockchain"
                  description="Jobs containing these keywords are ignored."
                  info="Reject job descriptions containing any of these keywords."
                />
                <StringListField
                  control={form.control}
                  name="stopList.excludedDomains"
                  label="Excluded Domains"
                  placeholder="example.com"
                  description="Skip roles sourced from these domains."
                  info="If the job source domain matches any here, drop the job immediately."
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Strike Engine</h3>
                <ImpactBadge label="Reject after strikes" tone="negative" />
                <p className="text-sm text-muted-foreground">Accumulate strike points; exceed the threshold to hard-reject.</p>
              </div>

              <div className="grid gap-6 md:grid-cols-[1.6fr,1fr] items-start">
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
                          className="max-w-[9rem]"
                          disabled={!strikeEnabled}
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Total strike points allowed before rejection.</FormDescription>
                      <InfoTooltip content="When accumulated strike points exceed this number, the job is hard rejected." />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Hard Rejections <ImpactBadge label="Reject" tone="negative" /></h4>
                <div className="grid gap-6 md:grid-cols-2">
                  <StringListField
                    control={form.control}
                    name="strikeEngine.hardRejections.excludedJobTypes"
                    label="Excluded Job Types"
                    placeholder="contract"
                    description="Always reject these job types."
                    info="If job type matches any value here, reject immediately (no strikes)."
                  />
                  <StringListField
                    control={form.control}
                    name="strikeEngine.hardRejections.excludedSeniority"
                    label="Excluded Seniority"
                    placeholder="intern"
                    description="Seniority levels to reject outright."
                    info="Reject when parsed seniority matches one of these labels."
                  />
                  <StringListField
                    control={form.control}
                    name="strikeEngine.hardRejections.excludedCompanies"
                    label="Hard Reject Companies"
                    placeholder="Company name"
                    info="Immediate reject if company matches; applied before strikes."
                  />
                  <StringListField
                    control={form.control}
                    name="strikeEngine.hardRejections.excludedKeywords"
                    label="Hard Reject Keywords"
                    placeholder="wordpress"
                    info="If title or description contains any of these, job is rejected outright."
                  />
                  <StringListField
                    control={form.control}
                    name="strikeEngine.hardRejections.requiredTitleKeywords"
                    label="Required Title Keywords"
                    placeholder="engineer"
                    description="Title must include at least one."
                    info="Reject if none of these keywords are found in the job title."
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
                            className="max-w-[9rem]"
                            disabled={!strikeEnabled}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>Reject roles below this salary if provided.</FormDescription>
                        <InfoTooltip content="If a salary is parsed and is less than this value, the job is rejected without strikes." />
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
                          <InfoTooltip content="If compensation is marked commission-only, reject immediately." />
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Remote Policy <ImpactBadge label="Timezone aware" tone="neutral" /></h4>
                <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                  <Controller
                    control={form.control}
                    name="strikeEngine.remotePolicy.allowRemote"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Allow Remote"
                        description="Accept remote roles"
                        info="If unchecked, any role marked remote is rejected before scoring."
                        field={field}
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="strikeEngine.remotePolicy.allowHybridInTimezone"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Allow Hybrid (in TZ window)"
                        description="Hybrid allowed when timezone gap is acceptable."
                        info="Hybrid roles are allowed only when their timezone difference is within the configured hour window."
                        field={field}
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="strikeEngine.remotePolicy.allowOnsite"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Allow Onsite"
                        description="Permit onsite roles"
                        info="If unchecked, onsite roles are rejected before strikes are calculated."
                        field={field}
                      />
                    )}
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.remotePolicy.maxTimezoneDiffHours"
                    label="Max TZ Gap (hrs)"
                    description="Beyond this onsite/hybrid is rejected."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled}
                    info="If the absolute timezone difference exceeds this value for onsite/hybrid roles, they are rejected before scoring."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.remotePolicy.perHourTimezonePenalty"
                    label="TZ Gap Strike / hr"
                    description="Strikes per hour difference"
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled}
                    info="For onsite/hybrid roles within the max gap, add these strike points per hour of timezone difference."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.remotePolicy.hardTimezonePenalty"
                    label="Hard TZ Strike"
                    description="Applied when gap is too large."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled}
                    info="Strike points added when the timezone gap exceeds the maximum allowed."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Salary Strike <ImpactBadge label="Adds points" tone="negative" /></h4>
                <div className="grid gap-6 md:grid-cols-3">
                  <NumericField
                    control={form.control}
                    name="strikeEngine.salaryStrike.threshold"
                    label="Salary Threshold"
                    description="Below this adds strike points."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled || !salaryStrikeEnabled}
                    info="If parsed salary is below this number, add the configured strike points."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.salaryStrike.points"
                    label="Strike Points"
                    description="Points added when salary is low."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled || !salaryStrikeEnabled}
                    info="Number of strike points to add when salary is below the threshold."
                  />
                  <Controller
                    control={form.control}
                    name="strikeEngine.salaryStrike.enabled"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Enable Salary Strike"
                        description="Apply salary rules"
                        info="Turns on salary-based strike calculation using the threshold and points above."
                        field={field}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Experience Strike <ImpactBadge label="Adds points" tone="negative" /></h4>
                <div className="grid gap-6 md:grid-cols-3">
                  <NumericField
                    control={form.control}
                    name="strikeEngine.experienceStrike.minPreferred"
                    label="Min Preferred Experience (yrs)"
                    description="Below this adds strike points."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled || !experienceStrikeEnabled}
                    info="If years of experience parsed from the posting is below this, apply strike points."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.experienceStrike.points"
                    label="Strike Points"
                    description="Points added when experience is low."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled || !experienceStrikeEnabled}
                    info="Strike points added when min experience is not met."
                  />
                  <Controller
                    control={form.control}
                    name="strikeEngine.experienceStrike.enabled"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Enable Experience Strike"
                        description="Apply experience rules"
                        info="When on, under-minimum experience triggers the strike points above."
                        field={field}
                      />
                    )}
                  />
                </div>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Seniority Strikes</h4>
                    <ImpactBadge label="Adds points" tone="negative" />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => seniorityArray.append({ level: "", points: null })}>
                    <Plus className="h-4 w-4 mr-1" /> Add level
                  </Button>
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60%]">Seniority label</TableHead>
                        <TableHead className="w-[25%]">Strike Points</TableHead>
                        <TableHead className="text-right w-[15%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {seniorityArray.fields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Input
                              placeholder="mid-level"
                              disabled={!strikeEnabled}
                              {...form.register(`strikeEngine.seniorityStrikesList.${index}.level` as const)}
                            />
                          </TableCell>
                          <TableCell>
                          <Input
                            type="number"
                            className="max-w-[7rem]"
                            disabled={!strikeEnabled}
                            {...form.register(`strikeEngine.seniorityStrikesList.${index}.points` as const, {
                              setValueAs: (v) => (v === "" ? null : Number(v)),
                            })}
                          />
                        </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remove seniority strike"
                              onClick={() => seniorityArray.remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {seniorityArray.fields.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                            No seniority strikes yet. Add levels to penalize mismatched titles.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Quality Strikes <ImpactBadge label="Adds points" tone="negative" /></h4>
                <div className="grid gap-6 md:grid-cols-2">
                  <NumericField
                    control={form.control}
                    name="strikeEngine.qualityStrikes.minDescriptionLength"
                    label="Min Description Length"
                    description="Jobs shorter than this trigger points."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled}
                    info="If the job description character count is below this number, add quality strike points."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.qualityStrikes.shortDescriptionPoints"
                    label="Short Description Points"
                    description="Points added when descriptions are short."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled}
                    info="Strike points added when description is shorter than the min length."
                  />
                  <StringListField
                    control={form.control}
                    name="strikeEngine.qualityStrikes.buzzwords"
                    label="Buzzwords"
                    placeholder="synergy"
                    description="Buzzwords that reduce quality."
                    info="When any buzzword is found, buzzword strike points are added."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.qualityStrikes.buzzwordPoints"
                    label="Buzzword Points"
                    description="Points added per buzzword occurrence."
                    inputClassName="max-w-[8rem]"
                    disabled={!strikeEnabled}
                    info="Strike points added for each buzzword found in the posting."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">Age Strike <ImpactBadge label="Adds points" tone="negative" /></h4>
                <div className="grid gap-6 md:grid-cols-4">
                  <Controller
                    control={form.control}
                    name="strikeEngine.ageStrike.enabled"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Enable Age Strike"
                        description="Apply posting-age rules"
                        info="When enabled, posting age is checked against strike/reject day thresholds."
                        field={field}
                      />
                    )}
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.ageStrike.strikeDays"
                    label="Strike Days"
                    description="Days after which strikes apply."
                    inputClassName="max-w-[7rem]"
                    disabled={!strikeEnabled || !ageStrikeEnabled}
                    info="If posting age in days is >= this value, add age strike points."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.ageStrike.rejectDays"
                    label="Reject Days"
                    description="Days after which jobs are rejected."
                    inputClassName="max-w-[7rem]"
                    disabled={!strikeEnabled || !ageStrikeEnabled}
                    info="If posting age in days is >= this value, reject the job regardless of strikes."
                  />
                  <NumericField
                    control={form.control}
                    name="strikeEngine.ageStrike.points"
                    label="Age Strike Points"
                    description="Points added when posting is old."
                    inputClassName="max-w-[7rem]"
                    disabled={!strikeEnabled || !ageStrikeEnabled}
                    info="Strike points added when posting age exceeds Strike Days."
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Technology Ranks</h3>
                <ImpactBadge label="Score or Reject" tone="neutral" />
                <p className="text-sm text-muted-foreground">Ranked technologies drive required checks, strikes, or outright fails.</p>
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Technology</TableHead>
                      <TableHead className="w-[18%]">Rank</TableHead>
                      <TableHead className="w-[18%]">Points Δ</TableHead>
                      <TableHead className="w-[18%]">Min Mentions</TableHead>
                      <TableHead className="text-right w-[16%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {techArray.fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <Input
                            placeholder="TypeScript"
                            {...form.register(`technologyRanks.technologies.${index}.name` as const)}
                          />
                        </TableCell>
                        <TableCell>
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
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Rank" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="required">Required (missing = strike)</SelectItem>
                                      <SelectItem value="ok">OK (neutral)</SelectItem>
                                      <SelectItem value="strike">Strike (adds points)</SelectItem>
                                      <SelectItem value="fail">Fail (hard reject)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            placeholder="e.g. +3 / -3"
                            className="max-w-[7rem]"
                            {...form.register(`technologyRanks.technologies.${index}.points` as const, {
                              setValueAs: (v) => (v === "" ? null : Number(v)),
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            placeholder="Min mentions"
                            className="max-w-[7rem]"
                            {...form.register(`technologyRanks.technologies.${index}.mentions` as const, {
                              setValueAs: (v) => (v === "" ? null : Number(v)),
                            })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove technology"
                            onClick={() => techArray.remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {techArray.fields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          No technologies ranked yet. Add required/strike/fail tech to steer prefiltering.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                <span>Rank meanings: Required = must appear, Strike = adds points when present, Fail = reject if present.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => techArray.append({ name: "", rank: "ok", points: null, mentions: null })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add technology
                </Button>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                    control={form.control}
                    name="technologyRanks.strikes.missingAllRequired"
                    label="Missing Required Strike"
                    description="Points when all required tech is absent."
                    inputClassName="max-w-[8rem]"
                    info="If no required technologies are found in the posting, add these strike points."
                  />
                  <NumericField
                    control={form.control}
                    name="technologyRanks.strikes.perBadTech"
                    label="Per Bad Tech Strike"
                    description="Points per disallowed technology."
                    inputClassName="max-w-[8rem]"
                    info="For each technology marked as strike or fail that appears, add these strike points."
                  />
                  <NumericField
                    control={form.control}
                    name="technologyRanks.extractedFromJobs"
                    label="Extracted From Jobs (%)"
                    description="Weighting for extracted tech signal."
                    inputClassName="max-w-[8rem]"
                    info="Percentage weight of technologies extracted from job text when computing rank scores."
                  />
                </div>
              </section>

            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Meta</h3>
                <ImpactBadge label="Audit" tone="neutral" />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <TextInputField
                  control={form.control}
                  name="version"
                  label="Policy Version"
                  description="Optional semantic version marker."
                  disabled={isSaving}
                />
                <TextInputField
                  control={form.control}
                  name="updatedBy"
                  label="Updated By"
                  description="Name or email of the last editor."
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
