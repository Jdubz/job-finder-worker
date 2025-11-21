import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, RotateCcw, Plus, X } from "lucide-react"
import { configClient } from "@/api/config-client"
import type { StopList, QueueSettings, AISettings } from "@shared/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function JobFinderConfigPage() {
  const { isOwner } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"stop-list" | "queue" | "ai">("stop-list")

  // Stop List state
  const [stopList, setStopList] = useState<StopList | null>(null)
  const [originalStopList, setOriginalStopList] = useState<StopList | null>(null)
  const [newCompany, setNewCompany] = useState("")
  const [newKeyword, setNewKeyword] = useState("")
  const [newDomain, setNewDomain] = useState("")

  // Queue Settings state
  const [queueSettings, setQueueSettings] = useState<QueueSettings | null>(null)
  const [originalQueueSettings, setOriginalQueueSettings] = useState<QueueSettings | null>(null)

  // AI Settings state
  const [aiSettings, setAISettings] = useState<AISettings | null>(null)
  const [originalAISettings, setOriginalAISettings] = useState<AISettings | null>(null)

  useEffect(() => {
    loadAllSettings()
  }, [])

  const loadAllSettings = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [stopListData, queueData, aiData] = await Promise.all([
        configClient.getStopList(),
        configClient.getQueueSettings(),
        configClient.getAISettings(),
      ])

      setStopList(stopListData)
      setOriginalStopList(stopListData)
      setQueueSettings(queueData)
      setOriginalQueueSettings(queueData)
      setAISettings(aiData)
      setOriginalAISettings(aiData)
    } catch (err) {
      setError("Failed to load configuration settings")
      console.error("Error loading settings:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveStopList = async () => {
    if (!stopList) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await configClient.updateStopList(stopList)
      setOriginalStopList(stopList)
      setSuccess("Stop list saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save stop list")
      console.error("Error saving stop list:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveQueueSettings = async () => {
    if (!queueSettings) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await configClient.updateQueueSettings(queueSettings)
      setOriginalQueueSettings(queueSettings)
      setSuccess("Queue settings saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save queue settings")
      console.error("Error saving queue settings:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAISettings = async () => {
    if (!aiSettings) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await configClient.updateAISettings(aiSettings)
      setOriginalAISettings(aiSettings)
      setSuccess("AI settings saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save AI settings")
      console.error("Error saving AI settings:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCompany = () => {
    if (!newCompany.trim() || !stopList) return

    setStopList({
      ...stopList,
      excludedCompanies: [...(stopList.excludedCompanies || []), newCompany.trim()],
    })
    setNewCompany("")
  }

  const handleRemoveCompany = (company: string) => {
    if (!stopList) return

    setStopList({
      ...stopList,
      excludedCompanies: (stopList.excludedCompanies || []).filter((c) => c !== company),
    })
  }

  const handleAddKeyword = () => {
    if (!newKeyword.trim() || !stopList) return

    setStopList({
      ...stopList,
      excludedKeywords: [...(stopList.excludedKeywords || []), newKeyword.trim()],
    })
    setNewKeyword("")
  }

  const handleRemoveKeyword = (keyword: string) => {
    if (!stopList) return

    setStopList({
      ...stopList,
      excludedKeywords: (stopList.excludedKeywords || []).filter((k) => k !== keyword),
    })
  }

  const handleAddDomain = () => {
    if (!newDomain.trim() || !stopList) return

    setStopList({
      ...stopList,
      excludedDomains: [...(stopList.excludedDomains || []), newDomain.trim()],
    })
    setNewDomain("")
  }

  const handleRemoveDomain = (domain: string) => {
    if (!stopList) return

    setStopList({
      ...stopList,
      excludedDomains: (stopList.excludedDomains || []).filter((d) => d !== domain),
    })
  }

  const handleResetStopList = () => {
    setStopList(originalStopList)
    setError(null)
    setSuccess(null)
  }

  const handleResetQueueSettings = () => {
    setQueueSettings(originalQueueSettings)
    setError(null)
    setSuccess(null)
  }

  const handleResetAISettings = () => {
    setAISettings(originalAISettings)
    setError(null)
    setSuccess(null)
  }

  const hasStopListChanges = JSON.stringify(stopList) !== JSON.stringify(originalStopList)
  const hasQueueChanges = JSON.stringify(queueSettings) !== JSON.stringify(originalQueueSettings)
  const hasAIChanges = JSON.stringify(aiSettings) !== JSON.stringify(originalAISettings)

  if (!isOwner) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            You do not have permission to access job finder configuration. Editor role required.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Job Finder Configuration</h1>
        <p className="text-gray-600 mt-2">
          Configure queue settings, stop lists, and AI parameters for job matching and processing.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stop-list">Stop List</TabsTrigger>
          <TabsTrigger value="queue">Queue Settings</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
        </TabsList>

        {/* Stop List Tab */}
        <TabsContent value="stop-list" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Excluded Companies</CardTitle>
                  <CardDescription>
                    Companies to exclude from job matching and processing
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetStopList}
                    disabled={!hasStopListChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleSaveStopList} disabled={!hasStopListChanges || isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Companies */}
              <div className="space-y-3">
                <Label>Companies</Label>
                <div className="flex gap-2">
                  <Input
                    data-testid="stoplist-company-input"
                    placeholder="Enter company name..."
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAddCompany()}
                  />
                  <Button data-testid="stoplist-company-add" onClick={handleAddCompany} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(stopList?.excludedCompanies || []).map((company) => (
                    <Badge key={company} variant="secondary" className="pl-3 pr-1 py-1">
                      {company}
                      <button
                        onClick={() => handleRemoveCompany(company)}
                        className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(!stopList?.excludedCompanies || stopList.excludedCompanies.length === 0) && (
                    <p className="text-sm text-gray-500">No excluded companies</p>
                  )}
                </div>
              </div>

              {/* Keywords */}
              <div className="space-y-3">
                <Label>Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    data-testid="stoplist-keyword-input"
                    placeholder="Enter keyword..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAddKeyword()}
                  />
                  <Button data-testid="stoplist-keyword-add" onClick={handleAddKeyword} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(stopList?.excludedKeywords || []).map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="pl-3 pr-1 py-1">
                      {keyword}
                      <button
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(!stopList?.excludedKeywords || stopList.excludedKeywords.length === 0) && (
                    <p className="text-sm text-gray-500">No excluded keywords</p>
                  )}
                </div>
              </div>

              {/* Domains */}
              <div className="space-y-3">
                <Label>Domains</Label>
                <div className="flex gap-2">
                  <Input
                    data-testid="stoplist-domain-input"
                    placeholder="Enter domain (e.g., example.com)..."
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAddDomain()}
                  />
                  <Button data-testid="stoplist-domain-add" onClick={handleAddDomain} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(stopList?.excludedDomains || []).map((domain) => (
                    <Badge key={domain} variant="secondary" className="pl-3 pr-1 py-1">
                      {domain}
                      <button
                        onClick={() => handleRemoveDomain(domain)}
                        className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {(!stopList?.excludedDomains || stopList.excludedDomains.length === 0) && (
                    <p className="text-sm text-gray-500">No excluded domains</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Settings Tab */}
        <TabsContent value="queue" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Queue Processing Settings</CardTitle>
                  <CardDescription>
                    Configure job queue processing parameters and retry logic
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetQueueSettings}
                    disabled={!hasQueueChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleSaveQueueSettings} disabled={!hasQueueChanges || isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="maxRetries">Max Retries</Label>
                  <Input
                    id="maxRetries"
                    type="number"
                    min="0"
                    max="10"
                    value={queueSettings?.maxRetries || 3}
                    onChange={(e) =>
                      setQueueSettings((prev) =>
                        prev ? { ...prev, maxRetries: parseInt(e.target.value) || 3 } : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Maximum number of retry attempts for failed jobs
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retryDelay">Retry Delay (seconds)</Label>
                  <Input
                    id="retryDelay"
                    type="number"
                    min="0"
                    max="3600"
                    value={queueSettings?.retryDelaySeconds || 300}
                    onChange={(e) =>
                      setQueueSettings((prev) =>
                        prev
                          ? { ...prev, retryDelaySeconds: parseInt(e.target.value) || 300 }
                          : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">Delay before retrying a failed job</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="processingTimeout">Processing Timeout (seconds)</Label>
                  <Input
                    id="processingTimeout"
                    type="number"
                    min="0"
                    max="3600"
                    value={queueSettings?.processingTimeout || 600}
                    onChange={(e) =>
                      setQueueSettings((prev) =>
                        prev
                          ? { ...prev, processingTimeout: parseInt(e.target.value) || 600 }
                          : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">Maximum time allowed for job processing</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI Configuration</CardTitle>
                  <CardDescription>
                    Configure AI provider, model selection, and matching parameters
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetAISettings}
                    disabled={!hasAIChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleSaveAISettings} disabled={!hasAIChanges || isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="provider">AI Provider</Label>
                  <Select
                    value={aiSettings?.provider || "claude"}
                    onValueChange={(value) =>
                      setAISettings((prev: AISettings | null) =>
                        prev ? { ...prev, provider: value as "claude" | "openai" | "gemini" } : null
                      )
                    }
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                      <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    AI provider for job matching and document generation
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={aiSettings?.model || "claude-sonnet-4"}
                    onChange={(e) =>
                      setAISettings((prev: AISettings | null) =>
                        prev ? { ...prev, model: e.target.value } : null
                      )
                    }
                    placeholder="e.g., claude-sonnet-4, gpt-4, gemini-pro"
                  />
                  <p className="text-xs text-gray-500">Specific model version to use</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minMatchScore">Minimum Match Score</Label>
                  <Input
                    id="minMatchScore"
                    type="number"
                    min="0"
                    max="100"
                    value={aiSettings?.minMatchScore || 70}
                    onChange={(e) =>
                      setAISettings((prev: AISettings | null) =>
                        prev ? { ...prev, minMatchScore: parseInt(e.target.value) || 70 } : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Minimum score required to create a job match (0-100)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costBudget">Daily Cost Budget ($)</Label>
                  <Input
                    id="costBudget"
                    type="number"
                    min="0"
                    step="0.01"
                    value={aiSettings?.costBudgetDaily || 10.0}
                    onChange={(e) =>
                      setAISettings((prev: AISettings | null) =>
                        prev
                          ? { ...prev, costBudgetDaily: parseFloat(e.target.value) || 10.0 }
                          : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">Maximum daily AI API cost (USD)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
