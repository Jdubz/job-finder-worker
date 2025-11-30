import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { SchedulerSettings } from "@shared/types"

type SchedulerTabProps = {
  isSaving: boolean
  schedulerSettings: SchedulerSettings
  hasSchedulerChanges: boolean
  updateSchedulerState: (updates: Partial<SchedulerSettings>) => void
  handleSaveScheduler: () => Promise<void> | void
  resetScheduler: () => void
}

export function SchedulerTab({
  isSaving,
  schedulerSettings,
  hasSchedulerChanges,
  updateSchedulerState,
  handleSaveScheduler,
  resetScheduler,
}: SchedulerTabProps) {
  return (
    <TabsContent value="scheduler" className="space-y-4 mt-4">
      <TabCard
        title="Scheduler Settings"
        description="Worker poll interval and scheduling knobs"
        hasChanges={hasSchedulerChanges}
        isSaving={isSaving}
        onSave={handleSaveScheduler}
        onReset={resetScheduler}
      >
        <div className="space-y-3">
          <Label htmlFor="poll-interval">Poll Interval (seconds)</Label>
          <Input
            id="poll-interval"
            type="number"
            min="5"
            value={schedulerSettings.pollIntervalSeconds}
            onChange={(e) =>
              updateSchedulerState({
                pollIntervalSeconds: Math.max(5, parseInt(e.target.value) || 0),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            How often the worker polls for new queue items. Minimum 5 seconds to avoid churn.
          </p>
        </div>
      </TabCard>
    </TabsContent>
  )
}
