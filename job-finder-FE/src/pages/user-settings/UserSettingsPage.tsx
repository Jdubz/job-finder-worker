import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { useUserConfigState } from "./useUserConfigState"
import {
  PrefilterPolicyTab,
  MatchPolicyTab,
  PersonalInfoTab,
} from "@/pages/job-finder-config/components/tabs"
import { useSearchParams } from "react-router-dom"

type TabType = "prefilter" | "scoring" | "personal"

export function UserSettingsPage() {
  const { user } = useAuth()
  const configState = useUserConfigState()
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
          <AlertDescription>Please sign in to manage your settings.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (configState.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading your settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6" id="user-settings-root">
      <div>
        <h1 className="text-2xl font-bold">My Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal filtering rules, scoring preferences, and profile information.
        </p>
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prefilter">Pre-Filter</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
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
          {activeTab === "prefilter" && !configState.prefilterPolicy && !configState.isLoading && (
            <div className="mt-4 p-6 border rounded-lg bg-muted/50">
              <h3 className="text-lg font-semibold mb-2">Pre-Filter Configuration</h3>
              <p className="text-muted-foreground">
                No pre-filter policy has been configured yet. This defines the hard gates applied
                before jobs enter your queue (title keywords, work arrangement, salary floors, etc.).
              </p>
            </div>
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
              <h3 className="text-lg font-semibold mb-2">Scoring Configuration</h3>
              <p className="text-muted-foreground">
                No scoring policy has been configured yet. This defines how jobs are scored based on
                your preferences for seniority, location, skill matching, salary, and other factors.
              </p>
            </div>
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
