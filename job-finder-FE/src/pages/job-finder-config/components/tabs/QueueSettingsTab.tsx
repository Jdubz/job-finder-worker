import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { ConfigState } from "../../hooks/useConfigState"

type QueueSettingsTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "queueSettings"
  | "setQueueSettings"
  | "hasQueueChanges"
  | "handleSaveQueueSettings"
  | "handleResetQueueSettings"
>

export function QueueSettingsTab({
  isSaving,
  queueSettings,
  setQueueSettings,
  hasQueueChanges,
  handleSaveQueueSettings,
  handleResetQueueSettings,
}: QueueSettingsTabProps) {
  return (
    <TabsContent value="queue" className="space-y-4 mt-4">
      <TabCard
        title="Queue Processing Settings"
        description="Configure job queue processing parameters. Retries are paused until recovery tooling ships."
        hasChanges={hasQueueChanges}
        isSaving={isSaving}
        onSave={handleSaveQueueSettings}
        onReset={handleResetQueueSettings}
      >
        <div className="space-y-2">
          <Label htmlFor="processingTimeout">Processing Timeout (seconds)</Label>
          <Input
            id="processingTimeout"
            type="number"
            min="60"
            max="86400"
            value={queueSettings?.processingTimeoutSeconds ?? 1800}
            onChange={(e) =>
              setQueueSettings((prev) =>
                prev
                  ? { ...prev, processingTimeoutSeconds: parseInt(e.target.value) || 1800 }
                  : null
              )
            }
          />
          <p className="text-xs text-gray-500">
            Maximum time allowed for job processing. Retries are disabled; choose a generous window.
          </p>
        </div>
      </TabCard>
    </TabsContent>
  )
}

