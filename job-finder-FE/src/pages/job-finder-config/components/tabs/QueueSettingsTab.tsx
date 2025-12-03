import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { WorkerSettings } from "@shared/types"

type RuntimeSettings = WorkerSettings["runtime"]

type QueueSettingsTabProps = {
  isSaving: boolean
  queueSettings: RuntimeSettings
  setQueueSettings: (updates: Partial<RuntimeSettings>) => void
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

      <TabCard
        title="Scrape Schedule Settings"
        description="Values used by the API cron when enqueuing scrape jobs. At least one field is required; use 0 or leave blank for 'no limit'."
        hasChanges={hasQueueChanges}
        isSaving={isSaving}
        onSave={handleSaveQueueSettings}
        onReset={resetQueue}
      >
        <div className="space-y-2">
          <Label htmlFor="targetMatches">Target Matches</Label>
          <Input
            id="targetMatches"
            type="number"
            min="0"
            value={queueSettings.scrapeConfig?.target_matches ?? 0}
            onChange={(e) =>
              setQueueSettings({
                scrapeConfig: {
                  ...queueSettings.scrapeConfig,
                  target_matches: Math.max(0, parseInt(e.target.value) || 0),
                },
              })
            }
          />
          <p className="text-xs text-muted-foreground">Stop after N matches; 0 means no limit.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxSources">Max Sources</Label>
          <Input
            id="maxSources"
            type="number"
            min="0"
            value={queueSettings.scrapeConfig?.max_sources ?? 0}
            onChange={(e) =>
              setQueueSettings({
                scrapeConfig: {
                  ...queueSettings.scrapeConfig,
                  max_sources: Math.max(0, parseInt(e.target.value) || 0),
                },
              })
            }
          />
          <p className="text-xs text-muted-foreground">Limit number of sources per run; 0 means all.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceIds">Source IDs (comma-separated)</Label>
          <Input
            id="sourceIds"
            type="text"
            value={queueSettings.scrapeConfig?.source_ids?.join(", ") ?? ""}
            onChange={(e) =>
              setQueueSettings({
                scrapeConfig: {
                  ...queueSettings.scrapeConfig,
                  source_ids: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
          />
          <p className="text-xs text-muted-foreground">Optional whitelist of source IDs. Leave blank for rotation across all.</p>
        </div>
      </TabCard>
    </TabsContent>
  )
}
