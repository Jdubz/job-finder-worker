import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { QueueSettings } from "@shared/types"

type QueueSettingsTabProps = {
  isSaving: boolean
  queueSettings: QueueSettings
  setQueueSettings: (updates: Partial<QueueSettings>) => void
  hasQueueChanges: boolean
  handleSaveQueueSettings: () => Promise<void> | void
  resetQueue: () => void
}

export function QueueSettingsTab({
  isSaving,
  queueSettings,
  setQueueSettings,
  hasQueueChanges,
  handleSaveQueueSettings,
  resetQueue,
}: QueueSettingsTabProps) {
  return (
    <TabsContent value="queue" className="space-y-4 mt-4">
      <TabCard
        title="Queue Processing Settings"
        description="Configure job queue processing and polling parameters."
        hasChanges={hasQueueChanges}
        isSaving={isSaving}
        onSave={handleSaveQueueSettings}
        onReset={resetQueue}
      >
        <div className="space-y-2">
          <Label htmlFor="pollInterval">Poll Interval (seconds)</Label>
          <Input
            id="pollInterval"
            type="number"
            min="5"
            value={queueSettings.pollIntervalSeconds ?? 60}
            onChange={(e) =>
              setQueueSettings({
                pollIntervalSeconds: Math.max(5, parseInt(e.target.value) || 60),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            How often the worker polls for new queue items. Minimum 5 seconds to avoid churn.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taskDelay">Task Delay (seconds)</Label>
          <Input
            id="taskDelay"
            type="number"
            min="0"
            max="60"
            value={queueSettings.taskDelaySeconds ?? 0}
            onChange={(e) =>
              setQueueSettings({
                taskDelaySeconds: Math.max(0, parseInt(e.target.value) || 0),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Delay between processing items to ease rate limits. 0–60 seconds.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="processingTimeout">Processing Timeout (seconds)</Label>
          <Input
            id="processingTimeout"
            type="number"
            min="60"
            max="86400"
            value={queueSettings.processingTimeoutSeconds}
            onChange={(e) =>
              setQueueSettings({
                processingTimeoutSeconds: parseInt(e.target.value) || 1800,
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Maximum time allowed for job processing before timeout.
          </p>
        </div>
      </TabCard>
    </TabsContent>
  )
}
