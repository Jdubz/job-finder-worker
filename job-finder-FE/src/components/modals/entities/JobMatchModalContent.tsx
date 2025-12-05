import { useEffect, useState } from "react"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, FileText, Download, Eye, Ban, CheckCircle } from "lucide-react"
import type { JobMatchWithListing } from "@shared/types"
import {
  generatorClient,
  type GeneratorRequestRecord,
  type GenerationStep,
  type GenerateDocumentRequest,
} from "@/api/generator-client"
import { jobMatchesClient } from "@/api"
import { GenerationProgress } from "@/components/GenerationProgress"
import { getAbsoluteArtifactUrl } from "@/config/api"
import { toast } from "@/components/toast"

interface JobMatchModalContentProps {
  match: JobMatchWithListing
  handlers?: {
    onGenerateResume?: (match: JobMatchWithListing) => void
    onStatusChange?: (match: JobMatchWithListing) => void
  }
}

export function JobMatchModalContent({ match, handlers }: JobMatchModalContentProps) {
  const { openModal } = useEntityModal()
  const [localMatch, setLocalMatch] = useState<JobMatchWithListing>(match)
  const [documents, setDocuments] = useState<GeneratorRequestRecord[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [generateType, setGenerateType] = useState<"resume" | "coverLetter" | "both">("resume")
  const [steps, setSteps] = useState<GenerationStep[]>([])
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const companyInfo = localMatch.company?.about || localMatch.company?.culture || localMatch.company?.mission

  const handleToggleIgnore = async () => {
    if (!localMatch.id) return
    const nextStatus = localMatch.status === "ignored" ? "active" : "ignored"
    try {
      const updated = await jobMatchesClient.updateStatus(localMatch.id, nextStatus)
      setLocalMatch(updated)
      handlers?.onStatusChange?.(updated)
      toast.success({ title: nextStatus === "ignored" ? "Match ignored" : "Match restored" })
    } catch (err) {
      console.error("Failed to update match status", err)
      toast.error({ title: "Could not update match status" })
    }
  }

  const refreshDocuments = async () => {
    if (!localMatch.id) return
    try {
      const docs = await generatorClient.listDocumentsForMatch(localMatch.id)
      setDocuments(docs)
    } catch (err) {
      console.error("Failed to refresh documents", err)
    }
  }

  const handleGenerate = async () => {
    if (!localMatch) return
    setGenerating(true)
    setSteps([])
    setResumeUrl(null)
    setCoverLetterUrl(null)

    try {
      const request: GenerateDocumentRequest = {
        generateType,
        job: {
          role: localMatch.listing.title,
          company: localMatch.listing.companyName,
          jobDescriptionText: localMatch.listing.description,
          location: localMatch.listing.location,
        },
        jobMatchId: localMatch.id,
        date: new Date().toLocaleDateString(),
      }

      const start = await generatorClient.startGeneration(request as any)
      if (!start.success) {
        toast.error({ title: "Could not start generation" })
        setGenerating(false)
        return
      }

      setSteps(start.data.steps || [])
      if (start.data.resumeUrl) setResumeUrl(start.data.resumeUrl)
      if (start.data.coverLetterUrl) setCoverLetterUrl(start.data.coverLetterUrl)

      let nextStep = start.data.nextStep
      let currentSteps = start.data.steps || []

      while (nextStep) {
        setSteps(
          currentSteps.map((s) => (s.id === nextStep ? { ...s, status: "in_progress" } : s))
        )

        const step = await generatorClient.executeStep(start.data.requestId)
        if (!step.success || step.data.status === "failed") {
          setSteps(step.data.steps || currentSteps)
          toast.error({ title: "Generation failed" })
          setGenerating(false)
          return
        }

        if (step.data.steps) {
          currentSteps = step.data.steps
          setSteps(currentSteps)
        }
        if (step.data.resumeUrl) setResumeUrl(step.data.resumeUrl)
        if (step.data.coverLetterUrl) setCoverLetterUrl(step.data.coverLetterUrl)
        nextStep = step.data.nextStep
      }

      toast.success({ title: "Documents ready" })
      refreshDocuments()
    } catch (err) {
      console.error("Generation error", err)
      toast.error({ title: "Generation failed" })
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    setLocalMatch(match)
  }, [match])

  useEffect(() => {
    const loadDocs = async () => {
      try {
        setLoadingDocs(true)
        const docs = await generatorClient.listDocumentsForMatch(localMatch.id || "")
        setDocuments(docs)
      } catch (err) {
        console.error("Failed to load documents for match", err)
      } finally {
        setLoadingDocs(false)
      }
    }
    if (localMatch.id) loadDocs()
  }, [localMatch.id])

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-2xl font-semibold leading-tight">{localMatch.listing.title}</p>
          <p className="text-base text-muted-foreground flex flex-wrap gap-2">
            <button
              type="button"
              className="text-foreground hover:underline"
              onClick={() =>
                openModal({
                  type: "company",
                  companyId: localMatch.listing.companyId || undefined,
                  company: localMatch.company || undefined,
                })
              }
            >
              {localMatch.listing.companyName}
            </button>
            {localMatch.listing.location && <span>• {localMatch.listing.location}</span>}
            {localMatch.listing.salaryRange && <span>• {localMatch.listing.salaryRange}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {typeof localMatch.matchScore === "number" && (
            <Badge variant="outline">Score: {localMatch.matchScore}%</Badge>
          )}
          {localMatch.status === "ignored" && <Badge variant="destructive">Ignored</Badge>}
          <Button size="sm" variant={localMatch.status === "ignored" ? "secondary" : "outline"} onClick={handleToggleIgnore}>
            <Ban className="mr-2 h-4 w-4" />
            {localMatch.status === "ignored" ? "Unignore" : "Ignore"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-2 flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 flex-shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="customization">Customize</TabsTrigger>
          <TabsTrigger value="description">Description</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-[260px] sm:h-[360px] md:h-[420px] pr-4">
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="text-center p-3 bg-secondary rounded-lg">
                <div className="text-2xl font-bold text-green-600">{localMatch.matchScore}%</div>
                <div className="text-xs text-muted-foreground">Overall Match</div>
              </div>
              <div className="text-center p-3 bg-secondary rounded-lg">
                <div className="text-2xl font-bold text-primary">{localMatch.experienceMatch}%</div>
                <div className="text-xs text-muted-foreground">Experience Match</div>
              </div>
            </div>

            {localMatch.matchReasons && localMatch.matchReasons.length > 0 && (
              <>
                <h3 className="font-semibold mb-2">Why This Is a Good Match</h3>
                <ul className="space-y-2">
                  {localMatch.matchReasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span className="text-sm">{reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {localMatch.keyStrengths && localMatch.keyStrengths.length > 0 && (
              <>
                <Separator className="my-4" />
                <h3 className="font-semibold mb-2">Your Key Strengths</h3>
                <div className="flex flex-wrap gap-2">
                  {localMatch.keyStrengths.map((strength, idx) => (
                    <Badge key={idx} variant="secondary">
                      {strength}
                    </Badge>
                  ))}
                </div>
              </>
            )}

            {localMatch.potentialConcerns && localMatch.potentialConcerns.length > 0 && (
              <>
                <Separator className="my-4" />
                <h3 className="font-semibold mb-2 text-orange-600">Potential Concerns</h3>
                <ul className="space-y-2">
                  {localMatch.potentialConcerns.map((concern, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-orange-500 mt-1">⚠</span>
                      <span className="text-sm">{concern}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="skills" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-[260px] sm:h-[360px] md:h-[420px] pr-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2 text-green-600">
                Matched Skills ({localMatch.matchedSkills?.length || 0})
              </h3>
              <div className="flex flex-wrap gap-2">
                {localMatch.matchedSkills && localMatch.matchedSkills.length > 0 ? (
                  localMatch.matchedSkills.map((skill, idx) => (
                    <Badge key={idx} className="bg-green-500">
                      {skill}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No matched skills data available</p>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2 text-orange-600">
                Skills to Highlight ({localMatch.missingSkills?.length || 0})
              </h3>
              <div className="flex flex-wrap gap-2">
                {localMatch.missingSkills && localMatch.missingSkills.length > 0 ? (
                  localMatch.missingSkills.map((skill, idx) => (
                    <Badge key={idx} variant="outline" className="border-orange-500">
                      {skill}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">You have all required skills!</p>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="customization" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-[260px] sm:h-[360px] md:h-[420px] pr-4 space-y-4">
            {localMatch.customizationRecommendations && localMatch.customizationRecommendations.length > 0 ? (
              <div>
                <h3 className="font-semibold mb-3">How to Customize Your Application</h3>
                <ul className="space-y-3">
                  {localMatch.customizationRecommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-500 mt-1 font-bold">{idx + 1}.</span>
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No customization recommendations available</p>
            )}

            {localMatch.resumeIntakeData && (
              <>
                <Separator className="my-4" />
                <div>
                  <h3 className="font-semibold mb-2">Resume Customization Data</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    AI-generated guidance for tailoring your resume
                  </p>
                  <div className="bg-secondary p-3 rounded-md">
                    <p className="text-sm">
                      ✓ Target summary generated
                      <br />✓ Skills prioritized ({localMatch.resumeIntakeData.skillsPriority?.length || 0})
                      <br />✓ ATS keywords identified ({localMatch.resumeIntakeData.atsKeywords?.length || 0})
                      <br />✓ Experience highlights prepared
                    </p>
                  </div>
                </div>
              </>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="description" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-[260px] sm:h-[360px] md:h-[420px] pr-4">
            <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
              {companyInfo && (
                <div>
                  <h3 className="font-semibold mb-2">About {localMatch.listing.companyName}</h3>
                  <p className="text-sm whitespace-pre-wrap">{companyInfo}</p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Job Description</h3>
                <div className="text-sm whitespace-pre-wrap">{localMatch.listing.description}</div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Generate documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {(["resume", "coverLetter", "both"] as const).map((type) => (
                <Button
                  key={type}
                  variant={generateType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGenerateType(type)}
                  disabled={generating}
                >
                  {type === "resume" ? "Resume" : type === "coverLetter" ? "Cover Letter" : "Both"}
                </Button>
              ))}
            </div>
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? "Generating..." : "Generate now"}
            </Button>

            {steps.length > 0 && <GenerationProgress steps={steps} />}

            {(resumeUrl || coverLetterUrl) && (
              <div className="flex gap-2">
                {resumeUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={getAbsoluteArtifactUrl(resumeUrl) || "#"} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4 mr-2" /> Resume
                    </a>
                  </Button>
                )}
                {coverLetterUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={getAbsoluteArtifactUrl(coverLetterUrl) || "#"} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4 mr-2" /> Cover Letter
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" /> Documents for this match
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingDocs ? (
              <p className="text-sm text-muted-foreground">Loading documents...</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet for this match.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="border rounded-md p-2 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {doc.job.role} @ {doc.job.company}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {doc.generateType === "both"
                          ? "Resume & Cover Letter"
                          : doc.generateType === "resume"
                            ? "Resume"
                            : "Cover Letter"}
                        {" • "}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {doc.resumeUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getAbsoluteArtifactUrl(doc.resumeUrl) || "#", "_blank")}
                          title="View Resume"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {doc.coverLetterUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getAbsoluteArtifactUrl(doc.coverLetterUrl) || "#", "_blank")}
                          title="View Cover Letter"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 mt-auto border-t flex-shrink-0">
        {handlers?.onGenerateResume && (
          <Button onClick={() => handlers.onGenerateResume?.(localMatch)} className="flex-1">
            <FileText className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Generate Custom Resume</span>
            <span className="sm:hidden">Generate Resume</span>
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            openModal({
              type: "jobListing",
              listing: localMatch.listing,
            })
          }
        >
          View Listing
        </Button>
        <Button variant="outline" onClick={() => window.open(localMatch.listing.url, "_blank")}>
          <ExternalLink className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">View Job Posting</span>
          <span className="sm:hidden">View Job</span>
        </Button>
      </div>
    </div>
  )
}
