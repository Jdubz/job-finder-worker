import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useConfigState } from "./hooks/useConfigState"
import { QueueSettingsTab, LlmStatusTab } from "./components/tabs"
import { useSearchParams } from "react-router-dom"

type TabType = "queue" | "llm"

export function JobFinderConfigPage() {
  const { user, isOwner } = useAuth()
  const configState = useConfigState()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get("tab") as TabType | null) ?? "queue"
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabType | null
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [searchParams, activeTab])

  const handleTabChange = (value: string) => {
    const tabValue = (value as TabType) ?? "queue"
    setActiveTab(tabValue)
    const params = new URLSearchParams(searchParams)
    params.set("tab", tabValue)
    setSearchParams(params, { replace: true })
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert className="max-w-md">
          <AlertDescription>Please sign in to manage configurations.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert className="max-w-md">
          <AlertDescription>
            You do not have permission to access job finder configuration. Admin access required.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (configState.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6" id="config-page-root">
      <div>
        <h1 className="text-2xl font-bold">Job Finder Configuration</h1>
        <p className="text-muted-foreground">Manage system-level worker runtime and LLM configuration.</p>
      </div>

      {configState.error && (
        <Alert variant="destructive">
          <AlertDescription>{configState.error}</AlertDescription>
        </Alert>
      )}

      {configState.success && (
        <Alert>
          <AlertDescription>{configState.success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="queue">Worker Runtime</TabsTrigger>
          <TabsTrigger value="llm">LLM Status</TabsTrigger>
        </TabsList>

        <div className="space-y-4 py-4">
          {activeTab === "queue" && configState.workerSettings && (
            <QueueSettingsTab
              isSaving={configState.isSaving}
              queueSettings={configState.workerSettings.runtime}
              setQueueSettings={configState.setRuntimeSettings}
              scrapingSettings={configState.workerSettings.scraping}
              setScrapingSettings={configState.setScrapingSettings}
              hasQueueChanges={configState.hasWorkerChanges}
              handleSaveQueueSettings={configState.handleSaveWorkerSettings}
              resetQueue={() => configState.resetWorker()}
            />
          )}

          {activeTab === "llm" && configState.workerSettings && (
            <LlmStatusTab
              useLocalModels={configState.workerSettings.runtime.useLocalModels ?? true}
              onToggleLocalModels={configState.setLocalModels}
              hasChanges={configState.hasWorkerChanges}
              isSaving={configState.isSaving}
              onSave={configState.handleSaveWorkerSettings}
              onReset={configState.resetWorker}
            />
          )}
        </div>
      </Tabs>
    </div>
  )
}
