import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { TabsContent } from "@/components/ui/tabs"
import { Form } from "@/components/ui/form"
import { TabCard } from "../shared"
import { StringListField, ImpactBadge } from "../shared/form-fields"
import type { TitleFilterConfig } from "@shared/types"
import { DEFAULT_TITLE_FILTER } from "@shared/types"

type TitleFilterFormValues = {
  requiredKeywords: string[]
  excludedKeywords: string[]
}

type TitleFilterTabProps = {
  isSaving: boolean
  config: TitleFilterConfig
  onSave: (config: TitleFilterConfig) => Promise<void> | void
  onReset: () => TitleFilterConfig
}

const cleanList = (items: string[]) => items.map((item) => item.trim()).filter(Boolean)

const mapConfigToForm = (config?: TitleFilterConfig): TitleFilterFormValues => ({
  requiredKeywords: config?.requiredKeywords ?? DEFAULT_TITLE_FILTER?.requiredKeywords ?? [],
  excludedKeywords: config?.excludedKeywords ?? DEFAULT_TITLE_FILTER?.excludedKeywords ?? [],
})

const mapFormToConfig = (values: TitleFilterFormValues): TitleFilterConfig => ({
  requiredKeywords: cleanList(values.requiredKeywords),
  excludedKeywords: cleanList(values.excludedKeywords),
})

export function TitleFilterTab({ isSaving, config, onSave, onReset }: TitleFilterTabProps) {
  const form = useForm<TitleFilterFormValues>({
    defaultValues: mapConfigToForm(config ?? DEFAULT_TITLE_FILTER),
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(mapConfigToForm(config ?? DEFAULT_TITLE_FILTER))
  }, [config, form])

  const handleSubmit = async (values: TitleFilterFormValues) => {
    const payload = mapFormToConfig(values)
    await onSave(payload)
    form.reset(mapConfigToForm(payload))
  }

  const handleReset = () => {
    const resetValue = onReset()
    form.reset(mapConfigToForm(resetValue ?? config ?? DEFAULT_TITLE_FILTER))
  }

  return (
    <TabsContent value="title-filter" className="space-y-4 mt-4">
      <Form {...form}>
        <TabCard
          title="Title Filter"
          description="Fast pre-filter using simple keyword matching on job titles. Jobs that fail this filter are rejected before any AI analysis."
          hasChanges={form.formState.isDirty}
          isSaving={isSaving}
          onSave={form.handleSubmit(handleSubmit)}
          onReset={handleReset}
        >
          <div className="space-y-8">
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Required Keywords</h3>
                <ImpactBadge label="Must match one" tone="positive" />
              </div>
              <p className="text-sm text-muted-foreground">
                Job titles must contain at least ONE of these keywords to pass. If none match, the job is rejected.
              </p>
              <StringListField
                control={form.control}
                name="requiredKeywords"
                label="Required Title Keywords"
                placeholder="engineer"
                description="Add keywords that should appear in relevant job titles."
                info="Job titles must contain at least one of these keywords. Case-insensitive substring matching."
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Excluded Keywords</h3>
                <ImpactBadge label="Instant reject" tone="negative" />
              </div>
              <p className="text-sm text-muted-foreground">
                Jobs with ANY of these keywords in the title are immediately rejected.
              </p>
              <StringListField
                control={form.control}
                name="excludedKeywords"
                label="Excluded Title Keywords"
                placeholder="intern"
                description="Add keywords that should never appear in job titles."
                info="If any of these keywords appear in the title, the job is rejected. Case-insensitive substring matching."
              />
            </section>
          </div>
        </TabCard>
      </Form>
    </TabsContent>
  )
}
