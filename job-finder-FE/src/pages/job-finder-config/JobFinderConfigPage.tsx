import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Save, RotateCcw, Plus, X } from "lucide-react"
import { configClient } from "@/api/config-client"
import {
  DEFAULT_JOB_FILTERS,
  DEFAULT_TECH_RANKS,
  DEFAULT_SCHEDULER_SETTINGS,
} from "@shared/types"
import type {
  StopList,
  QueueSettings,
  AISettings,
  JobFiltersConfig,
  TechnologyRanksConfig,
  SchedulerSettings,
  TechnologyRank,
} from "@shared/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const stableStringify = (value: unknown): string => JSON.stringify(sortObject(value))

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item))
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

const coerceTechnologyRanks = (
  raw: TechnologyRanksConfig | Record<string, unknown> | null
): TechnologyRanksConfig => {
  const technologies: TechnologyRanksConfig["technologies"] = {}
  const sourceTechs = (raw as Record<string, unknown>)?.technologies ?? {}
  Object.entries(sourceTechs as Record<string, unknown>).forEach(([name, value]) => {
    if (typeof value === "number") {
      technologies[name] = { rank: "ok", points: value }
    } else if (value && typeof value === "object") {
      const rank =
        typeof (value as Record<string, unknown>).rank === "string" &&
        ["required", "ok", "strike", "fail"].includes(
          (value as Record<string, unknown>).rank as string
        )
          ? ((value as Record<string, unknown>).rank as TechnologyRank["rank"])
          : "ok"
      technologies[name] = {
        rank,
        ...(typeof (value as Record<string, unknown>).points === "number"
          ? { points: (value as Record<string, unknown>).points as number }
          : {}),
        ...(typeof (value as Record<string, unknown>).mentions === "number"
          ? { mentions: (value as Record<string, unknown>).mentions as number }
          : {}),
      }
    }
  })

  const strikes = (raw as Record<string, unknown>)?.strikes ?? {}
  return {
    technologies,
    strikes: {
      ...DEFAULT_TECH_RANKS.strikes,
      ...(typeof strikes === "object" && strikes !== null ? strikes : {}),
    },
    extractedFromJobs:
      typeof (raw as Record<string, unknown>)?.extractedFromJobs === "number"
        ? ((raw as Record<string, unknown>).extractedFromJobs as number)
        : undefined,
    version:
      typeof (raw as Record<string, unknown>)?.version === "string"
        ? ((raw as Record<string, unknown>).version as string)
        : undefined,
  }
}

type StringListEditorProps = {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  description?: string
  addTestId?: string
}

function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  description,
  addTestId,
}: StringListEditorProps) {
  const [inputValue, setInputValue] = useState("")

  const handleAdd = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onChange([...values.filter((v) => v !== trimmed), trimmed])
    setInputValue("")
  }

  const handleRemove = (value: string) => {
    onChange(values.filter((v) => v !== value))
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Button size="sm" onClick={handleAdd} data-testid={addTestId}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {values.length > 0 ? (
          values.map((value) => (
            <Badge key={value} variant="secondary" className="pl-3 pr-1 py-1">
              {value}
              <button
                onClick={() => handleRemove(value)}
                className="ml-2 hover:bg-gray-300 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>
    </div>
  )
}

type SeniorityStrikesEditorProps = {
  strikes: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

function SeniorityStrikesEditor({ strikes, onChange }: SeniorityStrikesEditorProps) {
  const [newPattern, setNewPattern] = useState("")
  const [newPoints, setNewPoints] = useState(1)
  const entries = Object.entries(strikes)

  const handleAdd = () => {
    if (!newPattern.trim()) return
    onChange({ ...strikes, [newPattern.trim()]: newPoints })
    setNewPattern("")
    setNewPoints(1)
  }

  const handleRemove = (pattern: string) => {
    const { [pattern]: _removed, ...rest } = strikes
    onChange(rest)
  }

  return (
    <div className="space-y-3">
      <Label>Seniority Strikes</Label>
      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-sm text-gray-500">No seniority strike patterns configured.</p>
        )}
        {entries.map(([pattern, points]) => (
          <div key={pattern} className="grid grid-cols-6 gap-2 items-center">
            <div className="col-span-3">
              <Input value={pattern} readOnly />
            </div>
            <Input
              type="number"
              min="0"
              value={points}
              onChange={(e) =>
                onChange({ ...strikes, [pattern]: parseInt(e.target.value) || 0 })
              }
            />
            <Button variant="ghost" size="icon" onClick={() => handleRemove(pattern)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-2 items-center">
        <Input
          className="col-span-3"
          placeholder="e.g., principal engineer"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Input
          type="number"
          min="0"
          value={newPoints}
          onChange={(e) => setNewPoints(parseInt(e.target.value) || 0)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        />
        <Button size="sm" onClick={handleAdd} className="col-span-2">
          <Plus className="h-4 w-4 mr-1" />
          Add Pattern
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Adds strike points when the title contains the pattern (case-insensitive).
      </p>
    </div>
  )
}

export function JobFinderConfigPage() {
  const { isOwner } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"stop-list" | "queue" | "ai" | "filters" | "tech" | "scheduler">("stop-list")

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

  // Job Filters
  const [jobFilters, setJobFilters] = useState<JobFiltersConfig | null>(null)
  const [originalJobFilters, setOriginalJobFilters] = useState<JobFiltersConfig | null>(null)

  // Technology Ranks
  const [techRanks, setTechRanks] = useState<TechnologyRanksConfig | null>(null)
  const [originalTechRanks, setOriginalTechRanks] = useState<TechnologyRanksConfig | null>(null)
  const [newTechName, setNewTechName] = useState("")
  const [newTechRank, setNewTechRank] = useState<TechnologyRank["rank"]>("required")
  const [newTechPoints, setNewTechPoints] = useState(0)

  // Scheduler Settings
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings | null>(null)
  const [originalSchedulerSettings, setOriginalSchedulerSettings] = useState<SchedulerSettings | null>(null)

  useEffect(() => {
    loadAllSettings()
  }, [])

  const loadAllSettings = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [stopListData, queueData, aiData, filtersData, techData, schedulerData] = await Promise.all([
        configClient.getStopList(),
        configClient.getQueueSettings(),
        configClient.getAISettings(),
        configClient.getJobFilters(),
        configClient.getTechnologyRanks(),
        configClient.getSchedulerSettings(),
      ])

      setStopList(stopListData)
      setOriginalStopList(stopListData)
      setQueueSettings(queueData)
      setOriginalQueueSettings(queueData)
      setAISettings(aiData)
      setOriginalAISettings(aiData)

      const filtersPayload = deepClone(filtersData ?? DEFAULT_JOB_FILTERS)
      setJobFilters(filtersPayload)
      setOriginalJobFilters(deepClone(filtersPayload))

      const techPayload = coerceTechnologyRanks(techData ?? DEFAULT_TECH_RANKS)
      setTechRanks(techPayload)
      setOriginalTechRanks(deepClone(techPayload))

      const schedulerPayload = deepClone(schedulerData ?? DEFAULT_SCHEDULER_SETTINGS)
      setSchedulerSettings(schedulerPayload)
      setOriginalSchedulerSettings(deepClone(schedulerPayload))
    } catch (err) {
      setError("Failed to load configuration settings")
      console.error("Error loading settings:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const updateJobFiltersState = (updater: (current: JobFiltersConfig) => JobFiltersConfig) => {
    setJobFilters((prev) => updater(prev ?? deepClone(DEFAULT_JOB_FILTERS)))
  }

  const updateTechRanksState = (
    updater: (current: TechnologyRanksConfig) => TechnologyRanksConfig
  ) => {
    setTechRanks((prev) =>
      updater(
        prev ?? {
          technologies: {},
          strikes: { ...DEFAULT_TECH_RANKS.strikes },
        }
      )
    )
  }

  const updateSchedulerState = (updates: Partial<SchedulerSettings>) => {
    setSchedulerSettings((prev) => ({
      ...(prev ?? DEFAULT_SCHEDULER_SETTINGS),
      ...updates,
    }))
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

  const handleSaveJobFilters = async () => {
    if (!jobFilters) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await configClient.updateJobFilters(jobFilters)
      setOriginalJobFilters(deepClone(jobFilters))
      setSuccess("Job filters saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save job filters")
      console.error("Error saving job filters:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveTechRanks = async () => {
    if (!techRanks) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await configClient.updateTechnologyRanks(techRanks)
      setOriginalTechRanks(deepClone(techRanks))
      setSuccess("Technology ranks saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save technology ranks")
      console.error("Error saving technology ranks:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveScheduler = async () => {
    if (!schedulerSettings) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await configClient.updateSchedulerSettings(schedulerSettings)
      setOriginalSchedulerSettings(deepClone(schedulerSettings))
      setSuccess("Scheduler settings saved successfully!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError("Failed to save scheduler settings")
      console.error("Error saving scheduler settings:", err)
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

  const handleResetJobFilters = () => {
    setJobFilters(deepClone(originalJobFilters ?? DEFAULT_JOB_FILTERS))
    setError(null)
    setSuccess(null)
  }

  const handleResetTechRanks = () => {
    setTechRanks(
      deepClone(
        originalTechRanks ?? { technologies: {}, strikes: { ...DEFAULT_TECH_RANKS.strikes } }
      )
    )
    setError(null)
    setSuccess(null)
  }

  const handleResetSchedulerSettings = () => {
    setSchedulerSettings(deepClone(originalSchedulerSettings ?? DEFAULT_SCHEDULER_SETTINGS))
    setError(null)
    setSuccess(null)
  }

  const handleAddTechnology = () => {
    const name = newTechName.trim()
    if (!name) return

    updateTechRanksState((current) => ({
      ...current,
      technologies: {
        ...current.technologies,
        [name]: {
          ...(current.technologies[name] ?? {}),
          rank: newTechRank,
          points: newTechPoints,
        },
      },
    }))

    setNewTechName("")
    setNewTechPoints(newTechRank === "strike" ? 2 : 0)
  }

  const hasStopListChanges = stableStringify(stopList) !== stableStringify(originalStopList)
  const hasQueueChanges =
    stableStringify(queueSettings) !== stableStringify(originalQueueSettings)
  const hasAIChanges = stableStringify(aiSettings) !== stableStringify(originalAISettings)
  const hasJobFilterChanges =
    stableStringify(jobFilters) !== stableStringify(originalJobFilters)
  const hasTechRankChanges = stableStringify(techRanks) !== stableStringify(originalTechRanks)
  const hasSchedulerChanges =
    stableStringify(schedulerSettings) !== stableStringify(originalSchedulerSettings)

  const currentJobFilters = jobFilters ?? DEFAULT_JOB_FILTERS
  const currentTechRanks = techRanks ?? {
    technologies: {},
    strikes: { ...DEFAULT_TECH_RANKS.strikes },
  }
  const currentScheduler = schedulerSettings ?? DEFAULT_SCHEDULER_SETTINGS
  const hardRejections = currentJobFilters.hardRejections ?? DEFAULT_JOB_FILTERS.hardRejections
  const remotePolicy = currentJobFilters.remotePolicy ?? DEFAULT_JOB_FILTERS.remotePolicy
  const salaryStrike = currentJobFilters.salaryStrike ?? DEFAULT_JOB_FILTERS.salaryStrike
  const experienceStrike =
    currentJobFilters.experienceStrike ?? DEFAULT_JOB_FILTERS.experienceStrike
  const qualityStrikes =
    currentJobFilters.qualityStrikes ?? DEFAULT_JOB_FILTERS.qualityStrikes
  const ageStrike = currentJobFilters.ageStrike ?? DEFAULT_JOB_FILTERS.ageStrike

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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="stop-list">Stop List</TabsTrigger>
          <TabsTrigger value="queue">Queue Settings</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
          <TabsTrigger value="filters">Job Filters</TabsTrigger>
          <TabsTrigger value="tech">Tech Ranks</TabsTrigger>
          <TabsTrigger value="scheduler">Scheduler</TabsTrigger>
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

                <div className="space-y-2">
                  <Label htmlFor="generateIntake">Generate Intake Data</Label>
                  <Select
                    value={aiSettings?.generateIntakeData ? "yes" : "no"}
                    onValueChange={(value) =>
                      setAISettings((prev: AISettings | null) =>
                        prev ? { ...prev, generateIntakeData: value === "yes" } : null
                      )
                    }
                  >
                    <SelectTrigger id="generateIntake">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Toggle AI resume intake generation</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="portlandBonus">Portland Office Bonus</Label>
                  <Input
                    id="portlandBonus"
                    type="number"
                    value={aiSettings?.portlandOfficeBonus ?? 15}
                    onChange={(e) =>
                      setAISettings((prev: AISettings | null) =>
                        prev
                          ? { ...prev, portlandOfficeBonus: parseInt(e.target.value) || 0 }
                          : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">Bonus points for Portland offices</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="userTimezone">User Timezone Offset</Label>
                  <Input
                    id="userTimezone"
                    type="number"
                    step="0.5"
                    value={aiSettings?.userTimezone ?? -8}
                    onChange={(e) =>
                      setAISettings((prev: AISettings | null) =>
                        prev
                          ? { ...prev, userTimezone: parseFloat(e.target.value) }
                          : null
                      )
                    }
                  />
                  <p className="text-xs text-gray-500">Offset from UTC (e.g., -8 for PT)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Job Filters Tab */}
        <TabsContent value="filters" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Job Filters</CardTitle>
                  <CardDescription>Strike rules and hard rejections used by the worker</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetJobFilters}
                    disabled={!hasJobFilterChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleSaveJobFilters} disabled={!hasJobFilterChanges || isSaving}>
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
            <CardContent className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="filters-enabled"
                    checked={currentJobFilters.enabled}
                    onCheckedChange={(checked) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        enabled: checked === true,
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="filters-enabled">Filtering Enabled</Label>
                    <p className="text-xs text-gray-500">
                      Toggle strike-based filtering for incoming jobs.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="strike-threshold">Strike Threshold</Label>
                  <Input
                    id="strike-threshold"
                    type="number"
                    min="1"
                    value={currentJobFilters.strikeThreshold}
                    onChange={(e) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        strikeThreshold: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Total strikes allowed before a job is rejected.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <StringListEditor
                  label="Excluded Job Types"
                  values={hardRejections.excludedJobTypes ?? []}
                  placeholder="sales, hr, recruiter..."
                  description="Hard reject if the title matches any of these types."
                  onChange={(values) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      hardRejections: { ...current.hardRejections, excludedJobTypes: values },
                    }))
                  }
                />
                <StringListEditor
                  label="Excluded Seniority"
                  values={hardRejections.excludedSeniority ?? []}
                  placeholder="junior, entry-level..."
                  description="Hard reject titles that include these seniority levels."
                  onChange={(values) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      hardRejections: { ...current.hardRejections, excludedSeniority: values },
                    }))
                  }
                />
                <StringListEditor
                  label="Excluded Companies"
                  values={hardRejections.excludedCompanies ?? []}
                  placeholder="Companies to avoid..."
                  onChange={(values) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      hardRejections: { ...current.hardRejections, excludedCompanies: values },
                    }))
                  }
                />
                <StringListEditor
                  label="Excluded Keywords"
                  values={hardRejections.excludedKeywords ?? []}
                  placeholder="clearance required, relocation..."
                  onChange={(values) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      hardRejections: { ...current.hardRejections, excludedKeywords: values },
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="min-salary-floor">Minimum Salary Floor</Label>
                  <Input
                    id="min-salary-floor"
                    type="number"
                    min="0"
                    value={hardRejections.minSalaryFloor ?? 0}
                    onChange={(e) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        hardRejections: {
                          ...current.hardRejections,
                          minSalaryFloor: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Hard reject roles with salary below this floor (if parsed).
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="reject-commission"
                    checked={hardRejections.rejectCommissionOnly ?? true}
                    onCheckedChange={(checked) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        hardRejections: {
                          ...current.hardRejections,
                          rejectCommissionOnly: checked === true,
                        },
                      }))
                    }
                  />
                  <div>
                    <Label htmlFor="reject-commission">Reject commission-only roles</Label>
                    <p className="text-xs text-gray-500">
                      Hard reject when the description mentions commission-only compensation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="allow-remote"
                    checked={remotePolicy.allowRemote ?? true}
                    onCheckedChange={(checked) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        remotePolicy: {
                          ...current.remotePolicy,
                          allowRemote: checked === true,
                        },
                      }))
                    }
                  />
                  <Label htmlFor="allow-remote" className="cursor-pointer">
                    Allow Remote
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="allow-hybrid"
                    checked={remotePolicy.allowHybridPortland ?? true}
                    onCheckedChange={(checked) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        remotePolicy: {
                          ...current.remotePolicy,
                          allowHybridPortland: checked === true,
                        },
                      }))
                    }
                  />
                  <Label htmlFor="allow-hybrid" className="cursor-pointer">
                    Allow Hybrid (Portland)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="allow-onsite"
                    checked={remotePolicy.allowOnsite ?? false}
                    onCheckedChange={(checked) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        remotePolicy: {
                          ...current.remotePolicy,
                          allowOnsite: checked === true,
                        },
                      }))
                    }
                  />
                  <Label htmlFor="allow-onsite" className="cursor-pointer">
                    Allow Onsite
                  </Label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="salary-strike-enabled"
                      checked={salaryStrike.enabled ?? true}
                      onCheckedChange={(checked) =>
                        updateJobFiltersState((current) => ({
                          ...current,
                          salaryStrike: {
                            ...current.salaryStrike,
                            enabled: checked === true,
                          },
                        }))
                      }
                    />
                    <Label htmlFor="salary-strike-enabled" className="cursor-pointer">
                      Salary Strike
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="salary-threshold">Threshold ($)</Label>
                      <Input
                        id="salary-threshold"
                        type="number"
                        min="0"
                        value={salaryStrike.threshold ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            salaryStrike: {
                              ...current.salaryStrike,
                              threshold: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="salary-points">Points</Label>
                      <Input
                        id="salary-points"
                        type="number"
                        min="0"
                        value={salaryStrike.points ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            salaryStrike: {
                              ...current.salaryStrike,
                              points: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="experience-strike-enabled"
                      checked={experienceStrike.enabled ?? true}
                      onCheckedChange={(checked) =>
                        updateJobFiltersState((current) => ({
                          ...current,
                          experienceStrike: {
                            ...current.experienceStrike,
                            enabled: checked === true,
                          },
                        }))
                      }
                    />
                    <Label htmlFor="experience-strike-enabled" className="cursor-pointer">
                      Experience Strike
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="min-preferred">Min Preferred Years</Label>
                      <Input
                        id="min-preferred"
                        type="number"
                        min="0"
                        value={experienceStrike.minPreferred ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            experienceStrike: {
                              ...current.experienceStrike,
                              minPreferred: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="experience-points">Points</Label>
                      <Input
                        id="experience-points"
                        type="number"
                        min="0"
                        value={experienceStrike.points ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            experienceStrike: {
                              ...current.experienceStrike,
                              points: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <SeniorityStrikesEditor
                strikes={currentJobFilters.seniorityStrikes ?? {}}
                onChange={(next) =>
                  updateJobFiltersState((current) => ({
                    ...current,
                    seniorityStrikes: next,
                  }))
                }
              />

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Quality Strikes</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="min-desc-length">Min Description Length</Label>
                      <Input
                        id="min-desc-length"
                        type="number"
                        min="0"
                        value={qualityStrikes.minDescriptionLength ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            qualityStrikes: {
                              ...current.qualityStrikes,
                              minDescriptionLength: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="short-desc-points">Short Description Points</Label>
                      <Input
                        id="short-desc-points"
                        type="number"
                        min="0"
                        value={qualityStrikes.shortDescriptionPoints ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            qualityStrikes: {
                              ...current.qualityStrikes,
                              shortDescriptionPoints: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="buzzword-points">Buzzword Points</Label>
                      <Input
                        id="buzzword-points"
                        type="number"
                        min="0"
                        value={qualityStrikes.buzzwordPoints ?? 0}
                        onChange={(e) =>
                          updateJobFiltersState((current) => ({
                            ...current,
                            qualityStrikes: {
                              ...current.qualityStrikes,
                              buzzwordPoints: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <StringListEditor
                  label="Buzzwords"
                  values={qualityStrikes.buzzwords ?? []}
                  placeholder="rockstar, ninja, 10x..."
                  onChange={(values) =>
                    updateJobFiltersState((current) => ({
                      ...current,
                      qualityStrikes: { ...current.qualityStrikes, buzzwords: values },
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="age-strike-enabled"
                    checked={ageStrike.enabled ?? true}
                    onCheckedChange={(checked) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        ageStrike: { ...current.ageStrike, enabled: checked === true },
                      }))
                    }
                  />
                  <Label htmlFor="age-strike-enabled" className="cursor-pointer">
                    Age Strike
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="age-strike-days">Strike After (days)</Label>
                  <Input
                    id="age-strike-days"
                    type="number"
                    min="0"
                    value={ageStrike.strikeDays ?? 0}
                    onChange={(e) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        ageStrike: {
                          ...current.ageStrike,
                          strikeDays: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="age-reject-days">Hard Reject After (days)</Label>
                  <Input
                    id="age-reject-days"
                    type="number"
                    min="0"
                    value={ageStrike.rejectDays ?? 0}
                    onChange={(e) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        ageStrike: {
                          ...current.ageStrike,
                          rejectDays: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="age-strike-points">Points</Label>
                  <Input
                    id="age-strike-points"
                    type="number"
                    min="0"
                    value={ageStrike.points ?? 0}
                    onChange={(e) =>
                      updateJobFiltersState((current) => ({
                        ...current,
                        ageStrike: {
                          ...current.ageStrike,
                          points: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technology Ranks Tab */}
        <TabsContent value="tech" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Technology Ranks</CardTitle>
                  <CardDescription>Weighting for technology importance in filtering</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetTechRanks}
                    disabled={!hasTechRankChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleSaveTechRanks} disabled={!hasTechRankChanges || isSaving}>
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
                  <Label htmlFor="missing-required">Missing Required Strike Points</Label>
                  <Input
                    id="missing-required"
                    type="number"
                    min="0"
                    value={currentTechRanks.strikes?.missingAllRequired ?? 0}
                    onChange={(e) =>
                      updateTechRanksState((current) => ({
                        ...current,
                        strikes: {
                          ...current.strikes,
                          missingAllRequired: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Points added when no required technologies are present in the job description.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="per-bad-tech">Per Strike Technology Points</Label>
                  <Input
                    id="per-bad-tech"
                    type="number"
                    min="0"
                    value={currentTechRanks.strikes?.perBadTech ?? 0}
                    onChange={(e) =>
                      updateTechRanksState((current) => ({
                        ...current,
                        strikes: {
                          ...current.strikes,
                          perBadTech: parseInt(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500">
                    Points added for each technology marked as &ldquo;strike&rdquo; that appears in
                    the job post.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Technologies</Label>
                  <p className="text-xs text-muted-foreground">
                    Rank each technology and assign strike points.
                  </p>
                </div>

                <div className="space-y-2">
                  {Object.entries(currentTechRanks.technologies).sort(([a], [b]) =>
                    a.localeCompare(b)
                  ).map(([name, data]) => (
                    <div key={name} className="grid grid-cols-8 gap-2 items-center">
                      <div className="col-span-3 font-medium truncate" title={name}>
                        {name}
                      </div>
                      <div className="col-span-2">
                        <Select
                          value={data.rank}
                          onValueChange={(value) =>
                            updateTechRanksState((current) => ({
                              ...current,
                              technologies: {
                                ...current.technologies,
                                [name]: {
                                  ...current.technologies[name],
                                  rank: value as TechnologyRank["rank"],
                                },
                              },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="required">Required</SelectItem>
                            <SelectItem value="ok">OK</SelectItem>
                            <SelectItem value="strike">Strike</SelectItem>
                            <SelectItem value="fail">Fail</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={data.points ?? 0}
                        onChange={(e) =>
                          updateTechRanksState((current) => ({
                            ...current,
                            technologies: {
                              ...current.technologies,
                              [name]: {
                                ...current.technologies[name],
                                points: parseInt(e.target.value) || 0,
                              },
                            },
                          }))
                        }
                      />
                      <Input
                        type="number"
                        min="0"
                        value={data.mentions ?? 0}
                        onChange={(e) =>
                          updateTechRanksState((current) => ({
                            ...current,
                            technologies: {
                              ...current.technologies,
                              [name]: {
                                ...current.technologies[name],
                                mentions: parseInt(e.target.value) || 0,
                              },
                            },
                          }))
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          updateTechRanksState((current) => {
                            const { [name]: _removed, ...rest } = current.technologies
                            return { ...current, technologies: rest }
                          })
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {Object.keys(currentTechRanks.technologies).length === 0 && (
                    <p className="text-sm text-gray-500">No technologies configured yet.</p>
                  )}
                </div>

                <div className="grid grid-cols-8 gap-2 items-center">
                  <Input
                    className="col-span-3"
                    placeholder="Add technology..."
                    value={newTechName}
                    onChange={(e) => setNewTechName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTechnology())}
                  />
                  <div className="col-span-2">
                    <Select
                      value={newTechRank}
                      onValueChange={(value) => {
                        const rank = value as TechnologyRank["rank"]
                        setNewTechRank(rank)
                        if ((rank === "required" || rank === "ok") && newTechPoints !== 0) {
                          setNewTechPoints(0)
                        }
                        if (rank === "strike" && newTechPoints === 0) {
                          setNewTechPoints(2)
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="required">Required</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="strike">Strike</SelectItem>
                        <SelectItem value="fail">Fail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={newTechPoints}
                    onChange={(e) => setNewTechPoints(parseInt(e.target.value) || 0)}
                  />
                  <div className="col-span-2 flex justify-end">
                    <Button size="sm" onClick={handleAddTechnology}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Technology
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scheduler Settings Tab */}
        <TabsContent value="scheduler" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Scheduler Settings</CardTitle>
                  <CardDescription>Worker poll interval and scheduling knobs</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetSchedulerSettings}
                    disabled={!hasSchedulerChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button onClick={handleSaveScheduler} disabled={!hasSchedulerChanges || isSaving}>
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
            <CardContent className="space-y-3">
              <Label htmlFor="poll-interval">Poll Interval (seconds)</Label>
              <Input
                id="poll-interval"
                type="number"
                min="5"
                value={currentScheduler.pollIntervalSeconds}
                onChange={(e) =>
                  updateSchedulerState({
                    pollIntervalSeconds: Math.max(5, parseInt(e.target.value) || 0),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                How often the worker polls for new queue items. Minimum 5 seconds to avoid churn.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
