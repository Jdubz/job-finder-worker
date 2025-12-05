import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { TabCard } from "../shared"
import { StringListField, NumericField, CheckboxRow, ImpactBadge, InfoTooltip } from "../shared/form-fields"
import type { MatchPolicy, SkillMatchConfig } from "@shared/types"

type MatchPolicyFormValues = MatchPolicy

type MatchPolicyTabProps = {
  isSaving: boolean
  config: MatchPolicy | null
  onSave: (config: MatchPolicy) => Promise<void> | void
  onReset: () => void
}

const cleanList = (items?: string[]) => (items ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)

const defaultSkillMatch: SkillMatchConfig = {
  baseMatchScore: 1,
  yearsMultiplier: 0.5,
  maxYearsBonus: 5,
  missingScore: -1,
  analogScore: 0,
  maxBonus: 25,
  maxPenalty: -15,
  analogGroups: [],
}

// No defaults - config is required and validated by backend
const mapConfigToForm = (config: MatchPolicy): MatchPolicyFormValues => ({
  ...config,
  skillMatch: {
    ...(config.skillMatch || defaultSkillMatch),
    analogGroups: ((config.skillMatch || defaultSkillMatch).analogGroups || []).map((group) =>
      group.join(", ")
    ),
  },
})

const mapFormToConfig = (values: MatchPolicyFormValues): MatchPolicy => ({
  ...values,
  minScore: values.minScore,
  seniority: {
    preferred: cleanList(values.seniority.preferred),
    acceptable: cleanList(values.seniority.acceptable),
    rejected: cleanList(values.seniority.rejected),
    preferredScore: values.seniority.preferredScore,
    acceptableScore: values.seniority.acceptableScore,
    rejectedScore: values.seniority.rejectedScore,
  },
  location: {
    allowRemote: values.location.allowRemote,
    allowHybrid: values.location.allowHybrid,
    allowOnsite: values.location.allowOnsite,
    userTimezone: values.location.userTimezone,
    maxTimezoneDiffHours: values.location.maxTimezoneDiffHours,
    perHourScore: values.location.perHourScore,
    hybridSameCityScore: values.location.hybridSameCityScore,
    userCity: values.location.userCity?.trim() || undefined,
    relocationScore: values.location.relocationScore,
  },
  skillMatch: (() => {
    const skillValues = values.skillMatch || defaultSkillMatch
    return {
      baseMatchScore: skillValues.baseMatchScore,
      yearsMultiplier: skillValues.yearsMultiplier,
      maxYearsBonus: skillValues.maxYearsBonus,
      missingScore: skillValues.missingScore,
      analogScore: skillValues.analogScore,
      maxBonus: skillValues.maxBonus,
      maxPenalty: skillValues.maxPenalty,
      analogGroups: (skillValues.analogGroups || []).map((line) =>
        line
          .split(",")
          .map((item) => item.trim())
        .filter(Boolean)
      ),
    }
  })(),
  salary: {
    minimum: values.salary.minimum,
    target: values.salary.target,
    belowTargetScore: values.salary.belowTargetScore,
  },
  experience: {
    maxRequired: values.experience.maxRequired,
    overqualifiedScore: values.experience.overqualifiedScore,
  },
  freshness: {
    freshDays: values.freshness.freshDays,
    freshScore: values.freshness.freshScore,
    staleDays: values.freshness.staleDays,
    staleScore: values.freshness.staleScore,
    veryStaleDays: values.freshness.veryStaleDays,
    veryStaleScore: values.freshness.veryStaleScore,
    repostScore: values.freshness.repostScore,
  },
  roleFit: {
    preferred: cleanList(values.roleFit.preferred),
    acceptable: cleanList(values.roleFit.acceptable),
    penalized: cleanList(values.roleFit.penalized),
    rejected: cleanList(values.roleFit.rejected),
    preferredScore: values.roleFit.preferredScore,
    penalizedScore: values.roleFit.penalizedScore,
  },
  company: {
    preferredCityScore: values.company.preferredCityScore,
    preferredCity: values.company.preferredCity?.trim() || undefined,
    remoteFirstScore: values.company.remoteFirstScore,
    aiMlFocusScore: values.company.aiMlFocusScore,
    largeCompanyScore: values.company.largeCompanyScore,
    smallCompanyScore: values.company.smallCompanyScore,
    largeCompanyThreshold: values.company.largeCompanyThreshold,
    smallCompanyThreshold: values.company.smallCompanyThreshold,
    startupScore: values.company.startupScore,
  },
})

/** @deprecated Use MatchPolicyTab instead */
export const ScoringConfigTab = MatchPolicyTab

export function MatchPolicyTab({ isSaving, config, onSave, onReset }: MatchPolicyTabProps) {
  const form = useForm<MatchPolicyFormValues>({
    defaultValues: config ? mapConfigToForm(config) : undefined,
    mode: "onChange",
  })

  useEffect(() => {
    if (config) {
      form.reset(mapConfigToForm(config))
    }
  }, [config, form])

  const handleSubmit = async (values: MatchPolicyFormValues) => {
    const payload = mapFormToConfig(values)
    await onSave(payload)
    form.reset(mapConfigToForm(payload))
  }

  const handleReset = () => {
    onReset()
    if (config) {
      form.reset(mapConfigToForm(config))
    }
  }

  if (!config) {
    return (
      <TabsContent value="scoring" className="space-y-4 mt-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <h3 className="text-lg font-semibold text-destructive">Configuration Missing</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The match-policy configuration is not set in the database. Please add it before using this feature.
          </p>
        </div>
      </TabsContent>
    )
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
                  name="seniority.preferredScore"
                  label="Preferred Score"
                  description="Points added for preferred match (positive)."
                  info="Score adjustment when job seniority matches a preferred level."
                />
                <NumericField
                  control={form.control}
                  name="seniority.acceptableScore"
                  label="Acceptable Score"
                  description="Points for acceptable match (usually 0)."
                  info="Score adjustment for acceptable seniority levels."
                />
                <NumericField
                  control={form.control}
                  name="seniority.rejectedScore"
                  label="Rejected Score"
                  description="Large negative for rejected levels."
                  info="Score adjustment for rejected seniority levels (use large negative like -100)."
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
                  name="location.perHourScore"
                  label="Per-Hour TZ Score"
                  description="Points per hour difference (negative)."
                  info="Score adjustment per hour of timezone difference."
                />
                <NumericField
                  control={form.control}
                  name="location.hybridSameCityScore"
                  label="Same City Score"
                  description="Points for hybrid in your city (positive)."
                  info="Score adjustment when hybrid job is in your city."
                />
                <NumericField
                  control={form.control}
                  name="location.relocationScore"
                  label="Relocation Score"
                  description="Points when relocation required (negative)."
                  info="Score adjustment when job requires relocation."
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

            {/* Skill Matching */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Skill Matching</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Skills and experience are derived from your content items. Configure how matches and gaps are scored.
              </p>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="skillMatch.baseMatchScore"
                  label="Base Match Score"
                  description="Points per matched skill."
                  info="Added for every job skill you have."
                />
                <NumericField
                  control={form.control}
                  name="skillMatch.yearsMultiplier"
                  label="Years Multiplier"
                  description="Points per year (per skill)."
                  info="Multiplied by your years with that skill, capped by Max Years Bonus."
                />
                <NumericField
                  control={form.control}
                  name="skillMatch.maxYearsBonus"
                  label="Max Years Bonus"
                  description="Years cap per skill."
                  info="Years above this do not increase the score."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="skillMatch.missingScore"
                  label="Missing Skill Penalty"
                  description="Penalty per missing job skill."
                  info="Applied for each job skill you lack."
                />
                <NumericField
                  control={form.control}
                  name="skillMatch.analogScore"
                  label="Analog Skill Score"
                  description="Points when an equivalent skill exists."
                  info="Neutral or slight bonus when you have an analog skill."
                />
                <NumericField
                  control={form.control}
                  name="skillMatch.maxPenalty"
                  label="Max Penalty"
                  description="Minimum total skill score."
                  info="Caps how negative skill matching can go."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <NumericField
                  control={form.control}
                  name="skillMatch.maxBonus"
                  label="Max Bonus"
                  description="Maximum total skill bonus."
                  info="Caps total positive points from skill matching."
                />
                <StringListField
                  control={form.control}
                  name="skillMatch.analogGroups"
                  label="Analog Skill Groups"
                  placeholder="aws, gcp, azure"
                  description="Enter comma-separated groups of equivalent skills (one group per line)."
                  info="Skills in the same group are treated as equivalents."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Skills and experience years are derived automatically from your content items.
              </p>
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
                  name="salary.belowTargetScore"
                  label="Below Target Score"
                  description="Points per $10k below target (negative)."
                  info="Score adjustment for each $10k the salary is below target."
                />
              </div>
            </section>

            {/* Experience Preferences */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Experience Level</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <NumericField
                  control={form.control}
                  name="experience.maxRequired"
                  label="Max Required (years)"
                  description="Reject if job requires more than this."
                  info="Jobs requiring more experience than this are penalized."
                />
                <NumericField
                  control={form.control}
                  name="experience.overqualifiedScore"
                  label="Overqualified Score"
                  description="Per year overqualified (negative)."
                  info="Score adjustment per year you exceed the job's max requirement."
                />
              </div>
            </section>

            {/* Freshness/Age Scoring */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Listing Freshness</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Score adjustments based on how recently the job was posted.
              </p>
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
                <NumericField
                  control={form.control}
                  name="freshness.freshDays"
                  label="Fresh Threshold (days)"
                  description="Jobs newer than this get bonus."
                  info="Number of days a job is considered 'fresh'."
                />
                <NumericField
                  control={form.control}
                  name="freshness.freshScore"
                  label="Fresh Score"
                  description="Points for fresh jobs (positive)."
                  info="Score adjustment for jobs within the fresh threshold."
                />
                <NumericField
                  control={form.control}
                  name="freshness.staleDays"
                  label="Stale Threshold (days)"
                  description="Jobs older than this get penalty."
                  info="Number of days before a job is considered 'stale'."
                />
                <NumericField
                  control={form.control}
                  name="freshness.staleScore"
                  label="Stale Score"
                  description="Points for stale jobs (negative)."
                  info="Score adjustment for jobs past the stale threshold."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="freshness.veryStaleDays"
                  label="Very Stale (days)"
                  description="Severe penalty threshold."
                  info="Number of days before a job is considered 'very stale'."
                />
                <NumericField
                  control={form.control}
                  name="freshness.veryStaleScore"
                  label="Very Stale Score"
                  description="Points for very stale (negative)."
                  info="Score adjustment for very old job listings."
                />
                <NumericField
                  control={form.control}
                  name="freshness.repostScore"
                  label="Repost Score"
                  description="Points for reposted jobs (negative)."
                  info="Score adjustment when a job appears to be reposted."
                />
              </div>
            </section>

            {/* Role Fit Scoring */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Role Fit</h3>
                <ImpactBadge label="Score or Reject" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Configure role type preferences. Common types: backend, frontend, fullstack, ml-ai, devops, data, security, lead, consulting, management, clearance-required.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <StringListField
                  control={form.control}
                  name="roleFit.preferred"
                  label="Preferred Role Types"
                  placeholder="backend"
                  description="Bonus points for these role types."
                  info="Jobs matching these role types get bonus points."
                />
                <StringListField
                  control={form.control}
                  name="roleFit.acceptable"
                  label="Acceptable Role Types"
                  placeholder="fullstack"
                  description="Neutral - no bonus or penalty."
                  info="Jobs matching these role types are acceptable but get no bonus."
                />
                <StringListField
                  control={form.control}
                  name="roleFit.penalized"
                  label="Penalized Role Types"
                  placeholder="frontend-only"
                  description="Penalty points for these role types."
                  info="Jobs matching these role types get penalty points."
                />
                <StringListField
                  control={form.control}
                  name="roleFit.rejected"
                  label="Rejected Role Types"
                  placeholder="management"
                  description="Hard reject for these role types."
                  info="Jobs matching these role types are automatically rejected."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <NumericField
                  control={form.control}
                  name="roleFit.preferredScore"
                  label="Preferred Role Score"
                  description="Points per preferred role type (positive)."
                  info="Score adjustment for each preferred role type found."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.penalizedScore"
                  label="Penalized Role Score"
                  description="Points per penalized role type (negative)."
                  info="Score adjustment for each penalized role type found."
                />
              </div>
            </section>

            {/* Company Signals */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Company Signals</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Bonuses and penalties based on company characteristics.
              </p>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="company.preferredCity"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1">
                        <FormLabel>Preferred City</FormLabel>
                        <InfoTooltip content="City where you'd like the company to have an office." />
                      </div>
                      <FormControl>
                        <Input
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="Portland"
                          className="max-w-[15rem]"
                        />
                      </FormControl>
                      <FormDescription>Bonus if company has office here.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <NumericField
                  control={form.control}
                  name="company.preferredCityScore"
                  label="Preferred City Score"
                  description="Points for office in preferred city (positive)."
                  info="Score adjustment when company has office in your preferred city."
                />
                <NumericField
                  control={form.control}
                  name="company.remoteFirstScore"
                  label="Remote-First Score"
                  description="Points for remote-first companies (positive)."
                  info="Score adjustment for companies with remote-first culture."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="company.aiMlFocusScore"
                  label="AI/ML Focus Score"
                  description="Points for AI/ML companies (positive)."
                  info="Score adjustment for companies focused on AI/ML."
                />
                <NumericField
                  control={form.control}
                  name="company.largeCompanyScore"
                  label="Large Company Score"
                  description="Points for large companies (positive)."
                  info="Score adjustment for companies above the large threshold."
                />
                <NumericField
                  control={form.control}
                  name="company.smallCompanyScore"
                  label="Small Company Score"
                  description="Points for small companies (negative)."
                  info="Score adjustment for companies below the small threshold."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="company.largeCompanyThreshold"
                  label="Large Threshold"
                  description="Employee count for 'large'."
                  info="Companies with more employees than this are considered large."
                />
                <NumericField
                  control={form.control}
                  name="company.smallCompanyThreshold"
                  label="Small Threshold"
                  description="Employee count for 'small'."
                  info="Companies with fewer employees than this are considered small."
                />
                <NumericField
                  control={form.control}
                  name="company.startupScore"
                  label="Startup Score"
                  description="Override for small company score."
                  info="If set, startups get this adjustment instead of small company score."
                />
              </div>
            </section>

          </div>
        </TabCard>
      </Form>
    </TabsContent>
  )
}
