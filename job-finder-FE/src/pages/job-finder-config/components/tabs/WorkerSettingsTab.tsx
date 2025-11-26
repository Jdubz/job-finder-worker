import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabCard } from "../shared"
import type { ConfigState } from "../../hooks/useConfigState"

type WorkerSettingsTabProps = Pick<
  ConfigState,
  | "isSaving"
  | "currentWorker"
  | "hasWorkerSettingsChanges"
  | "updateWorkerSettingsState"
  | "handleSaveWorkerSettings"
  | "handleResetWorkerSettings"
>

export function WorkerSettingsTab({
  isSaving,
  currentWorker,
  hasWorkerSettingsChanges,
  updateWorkerSettingsState,
  handleSaveWorkerSettings,
  handleResetWorkerSettings,
}: WorkerSettingsTabProps) {
  return (
    <TabsContent value="worker" className="space-y-4 mt-4">
      <TabCard
        title="Worker Settings"
        description="Scraping, health tracking, caching, and text limits"
        hasChanges={hasWorkerSettingsChanges}
        isSaving={isSaving}
        onSave={handleSaveWorkerSettings}
        onReset={handleResetWorkerSettings}
      >
        <div>
          <Label className="text-base font-semibold">Scraping Settings</Label>
          <p className="text-xs text-muted-foreground mb-3">HTTP and scraping configuration</p>
          <div className="grid grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="request-timeout">Timeout (s)</Label>
              <Input
                id="request-timeout"
                type="number"
                min="1"
                value={currentWorker.scraping.requestTimeoutSeconds}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    scraping: { ...w.scraping, requestTimeoutSeconds: parseInt(e.target.value) || 30 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate-limit">Rate Limit (s)</Label>
              <Input
                id="rate-limit"
                type="number"
                min="0"
                value={currentWorker.scraping.rateLimitDelaySeconds}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    scraping: { ...w.scraping, rateLimitDelaySeconds: parseInt(e.target.value) || 2 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-retries">Max Retries</Label>
              <Input
                id="max-retries"
                type="number"
                min="0"
                value={currentWorker.scraping.maxRetries}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    scraping: { ...w.scraping, maxRetries: parseInt(e.target.value) || 3 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="html-max">HTML Max</Label>
              <Input
                id="html-max"
                type="number"
                min="1000"
                value={currentWorker.scraping.maxHtmlSampleLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    scraping: { ...w.scraping, maxHtmlSampleLength: parseInt(e.target.value) || 20000 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="html-small">HTML Small</Label>
              <Input
                id="html-small"
                type="number"
                min="1000"
                value={currentWorker.scraping.maxHtmlSampleLengthSmall}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    scraping: { ...w.scraping, maxHtmlSampleLengthSmall: parseInt(e.target.value) || 15000 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Health Tracking</Label>
          <p className="text-xs text-muted-foreground mb-3">Source health monitoring settings</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="max-failures">Max Consecutive Failures</Label>
              <Input
                id="max-failures"
                type="number"
                min="1"
                value={currentWorker.health.maxConsecutiveFailures}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    health: { ...w.health, maxConsecutiveFailures: parseInt(e.target.value) || 5 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="health-interval">Health Check Interval (s)</Label>
              <Input
                id="health-interval"
                type="number"
                min="60"
                value={currentWorker.health.healthCheckIntervalSeconds}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    health: { ...w.health, healthCheckIntervalSeconds: parseInt(e.target.value) || 3600 },
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Cache TTLs</Label>
          <p className="text-xs text-muted-foreground mb-3">Time-to-live for cached data (in seconds)</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company-ttl">Company Info TTL</Label>
              <Input
                id="company-ttl"
                type="number"
                min="60"
                value={currentWorker.cache.companyInfoTtlSeconds}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    cache: { ...w.cache, companyInfoTtlSeconds: parseInt(e.target.value) || 86400 },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Default: 86400 (24 hours)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source-ttl">Source Config TTL</Label>
              <Input
                id="source-ttl"
                type="number"
                min="60"
                value={currentWorker.cache.sourceConfigTtlSeconds}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    cache: { ...w.cache, sourceConfigTtlSeconds: parseInt(e.target.value) || 3600 },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Default: 3600 (1 hour)</p>
            </div>
          </div>
        </div>

        <div>
          <Label className="text-base font-semibold">Text Limits</Label>
          <p className="text-xs text-muted-foreground mb-3">Character limits for text processing</p>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="min-company-page">Min Company Page</Label>
              <Input
                id="min-company-page"
                type="number"
                min="0"
                value={currentWorker.textLimits.minCompanyPageLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, minCompanyPageLength: parseInt(e.target.value) || 200 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-sparse">Min Sparse Info</Label>
              <Input
                id="min-sparse"
                type="number"
                min="0"
                value={currentWorker.textLimits.minSparseCompanyInfoLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, minSparseCompanyInfoLength: parseInt(e.target.value) || 100 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-intake-text">Max Intake Text</Label>
              <Input
                id="max-intake-text"
                type="number"
                min="0"
                value={currentWorker.textLimits.maxIntakeTextLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, maxIntakeTextLength: parseInt(e.target.value) || 500 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-intake-desc">Max Intake Desc</Label>
              <Input
                id="max-intake-desc"
                type="number"
                min="0"
                value={currentWorker.textLimits.maxIntakeDescriptionLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, maxIntakeDescriptionLength: parseInt(e.target.value) || 2000 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-intake-field">Max Intake Field</Label>
              <Input
                id="max-intake-field"
                type="number"
                min="0"
                value={currentWorker.textLimits.maxIntakeFieldLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, maxIntakeFieldLength: parseInt(e.target.value) || 400 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-desc-preview">Max Desc Preview</Label>
              <Input
                id="max-desc-preview"
                type="number"
                min="0"
                value={currentWorker.textLimits.maxDescriptionPreviewLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, maxDescriptionPreviewLength: parseInt(e.target.value) || 500 },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-company-info">Max Company Info</Label>
              <Input
                id="max-company-info"
                type="number"
                min="0"
                value={currentWorker.textLimits.maxCompanyInfoTextLength}
                onChange={(e) =>
                  updateWorkerSettingsState((w) => ({
                    ...w,
                    textLimits: { ...w.textLimits, maxCompanyInfoTextLength: parseInt(e.target.value) || 1000 },
                  }))
                }
              />
            </div>
          </div>
        </div>
      </TabCard>
    </TabsContent>
  )
}
