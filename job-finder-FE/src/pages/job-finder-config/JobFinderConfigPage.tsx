import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useConfigState } from "./hooks/useConfigState"
import {
  QueueSettingsTab,
  AISettingsTab,
  SchedulerTab,
  PersonalInfoTab,
  PrefilterPolicyTab,
  MatchPolicyTab,
} from "./components/tabs"
import { useSearchParams } from "react-router-dom"

type TabType =
  | "prefilter"
  | "match"
  | "queue"
  | "ai"
  | "scheduler"
  | "personal"

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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job Finder Configuration</h1>
          <p className="text-muted-foreground">Manage filtering rules, queues, scheduling, and profile defaults.</p>
        </div>
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
          <TabsTrigger value="prefilter">Prefilter Policy</TabsTrigger>
          <TabsTrigger value="match">Match Policy</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
        </TabsList>

        <div className="space-y-4 py-4">
          {activeTab === "prefilter" && (
            <PrefilterPolicyTab
              isSaving={configState.isSaving}
              policy={configState.prefilterPolicy}
              onSave={configState.handleSavePrefilter}
              onReset={configState.resetPrefilter}
            />
          )}

          {activeTab === "match" && (
            <MatchPolicyTab
              isSaving={configState.isSaving}
              policy={configState.matchPolicy}
              onSave={configState.handleSaveMatch}
              onReset={configState.resetMatch}
            />
          )}

          {activeTab === "queue" && (
            <QueueSettingsTab
              isSaving={configState.isSaving}
              queueSettings={configState.queueSettings}
              setQueueSettings={configState.setQueueSettings}
              hasQueueChanges={configState.hasQueueChanges}
              handleSaveQueueSettings={configState.handleSaveQueueSettings}
              resetQueue={configState.resetQueue}
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

          {activeTab === "scheduler" && (
            <SchedulerTab
              isSaving={configState.isSaving}
              schedulerSettings={configState.schedulerSettings}
              hasSchedulerChanges={configState.hasSchedulerChanges}
              updateSchedulerState={configState.updateSchedulerState}
              handleSaveScheduler={configState.handleSaveScheduler}
              resetScheduler={configState.resetScheduler}
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
