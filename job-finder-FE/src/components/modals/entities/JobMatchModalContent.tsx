import { useEffect, useState } from "react"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, FileText, Download, CheckCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { JobMatchWithListing } from "@shared/types"
import {
  generatorClient,
  type GeneratorRequestRecord,
  type GenerationStep,
  type GenerateDocumentRequest,
  type DraftContentResponse,
  type ResumeContent,
  type CoverLetterContent,
} from "@/api/generator-client"
import { jobMatchesClient } from "@/api"
import { GenerationProgress } from "@/components/GenerationProgress"
import { ResumeReviewForm } from "@/components/ResumeReviewForm"
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
  const generationLabels: Record<typeof generateType | "both", string> = {
    resume: "Resume",
    coverLetter: "Cover Letter",
    both: "Resume & Cover Letter",
  }
  const [steps, setSteps] = useState<GenerationStep[]>([])
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [draftContent, setDraftContent] = useState<DraftContentResponse | null>(null)
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null)
  const companyInfo = localMatch.company?.about || localMatch.company?.culture || localMatch.company?.mission

  const handleStatusChange = async (status: "active" | "ignored" | "applied") => {
    if (!localMatch.id) return
    try {
      const updated = await jobMatchesClient.updateStatus(localMatch.id, status)
      setLocalMatch(updated)
      handlers?.onStatusChange?.(updated)
      const messages: Record<typeof status, string> = {
        active: "Match marked active",
        applied: "Marked as applied",
        ignored: "Match ignored",
      }
      toast.success({ title: messages[status] })
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
    setDraftContent(null)

    try {
      const request: GenerateDocumentRequest = {
        generateType,
        job: {
          role: localMatch.listing.title,
          company: localMatch.listing.companyName,
          jobDescriptionText: localMatch.listing.description,
          location: localMatch.listing.location || undefined,
        },
        jobMatchId: localMatch.id,
        date: new Date().toLocaleDateString(),
      }

      const start = await generatorClient.startGeneration(request)
      if (!start.success) {
        toast.error({ title: "Could not start generation" })
        setGenerating(false)
        return
      }

      setCurrentRequestId(start.data.requestId)
      setSteps(start.data.steps || [])
      if (start.data.resumeUrl) setResumeUrl(start.data.resumeUrl)
      if (start.data.coverLetterUrl) setCoverLetterUrl(start.data.coverLetterUrl)

      let nextStep = start.data.nextStep
      let currentSteps = start.data.steps || []
      let currentStatus = start.data.status

      while (nextStep) {
        // Check if we need to pause for review
        if (currentStatus === "awaiting_review") {
          const draft = await generatorClient.getDraftContent(start.data.requestId)
          if (draft) {
            setDraftContent(draft)
            setGenerating(false)
            return // Pause here - user will call handleReviewSubmit to continue
          }
        }

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
        currentStatus = step.data.status
        nextStep = step.data.nextStep

        // Check if this step resulted in awaiting_review
        if (currentStatus === "awaiting_review") {
          const draft = await generatorClient.getDraftContent(start.data.requestId)
          if (draft) {
            setDraftContent(draft)
            setGenerating(false)
            return // Pause here - user will call handleReviewSubmit to continue
          }
        }
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

  const handleReviewSubmit = async (content: ResumeContent | CoverLetterContent) => {
    if (!currentRequestId || !draftContent) return

    setGenerating(true)
    setDraftContent(null)

    try {
      const result = await generatorClient.submitReview(currentRequestId, {
        documentType: draftContent.documentType,
        content,
      })

      if (!result.success || result.data.status === "failed") {
        toast.error({ title: "Review submission failed" })
        setGenerating(false)
        return
      }

      let currentSteps = result.data.steps || steps
      setSteps(currentSteps)
      if (result.data.resumeUrl) setResumeUrl(result.data.resumeUrl)
      if (result.data.coverLetterUrl) setCoverLetterUrl(result.data.coverLetterUrl)

      let nextStep = result.data.nextStep
      let currentStatus = result.data.status

      // Continue executing remaining steps
      while (nextStep) {
        if (currentStatus === "awaiting_review") {
          const draft = await generatorClient.getDraftContent(currentRequestId)
          if (draft) {
            setDraftContent(draft)
            setGenerating(false)
            return
          }
        }

        setSteps(
          currentSteps.map((s) => (s.id === nextStep ? { ...s, status: "in_progress" } : s))
        )

        const step = await generatorClient.executeStep(currentRequestId)
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
        currentStatus = step.data.status
        nextStep = step.data.nextStep

        if (currentStatus === "awaiting_review") {
          const draft = await generatorClient.getDraftContent(currentRequestId)
          if (draft) {
            setDraftContent(draft)
            setGenerating(false)
            return
          }
        }
      }

      toast.success({ title: "Documents ready" })
      refreshDocuments()
    } catch (err) {
      console.error("Review submission error", err)
      toast.error({ title: "Review submission failed" })
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
    <div className="flex flex-col gap-3 min-h-0 h-[85vh]">
      <div className="flex items-start justify-between gap-3 flex-shrink-0">
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
        <div className="flex gap-2 flex-wrap justify-end items-center">
          {typeof localMatch.matchScore === "number" && (
            <Badge variant="outline">Score: {localMatch.matchScore}%</Badge>
          )}
          {localMatch.status === "ignored" && <Badge variant="destructive">Ignored</Badge>}
          {localMatch.status === "applied" && <Badge variant="secondary">Applied</Badge>}
          <Select
            value={localMatch.status ?? "active"}
            onValueChange={(value) => handleStatusChange(value as "active" | "ignored" | "applied")}
          >
            <SelectTrigger className="w-[140px]" aria-label="Match status">
              <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-2 flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 flex-shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="customization">Customize</TabsTrigger>
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 min-h-0 mt-2 flex flex-col">
          <ScrollArea className="flex-1 pr-4">
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="text-center p-3 bg-secondary rounded-lg">
                <div className="text-2xl font-bold text-green-600">{localMatch.matchScore}%</div>
                <div className="text-xs text-muted-foreground">Overall Match</div>
              </div>
              {/* Experience match removed – match_score is the single quality metric */}
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

        <TabsContent value="skills" className="flex-1 min-h-0 mt-2 flex flex-col">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
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
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="customization" className="flex-1 min-h-0 mt-2 flex flex-col">
          <ScrollArea className="flex-1 pr-4">
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

        <TabsContent value="description" className="flex-1 min-h-0 mt-2 flex flex-col">
          <ScrollArea className="flex-1 pr-4">
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
        <TabsContent value="documents" className="flex-1 min-h-0 mt-2 flex flex-col">
          {draftContent ? (
            <ResumeReviewForm
              documentType={draftContent.documentType}
              content={draftContent.content}
              onSubmit={handleReviewSubmit}
              onCancel={() => setDraftContent(null)}
              isSubmitting={generating}
            />
          ) : (
          <div className="grid gap-4 md:grid-cols-2 h-full">
            <Card className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Generate documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col">
                <div className="flex gap-2">
                  {(["resume", "coverLetter", "both"] as const).map((type) => (
                    <Button
                      key={type}
                      variant={generateType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setGenerateType(type)}
                      disabled={generating}
                    >
                      {generationLabels[type]}
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

            <Card className="flex flex-col min-h-0">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> Documents for this match
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 overflow-auto">
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
                            {generationLabels[doc.generateType] || "Resume"}
                            {" • "}
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {doc.resumeUrl && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => window.open(getAbsoluteArtifactUrl(doc.resumeUrl) || "#", "_blank")}
                            >
                              Resume
                            </Button>
                          )}
                          {doc.coverLetterUrl && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => window.open(getAbsoluteArtifactUrl(doc.coverLetterUrl) || "#", "_blank")}
                            >
                              Cover Letter
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
          )}
        </TabsContent>
      </Tabs>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 mt-auto border-t flex-shrink-0">
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
