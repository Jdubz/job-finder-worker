import { useEffect } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { TabCard } from "../shared"
import { CheckboxRow, ImpactBadge, NumericField, StringListField } from "../shared/form-fields"
import type { PreFilterPolicy } from "@shared/types"

type PrefilterPolicyTabProps = {
  isSaving: boolean
  config: PreFilterPolicy
  onSave: (config: PreFilterPolicy) => Promise<void> | void
  onReset: () => PreFilterPolicy | undefined | void
}

const cleanList = (items: string[]) => items.map((item) => item.trim()).filter(Boolean)

const mapToForm = (config?: PreFilterPolicy): PreFilterPolicy => {
  if (!config) throw new Error("prefilter-policy config is missing")
  return {
    title: {
      requiredKeywords: config.title.requiredKeywords,
      excludedKeywords: config.title.excludedKeywords,
    },
    freshness: {
      maxAgeDays: config.freshness.maxAgeDays,
    },
    workArrangement: {
      allowRemote: config.workArrangement.allowRemote,
      allowHybrid: config.workArrangement.allowHybrid,
      allowOnsite: config.workArrangement.allowOnsite,
      willRelocate: config.workArrangement.willRelocate,
      userLocation: config.workArrangement.userLocation,
    },
    employmentType: {
      allowFullTime: config.employmentType.allowFullTime,
      allowPartTime: config.employmentType.allowPartTime,
      allowContract: config.employmentType.allowContract,
    },
    salary: {
      minimum: config.salary.minimum,
    },
    technology: {
      rejected: config.technology.rejected,
    },
  }
}

export function PrefilterPolicyTab({ isSaving, config, onSave, onReset }: PrefilterPolicyTabProps) {
  const form = useForm<PreFilterPolicy>({
    defaultValues: mapToForm(config),
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(mapToForm(config))
  }, [config, form])

  const handleSubmit = async (values: PreFilterPolicy) => {
    const payload: PreFilterPolicy = {
      ...values,
      title: {
        requiredKeywords: cleanList(values.title.requiredKeywords ?? []),
        excludedKeywords: cleanList(values.title.excludedKeywords ?? []),
      },
      freshness: {
        maxAgeDays: Math.max(0, Number(values.freshness.maxAgeDays) || 0),
      },
      salary: {
        minimum:
          values.salary.minimum === null || values.salary.minimum === undefined || Number.isNaN(values.salary.minimum)
            ? null
            : Number(values.salary.minimum),
      },
      workArrangement: {
        allowRemote: Boolean(values.workArrangement.allowRemote),
        allowHybrid: Boolean(values.workArrangement.allowHybrid),
        allowOnsite: Boolean(values.workArrangement.allowOnsite),
        willRelocate: Boolean(values.workArrangement.willRelocate),
        userLocation: (values.workArrangement.userLocation ?? "").trim(),
      },
      employmentType: {
        allowFullTime: Boolean(values.employmentType.allowFullTime),
        allowPartTime: Boolean(values.employmentType.allowPartTime),
        allowContract: Boolean(values.employmentType.allowContract),
      },
      technology: {
        rejected: cleanList(values.technology.rejected ?? []),
      },
    }

    await onSave(payload)
    form.reset(mapToForm(payload))
  }

  const handleReset = () => {
    const resetValue = onReset()
    form.reset(mapToForm((resetValue as PreFilterPolicy | undefined) ?? config))
  }

  return (
    <TabsContent value="prefilter" className="space-y-4 mt-4">
      <FormProvider {...form}>
        <Form {...form}>
          <TabCard
            title="Pre-Filter Policy"
            description="Hard gates applied before queueing or AI extraction. Missing configs fail immediately."
            hasChanges={form.formState.isDirty}
            isSaving={isSaving}
            onSave={form.handleSubmit(handleSubmit)}
            onReset={handleReset}
          >
            <div className="space-y-8">
              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Title Keywords</h3>
                  <ImpactBadge label="Instant pass/fail" tone="neutral" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Keep these lists tight—jobs that fail title keywords never enter the system. Required keywords use
                  OR logic; excluded keywords fail immediately.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <StringListField
                    control={form.control}
                    name="title.requiredKeywords"
                    label="Required Keywords"
                    placeholder="engineer"
                    description="Job title must include at least one of these keywords to continue."
                  />
                  <StringListField
                    control={form.control}
                    name="title.excludedKeywords"
                    label="Excluded Keywords"
                    placeholder="intern"
                    description="If any appear in the title, the job is rejected."
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Freshness & Salary Floors</h3>
                  <ImpactBadge label="Stop obvious stale/low offers" tone="negative" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <NumericField
                    control={form.control}
                    name="freshness.maxAgeDays"
                    label="Max Age (days)"
                    description="Reject listings older than this. Use a high value to stay permissive vs. match-policy."
                  />
                  <FormField
                    control={form.control}
                    name="salary.minimum"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Salary (absolute floor)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                            placeholder="e.g., 80000"
                          />
                        </FormControl>
                        <FormDescription>Set to blank/null to disable salary prefiltering.</FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Work Arrangement</h3>
                  <ImpactBadge label="Hard gate" tone="negative" />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="workArrangement.allowRemote"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Allow Remote"
                        description="Accept roles explicitly marked remote."
                        field={field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workArrangement.allowHybrid"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Allow Hybrid"
                        description="Accept hybrid roles."
                        field={field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workArrangement.allowOnsite"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Allow Onsite"
                        description="Accept onsite-only roles."
                        field={field}
                      />
                    )}
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="workArrangement.willRelocate"
                    render={({ field }) => (
                      <CheckboxRow
                        label="Open to Relocation"
                        description="If unchecked, onsite/hybrid must match your city below."
                        field={field}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workArrangement.userLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your City, State</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Portland, OR" {...field} />
                        </FormControl>
                        <FormDescription>Used to gate onsite/hybrid when relocation is off.</FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Employment Type</h3>
                  <ImpactBadge label="Hard gate" tone="negative" />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="employmentType.allowFullTime"
                    render={({ field }) => (
                      <CheckboxRow label="Allow Full-time" description="Accept full-time roles." field={field} />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="employmentType.allowPartTime"
                    render={({ field }) => (
                      <CheckboxRow label="Allow Part-time" description="Accept part-time roles." field={field} />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="employmentType.allowContract"
                    render={({ field }) => (
                      <CheckboxRow label="Allow Contract" description="Accept contract roles." field={field} />
                    )}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">Technology Hard Rejections</h3>
                  <ImpactBadge label="Instant reject" tone="negative" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Structured tags only. Use for absolute no-gos (e.g., PHP if never considered). Should be a subset of
                  match-policy technology rejects.
                </p>
                <StringListField
                  control={form.control}
                  name="technology.rejected"
                  label="Rejected Technologies"
                  placeholder="php"
                  description="Jobs tagged with any of these are discarded before extraction."
                />
              </section>
            </div>
          </TabCard>
        </Form>
      </FormProvider>
    </TabsContent>
  )
}
