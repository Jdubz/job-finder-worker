import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { TabCard } from "../shared"
import { StringListField, NumericField, CheckboxRow, ImpactBadge, InfoTooltip } from "../shared/form-fields"
import type { ScoringConfig } from "@shared/types"
import { DEFAULT_SCORING_CONFIG } from "@shared/types"

type ScoringConfigFormValues = ScoringConfig

type ScoringConfigTabProps = {
  isSaving: boolean
  config: ScoringConfig
  onSave: (config: ScoringConfig) => Promise<void> | void
  onReset: () => ScoringConfig
}

const cleanList = (items?: string[]) => (items ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)

const mapConfigToForm = (config?: ScoringConfig): ScoringConfigFormValues => ({
  ...(DEFAULT_SCORING_CONFIG ?? {}),
  ...(config ?? {}),
  weights: { ...(DEFAULT_SCORING_CONFIG?.weights ?? {}), ...(config?.weights ?? {}) },
  seniority: { ...(DEFAULT_SCORING_CONFIG?.seniority ?? {}), ...(config?.seniority ?? {}) },
  location: { ...(DEFAULT_SCORING_CONFIG?.location ?? {}), ...(config?.location ?? {}) },
  technology: { ...(DEFAULT_SCORING_CONFIG?.technology ?? {}), ...(config?.technology ?? {}) },
  salary: { ...(DEFAULT_SCORING_CONFIG?.salary ?? {}), ...(config?.salary ?? {}) },
  experience: { ...(DEFAULT_SCORING_CONFIG?.experience ?? {}), ...(config?.experience ?? {}) },
})

const mapFormToConfig = (values: ScoringConfigFormValues): ScoringConfig => ({
  minScore: values.minScore,
  weights: {
    skillMatch: values.weights.skillMatch,
    experienceMatch: values.weights.experienceMatch,
    seniorityMatch: values.weights.seniorityMatch,
  },
  seniority: {
    preferred: cleanList(values.seniority.preferred),
    acceptable: cleanList(values.seniority.acceptable),
    rejected: cleanList(values.seniority.rejected),
    preferredBonus: values.seniority.preferredBonus,
    acceptablePenalty: values.seniority.acceptablePenalty,
    rejectedPenalty: values.seniority.rejectedPenalty,
  },
  location: {
    allowRemote: values.location.allowRemote,
    allowHybrid: values.location.allowHybrid,
    allowOnsite: values.location.allowOnsite,
    userTimezone: values.location.userTimezone,
    maxTimezoneDiffHours: values.location.maxTimezoneDiffHours,
    perHourPenalty: values.location.perHourPenalty,
    hybridSameCityBonus: values.location.hybridSameCityBonus,
    userCity: values.location.userCity?.trim() || undefined,
  },
  technology: {
    required: cleanList(values.technology.required),
    preferred: cleanList(values.technology.preferred),
    disliked: cleanList(values.technology.disliked),
    rejected: cleanList(values.technology.rejected),
    requiredBonus: values.technology.requiredBonus,
    preferredBonus: values.technology.preferredBonus,
    dislikedPenalty: values.technology.dislikedPenalty,
  },
  salary: {
    minimum: values.salary.minimum,
    target: values.salary.target,
    belowTargetPenalty: values.salary.belowTargetPenalty,
  },
  experience: {
    userYears: values.experience.userYears,
    maxRequired: values.experience.maxRequired,
    overqualifiedPenalty: values.experience.overqualifiedPenalty,
  },
})

export function ScoringConfigTab({ isSaving, config, onSave, onReset }: ScoringConfigTabProps) {
  const form = useForm<ScoringConfigFormValues>({
    defaultValues: mapConfigToForm(config ?? DEFAULT_SCORING_CONFIG),
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(mapConfigToForm(config ?? DEFAULT_SCORING_CONFIG))
  }, [config, form])

  const handleSubmit = async (values: ScoringConfigFormValues) => {
    const payload = mapFormToConfig(values)
    await onSave(payload)
    form.reset(mapConfigToForm(payload))
  }

  const handleReset = () => {
    const resetValue = onReset()
    form.reset(mapConfigToForm(resetValue ?? config ?? DEFAULT_SCORING_CONFIG))
  }

  return (
    <TabsContent value="scoring" className="space-y-4 mt-4">
      <Form {...form}>
        <TabCard
          title="Scoring Configuration"
          description="Deterministic scoring engine that evaluates jobs based on extracted data. Higher scores indicate better matches."
          hasChanges={form.formState.isDirty}
          isSaving={isSaving}
          onSave={form.handleSubmit(handleSubmit)}
          onReset={handleReset}
        >
          <div className="space-y-10">
            {/* Score Threshold */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Score Threshold</h3>
                <ImpactBadge label="Pass/Fail" tone="neutral" />
              </div>
              <FormField
                control={form.control}
                name="minScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Score (0-100)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={field.value ?? 60}
                        className="max-w-[9rem]"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Jobs scoring below this threshold are rejected.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* Seniority Preferences */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Seniority Preferences</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Define preferred, acceptable, and rejected seniority levels with corresponding score adjustments.
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <StringListField
                  control={form.control}
                  name="seniority.preferred"
                  label="Preferred Levels"
                  placeholder="senior"
                  description="Ideal seniority levels (bonus points)."
                  info="These seniority levels receive bonus points."
                />
                <StringListField
                  control={form.control}
                  name="seniority.acceptable"
                  label="Acceptable Levels"
                  placeholder="mid"
                  description="Neutral seniority levels."
                  info="These seniority levels are acceptable but don't get bonus points."
                />
                <StringListField
                  control={form.control}
                  name="seniority.rejected"
                  label="Rejected Levels"
                  placeholder="intern"
                  description="Hard reject these levels."
                  info="Jobs with these seniority levels are heavily penalized or rejected."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="seniority.preferredBonus"
                  label="Preferred Bonus"
                  description="Points added for preferred match."
                  info="Score bonus when job seniority matches a preferred level."
                />
                <NumericField
                  control={form.control}
                  name="seniority.acceptablePenalty"
                  label="Acceptable Penalty"
                  description="Points for acceptable match (usually 0)."
                  info="Score adjustment for acceptable seniority levels."
                />
                <NumericField
                  control={form.control}
                  name="seniority.rejectedPenalty"
                  label="Rejected Penalty"
                  description="Large negative for rejected levels."
                  info="Score penalty for rejected seniority levels (use large negative like -100)."
                />
              </div>
            </section>

            {/* Location/Remote Preferences */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Location & Remote Work</h3>
                <ImpactBadge label="Timezone aware" tone="neutral" />
              </div>
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                <Controller
                  control={form.control}
                  name="location.allowRemote"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Allow Remote"
                      description="Accept fully remote positions."
                      info="If unchecked, remote jobs are rejected."
                      field={field}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="location.allowHybrid"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Allow Hybrid"
                      description="Accept hybrid positions."
                      info="If unchecked, hybrid jobs are rejected."
                      field={field}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="location.allowOnsite"
                  render={({ field }) => (
                    <CheckboxRow
                      label="Allow Onsite"
                      description="Accept onsite-only positions."
                      info="If unchecked, onsite-only jobs are rejected."
                      field={field}
                    />
                  )}
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <NumericField
                  control={form.control}
                  name="location.userTimezone"
                  label="Your Timezone (UTC offset)"
                  description="e.g., -8 for PST, -5 for EST"
                  info="Your timezone offset from UTC for timezone compatibility scoring."
                />
                <NumericField
                  control={form.control}
                  name="location.maxTimezoneDiffHours"
                  label="Max TZ Difference (hrs)"
                  description="Beyond this, jobs are penalized heavily."
                  info="Maximum timezone difference before significant score penalties apply."
                />
                <NumericField
                  control={form.control}
                  name="location.perHourPenalty"
                  label="Per-Hour TZ Penalty"
                  description="Points deducted per hour difference."
                  info="Score penalty per hour of timezone difference."
                />
                <NumericField
                  control={form.control}
                  name="location.hybridSameCityBonus"
                  label="Same City Bonus"
                  description="Bonus for hybrid in your city."
                  info="Score bonus when hybrid job is in your city."
                />
              </div>
              <FormField
                control={form.control}
                name="location.userCity"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel>Your City</FormLabel>
                      <InfoTooltip content="Your city for hybrid job matching bonus." />
                    </div>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="San Francisco"
                        className="max-w-[20rem]"
                      />
                    </FormControl>
                    <FormDescription>Optional: Your city for hybrid job matching.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* Technology Preferences */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Technology Stack</h3>
                <ImpactBadge label="Score or Reject" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Configure technology preferences. Required techs boost score, rejected techs can fail a job.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <StringListField
                  control={form.control}
                  name="technology.required"
                  label="Required Technologies"
                  placeholder="typescript"
                  description="Must have at least one of these."
                  info="Jobs must mention at least one of these technologies to score well."
                />
                <StringListField
                  control={form.control}
                  name="technology.preferred"
                  label="Preferred Technologies"
                  placeholder="react"
                  description="Bonus points for these."
                  info="Each of these technologies adds bonus points to the score."
                />
                <StringListField
                  control={form.control}
                  name="technology.disliked"
                  label="Disliked Technologies"
                  placeholder="angular"
                  description="Penalty points for these."
                  info="Each of these technologies deducts points from the score."
                />
                <StringListField
                  control={form.control}
                  name="technology.rejected"
                  label="Rejected Technologies"
                  placeholder="wordpress"
                  description="Hard reject jobs with these."
                  info="Jobs prominently featuring these technologies are heavily penalized or rejected."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="technology.requiredBonus"
                  label="Required Tech Bonus"
                  description="Per required tech found."
                  info="Score bonus per required technology found in the job."
                />
                <NumericField
                  control={form.control}
                  name="technology.preferredBonus"
                  label="Preferred Tech Bonus"
                  description="Per preferred tech found."
                  info="Score bonus per preferred technology found in the job."
                />
                <NumericField
                  control={form.control}
                  name="technology.dislikedPenalty"
                  label="Disliked Tech Penalty"
                  description="Per disliked tech found (negative)."
                  info="Score penalty per disliked technology found in the job."
                />
              </div>
            </section>

            {/* Salary Preferences */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Salary Preferences</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="salary.minimum"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1">
                        <FormLabel>Minimum Salary ($)</FormLabel>
                        <InfoTooltip content="Jobs below this salary are heavily penalized." />
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value ?? ""}
                          className="max-w-[11rem]"
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Hard floor for salary (optional).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salary.target"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1">
                        <FormLabel>Target Salary ($)</FormLabel>
                        <InfoTooltip content="Ideal salary - jobs below this are penalized proportionally." />
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value ?? ""}
                          className="max-w-[11rem]"
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Ideal salary target (optional).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <NumericField
                  control={form.control}
                  name="salary.belowTargetPenalty"
                  label="Below Target Penalty"
                  description="Penalty per $10k below target."
                  info="Score penalty for each $10k the salary is below target."
                />
              </div>
            </section>

            {/* Experience Preferences */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Experience Level</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="experience.userYears"
                  label="Your Experience (years)"
                  description="Your years of professional experience."
                  info="Used to calculate over/under-qualification penalties."
                />
                <NumericField
                  control={form.control}
                  name="experience.maxRequired"
                  label="Max Required (years)"
                  description="Reject if job requires more than this."
                  info="Jobs requiring more experience than this are penalized."
                />
                <NumericField
                  control={form.control}
                  name="experience.overqualifiedPenalty"
                  label="Overqualified Penalty"
                  description="Per year overqualified."
                  info="Score penalty per year you exceed the job's max requirement."
                />
              </div>
            </section>
          </div>
        </TabCard>
      </Form>
    </TabsContent>
  )
}
