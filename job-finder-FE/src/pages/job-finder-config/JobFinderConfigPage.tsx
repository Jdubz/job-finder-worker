import { useAuth } from "@/contexts/AuthContext"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useConfigState } from "./hooks/useConfigState"
import {
  StopListTab,
  QueueSettingsTab,
  AISettingsTab,
  JobMatchTab,
  JobFiltersTab,
  TechnologyRanksTab,
  SchedulerTab,
  CompanyScoringTab,
  WorkerSettingsTab,
} from "./components/tabs"

export function JobFinderConfigPage() {
  const { user, isOwner } = useAuth()
  const configState = useConfigState()

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
            You do not have permission to access job finder configuration. Editor role required.
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
          <p className="text-muted-foreground">Manage filtering rules, technology rankings, and worker settings</p>
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

      <Tabs defaultValue="stop-list" className="w-full">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="stop-list">Stop List</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="job-match">Match</TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
          <TabsTrigger value="tech">Tech</TabsTrigger>
          <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="worker">Worker</TabsTrigger>
        </TabsList>

        <StopListTab
          isSaving={configState.isSaving}
          stopList={configState.stopList}
          newCompany={configState.newCompany}
          setNewCompany={configState.setNewCompany}
          newKeyword={configState.newKeyword}
          setNewKeyword={configState.setNewKeyword}
          newDomain={configState.newDomain}
          setNewDomain={configState.setNewDomain}
          hasStopListChanges={configState.hasStopListChanges}
          handleAddCompany={configState.handleAddCompany}
          handleRemoveCompany={configState.handleRemoveCompany}
          handleAddKeyword={configState.handleAddKeyword}
          handleRemoveKeyword={configState.handleRemoveKeyword}
          handleAddDomain={configState.handleAddDomain}
          handleRemoveDomain={configState.handleRemoveDomain}
          handleSaveStopList={configState.handleSaveStopList}
          handleResetStopList={configState.handleResetStopList}
        />

        <QueueSettingsTab
          isSaving={configState.isSaving}
          queueSettings={configState.queueSettings}
          setQueueSettings={configState.setQueueSettings}
          hasQueueChanges={configState.hasQueueChanges}
          handleSaveQueueSettings={configState.handleSaveQueueSettings}
          handleResetQueueSettings={configState.handleResetQueueSettings}
        />

        <AISettingsTab
          isSaving={configState.isSaving}
          aiSettings={configState.aiSettings}
          setAISettings={configState.setAISettings}
          hasAIChanges={configState.hasAIChanges}
          handleSaveAISettings={configState.handleSaveAISettings}
          handleResetAISettings={configState.handleResetAISettings}
        />

        <JobMatchTab
          isSaving={configState.isSaving}
          jobMatch={configState.jobMatch}
          setJobMatch={configState.setJobMatch}
          hasJobMatchChanges={configState.hasJobMatchChanges}
          handleSaveJobMatch={configState.handleSaveJobMatch}
          handleResetJobMatch={configState.handleResetJobMatch}
        />

        <JobFiltersTab
          isSaving={configState.isSaving}
          currentJobFilters={configState.currentJobFilters}
          hasJobFilterChanges={configState.hasJobFilterChanges}
          updateJobFiltersState={configState.updateJobFiltersState}
          handleSaveJobFilters={configState.handleSaveJobFilters}
          handleResetJobFilters={configState.handleResetJobFilters}
        />

        <TechnologyRanksTab
          isSaving={configState.isSaving}
          currentTechRanks={configState.currentTechRanks}
          newTechName={configState.newTechName}
          setNewTechName={configState.setNewTechName}
          newTechRank={configState.newTechRank}
          setNewTechRank={configState.setNewTechRank}
          newTechPoints={configState.newTechPoints}
          setNewTechPoints={configState.setNewTechPoints}
          hasTechRankChanges={configState.hasTechRankChanges}
          updateTechRanksState={configState.updateTechRanksState}
          handleAddTechnology={configState.handleAddTechnology}
          handleSaveTechRanks={configState.handleSaveTechRanks}
          handleResetTechRanks={configState.handleResetTechRanks}
        />

        <SchedulerTab
          isSaving={configState.isSaving}
          currentScheduler={configState.currentScheduler}
          hasSchedulerChanges={configState.hasSchedulerChanges}
          updateSchedulerState={configState.updateSchedulerState}
          handleSaveScheduler={configState.handleSaveScheduler}
          handleResetSchedulerSettings={configState.handleResetSchedulerSettings}
        />

        <CompanyScoringTab
          isSaving={configState.isSaving}
          currentScoring={configState.currentScoring}
          hasCompanyScoringChanges={configState.hasCompanyScoringChanges}
          updateCompanyScoringState={configState.updateCompanyScoringState}
          handleSaveCompanyScoring={configState.handleSaveCompanyScoring}
          handleResetCompanyScoring={configState.handleResetCompanyScoring}
        />

        <WorkerSettingsTab
          isSaving={configState.isSaving}
          currentWorker={configState.currentWorker}
          hasWorkerSettingsChanges={configState.hasWorkerSettingsChanges}
          updateWorkerSettingsState={configState.updateWorkerSettingsState}
          handleSaveWorkerSettings={configState.handleSaveWorkerSettings}
          handleResetWorkerSettings={configState.handleResetWorkerSettings}
        />
      </Tabs>
    </div>
  )
}
