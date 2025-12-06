import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useConfigState } from "./hooks/useConfigState"
import { QueueSettingsTab, AISettingsTab, PersonalInfoTab, PrefilterPolicyTab, MatchPolicyTab } from "./components/tabs"
import { useSearchParams } from "react-router-dom"

type TabType = "prefilter" | "scoring" | "queue" | "ai" | "personal"

export function JobFinderConfigPage() {
  const { user, isOwner } = useAuth()
  const configState = useConfigState()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get("tab") as TabType | null) ?? "prefilter"
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabType | null
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [searchParams, activeTab])

  const handleTabChange = (value: string) => {
    const tabValue = (value as TabType) ?? "prefilter"
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
        <p className="text-muted-foreground">Manage filtering rules, queues, scheduling, and profile defaults.</p>
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="prefilter">Pre-Filter</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="queue">Worker Runtime</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
        </TabsList>

        <div className="space-y-4 py-4">
          {activeTab === "prefilter" && configState.prefilterPolicy && (
            <PrefilterPolicyTab
              isSaving={configState.isSaving}
              config={configState.prefilterPolicy}
              onSave={(policy) => configState.handleSavePrefilter(policy)}
              onReset={() => configState.resetPrefilter()}
            />
          )}

          {activeTab === "scoring" && configState.matchPolicy && (
            <MatchPolicyTab
              isSaving={configState.isSaving}
              config={configState.matchPolicy}
              onSave={configState.handleSaveMatchPolicy}
              onReset={configState.resetMatchPolicy}
            />
          )}
          {activeTab === "scoring" && !configState.matchPolicy && !configState.isLoading && (
            <div className="mt-4 p-6 border rounded-lg bg-muted/50">
              <h3 className="text-lg font-semibold mb-2">Scoring Configuration Required</h3>
              <p className="text-muted-foreground">
                The match-policy configuration has not been set up yet. This configuration defines how jobs are scored
                based on your preferences for seniority, location, skill matching, salary, and other factors.
              </p>
              <p className="text-muted-foreground mt-2">
                Please run the database migration or manually configure the match-policy in the database.
              </p>
            </div>
          )}

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

          {activeTab === "ai" && (
            <AISettingsTab
              isSaving={configState.isSaving}
              aiSettings={configState.aiSettings}
              setAISettings={configState.setAISettings}
              hasAIChanges={configState.hasAIChanges}
              handleSaveAISettings={configState.handleSaveAISettings}
              resetAI={configState.resetAI}
            />
          )}

          {activeTab === "personal" && (
            <PersonalInfoTab
              isSaving={configState.isSaving}
              currentPersonalInfo={configState.personalInfo}
              hasPersonalInfoChanges={configState.hasPersonalInfoChanges}
              updatePersonalInfoState={configState.updatePersonalInfoState}
              handleSavePersonalInfo={configState.handleSavePersonalInfo}
              handleResetPersonalInfo={configState.resetPersonal}
            />
          )}

        </div>
      </Tabs>
    </div>
  )
}
