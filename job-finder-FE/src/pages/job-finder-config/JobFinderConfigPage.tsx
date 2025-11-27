import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useConfigState } from "./hooks/useConfigState"
import {
  StopListTab,
  AISettingsTab,
  JobMatchTab,
  JobFiltersTab,
  TechnologyRanksTab,
  SchedulerTab,
  CompanyScoringTab,
  PersonalInfoTab,
} from "./components/tabs"
import { useSearchParams } from "react-router-dom"

type TabType =
  | "stop-list"
  | "ai"
  | "job-match"
  | "filters"
  | "tech"
  | "scheduler"
  | "scoring"
  | "personal"

export function JobFinderConfigPage() {
  const { user, isOwner } = useAuth()
  const configState = useConfigState()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get("tab") as TabType | null) ?? "stop-list"
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabType | null
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [searchParams, activeTab])

  const handleTabChange = (value: string) => {
    const tabValue = (value as TabType) ?? "stop-list"
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
          <p className="text-muted-foreground">Manage filtering rules, queues, scheduling, scoring, and profile defaults.</p>
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
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="stop-list">Stop List</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="job-match">Match</TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
          <TabsTrigger value="tech">Tech</TabsTrigger>
          <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
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

        <PersonalInfoTab
          isSaving={configState.isSaving}
          currentPersonalInfo={configState.currentPersonalInfo}
          hasPersonalInfoChanges={configState.hasPersonalInfoChanges}
          updatePersonalInfoState={configState.updatePersonalInfoState}
          handleSavePersonalInfo={configState.handleSavePersonalInfo}
          handleResetPersonalInfo={configState.handleResetPersonalInfo}
        />
      </Tabs>
    </div>
  )
}
