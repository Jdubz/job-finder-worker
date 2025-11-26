import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { ConfigState } from "../../hooks/useConfigState"

type SchedulerTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "currentScheduler"
  | "hasSchedulerChanges"
  | "updateSchedulerState"
  | "handleSaveScheduler"
  | "handleResetSchedulerSettings"
>

export function SchedulerTab({
  isSaving,
  currentScheduler,
  hasSchedulerChanges,
  updateSchedulerState,
  handleSaveScheduler,
  handleResetSchedulerSettings,
}: SchedulerTabProps) {
  return (
    <TabsContent value="scheduler" className="space-y-4 mt-4">
      <TabCard
        title="Scheduler Settings"
        description="Worker poll interval and scheduling knobs"
        hasChanges={hasSchedulerChanges}
        isSaving={isSaving}
        onSave={handleSaveScheduler}
        onReset={handleResetSchedulerSettings}
      >
        <div className="space-y-3">
          <Label htmlFor="poll-interval">Poll Interval (seconds)</Label>
          <Input
            id="poll-interval"
            type="number"
            min="5"
            value={currentScheduler.pollIntervalSeconds}
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
