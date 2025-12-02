import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { TabCard } from "../shared"
import { StringListField, NumericField, CheckboxRow, ImpactBadge, InfoTooltip } from "../shared/form-fields"
import type { MatchPolicy } from "@shared/types"

type MatchPolicyFormValues = MatchPolicy

type MatchPolicyTabProps = {
  isSaving: boolean
  config: MatchPolicy
  onSave: (config: MatchPolicy) => Promise<void> | void
  onReset: () => MatchPolicy
}

const cleanList = (items?: string[]) => (items ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)

// No defaults - config is required and validated by backend
const mapConfigToForm = (config: MatchPolicy): MatchPolicyFormValues => config

const mapFormToConfig = (values: MatchPolicyFormValues): MatchPolicy => ({
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
  freshness: {
    freshBonusDays: values.freshness.freshBonusDays,
    freshBonus: values.freshness.freshBonus,
    staleThresholdDays: values.freshness.staleThresholdDays,
    stalePenalty: values.freshness.stalePenalty,
    veryStaleDays: values.freshness.veryStaleDays,
    veryStalePenalty: values.freshness.veryStalePenalty,
    repostPenalty: values.freshness.repostPenalty,
  },
  roleFit: {
    backendBonus: values.roleFit.backendBonus,
    mlAiBonus: values.roleFit.mlAiBonus,
    devopsSreBonus: values.roleFit.devopsSreBonus,
    dataBonus: values.roleFit.dataBonus,
    securityBonus: values.roleFit.securityBonus,
    leadBonus: values.roleFit.leadBonus,
    frontendPenalty: values.roleFit.frontendPenalty,
    consultingPenalty: values.roleFit.consultingPenalty,
    clearancePenalty: values.roleFit.clearancePenalty,
    managementPenalty: values.roleFit.managementPenalty,
  },
  company: {
    preferredCityBonus: values.company.preferredCityBonus,
    preferredCity: values.company.preferredCity?.trim() || undefined,
    remoteFirstBonus: values.company.remoteFirstBonus,
    aiMlFocusBonus: values.company.aiMlFocusBonus,
    largeCompanyBonus: values.company.largeCompanyBonus,
    smallCompanyPenalty: values.company.smallCompanyPenalty,
    largeCompanyThreshold: values.company.largeCompanyThreshold,
    smallCompanyThreshold: values.company.smallCompanyThreshold,
    startupBonus: values.company.startupBonus,
  },
  dealbreakers: {
    blockedLocations: cleanList(values.dealbreakers.blockedLocations),
    locationPenalty: values.dealbreakers.locationPenalty,
    relocationPenalty: values.dealbreakers.relocationPenalty,
    ambiguousLocationPenalty: values.dealbreakers.ambiguousLocationPenalty,
  },
})

/** @deprecated Use MatchPolicyTab instead */
export const ScoringConfigTab = MatchPolicyTab

export function MatchPolicyTab({ isSaving, config, onSave, onReset }: MatchPolicyTabProps) {
  const form = useForm<MatchPolicyFormValues>({
    defaultValues: mapConfigToForm(config),
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(mapConfigToForm(config))
  }, [config, form])

  const handleSubmit = async (values: MatchPolicyFormValues) => {
    const payload = mapFormToConfig(values)
    await onSave(payload)
    form.reset(mapConfigToForm(payload))
  }

  const handleReset = () => {
    const resetValue = onReset()
    form.reset(mapConfigToForm(resetValue))
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
                  name="freshness.freshBonusDays"
                  label="Fresh Threshold (days)"
                  description="Jobs newer than this get bonus."
                  info="Number of days a job is considered 'fresh'."
                />
                <NumericField
                  control={form.control}
                  name="freshness.freshBonus"
                  label="Fresh Bonus"
                  description="Points for fresh jobs."
                  info="Score bonus for jobs within the fresh threshold."
                />
                <NumericField
                  control={form.control}
                  name="freshness.staleThresholdDays"
                  label="Stale Threshold (days)"
                  description="Jobs older than this get penalty."
                  info="Number of days before a job is considered 'stale'."
                />
                <NumericField
                  control={form.control}
                  name="freshness.stalePenalty"
                  label="Stale Penalty"
                  description="Points for stale jobs (negative)."
                  info="Score penalty for jobs past the stale threshold."
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
                  name="freshness.veryStalePenalty"
                  label="Very Stale Penalty"
                  description="Points for very stale (negative)."
                  info="Score penalty for very old job listings."
                />
                <NumericField
                  control={form.control}
                  name="freshness.repostPenalty"
                  label="Repost Penalty"
                  description="Penalty for reposted jobs."
                  info="Score penalty when a job appears to be reposted."
                />
              </div>
            </section>

            {/* Role Fit Scoring */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Role Fit</h3>
                <ImpactBadge label="Score adjustment" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Bonuses and penalties based on role type (backend, ML/AI, consulting, etc.).
              </p>
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
                <NumericField
                  control={form.control}
                  name="roleFit.backendBonus"
                  label="Backend Bonus"
                  description="Backend-focused roles."
                  info="Score bonus for backend/server-side roles."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.mlAiBonus"
                  label="ML/AI Bonus"
                  description="ML/AI-focused roles."
                  info="Score bonus for machine learning and AI roles."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.devopsSreBonus"
                  label="DevOps/SRE Bonus"
                  description="DevOps/SRE roles."
                  info="Score bonus for DevOps and SRE roles."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.dataBonus"
                  label="Data Eng Bonus"
                  description="Data engineering roles."
                  info="Score bonus for data engineering roles."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.securityBonus"
                  label="Security Bonus"
                  description="Security engineering."
                  info="Score bonus for security engineering roles."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
                <NumericField
                  control={form.control}
                  name="roleFit.leadBonus"
                  label="Lead Bonus"
                  description="Technical lead roles."
                  info="Score bonus for technical lead positions."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.frontendPenalty"
                  label="Frontend Penalty"
                  description="Frontend-only roles."
                  info="Score penalty for frontend-only positions."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.consultingPenalty"
                  label="Consulting Penalty"
                  description="Consulting/agency roles."
                  info="Score penalty for consulting or agency positions."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.managementPenalty"
                  label="Management Penalty"
                  description="People management roles."
                  info="Score penalty for management positions."
                />
                <NumericField
                  control={form.control}
                  name="roleFit.clearancePenalty"
                  label="Clearance Penalty"
                  description="Clearance required (large negative)."
                  info="Score penalty for roles requiring security clearance."
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
                  name="company.preferredCityBonus"
                  label="Preferred City Bonus"
                  description="Bonus for office in preferred city."
                  info="Score bonus when company has office in your preferred city."
                />
                <NumericField
                  control={form.control}
                  name="company.remoteFirstBonus"
                  label="Remote-First Bonus"
                  description="Bonus for remote-first companies."
                  info="Score bonus for companies with remote-first culture."
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="company.aiMlFocusBonus"
                  label="AI/ML Focus Bonus"
                  description="Bonus for AI/ML companies."
                  info="Score bonus for companies focused on AI/ML."
                />
                <NumericField
                  control={form.control}
                  name="company.largeCompanyBonus"
                  label="Large Company Bonus"
                  description="Bonus for large companies."
                  info="Score bonus for companies above the large threshold."
                />
                <NumericField
                  control={form.control}
                  name="company.smallCompanyPenalty"
                  label="Small Company Penalty"
                  description="Penalty for small companies."
                  info="Score penalty for companies below the small threshold."
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
                  name="company.startupBonus"
                  label="Startup Bonus"
                  description="Alternative to small penalty."
                  info="If set, small companies get this bonus instead of penalty."
                />
              </div>
            </section>

            {/* Dealbreakers */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Dealbreakers</h3>
                <ImpactBadge label="Hard reject" tone="neutral" />
              </div>
              <p className="text-sm text-muted-foreground">
                Location-based penalties and blocked regions.
              </p>
              <StringListField
                control={form.control}
                name="dealbreakers.blockedLocations"
                label="Blocked Locations"
                placeholder="india"
                description="Locations that trigger penalties."
                info="Jobs mentioning these locations receive heavy penalties."
              />
              <div className="grid gap-6 md:grid-cols-3">
                <NumericField
                  control={form.control}
                  name="dealbreakers.locationPenalty"
                  label="Blocked Location Penalty"
                  description="Penalty for blocked locations."
                  info="Score penalty when job mentions a blocked location."
                />
                <NumericField
                  control={form.control}
                  name="dealbreakers.relocationPenalty"
                  label="Relocation Penalty"
                  description="Penalty when relocation required."
                  info="Score penalty when job requires relocation."
                />
                <NumericField
                  control={form.control}
                  name="dealbreakers.ambiguousLocationPenalty"
                  label="Ambiguous Location Penalty"
                  description="Penalty for unclear location."
                  info="Score penalty when job location is unclear."
                />
              </div>
            </section>
          </div>
        </TabCard>
      </Form>
    </TabsContent>
  )
}
