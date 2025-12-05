import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ExternalLink, FileText, Building2, Database, AlertCircle, Calculator } from "lucide-react"
import { useEntityModal } from "@/contexts/EntityModalContext"
import type { JobMatchWithListing } from "@shared/types"

interface JobDetailsDialogProps {
  match: JobMatchWithListing | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerateResume?: (match: JobMatchWithListing) => void
}

export function JobDetailsDialog({
  match,
  open,
  onOpenChange,
  onGenerateResume,
}: JobDetailsDialogProps) {
  const { openModal } = useEntityModal()

  if (!match) return null

  const companyInfo = match.company?.about || match.company?.culture || match.company?.mission

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">{match.listing.title}</DialogTitle>
          <DialogDescription className="text-lg">
            {match.listing.companyName}
            {match.listing.location && ` • ${match.listing.location}`}
            {match.listing.salaryRange && ` • ${match.listing.salaryRange}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4 flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 flex-shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="customization">Customize</TabsTrigger>
            <TabsTrigger value="description">Description</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[250px] sm:h-[350px] md:h-[400px] pr-4">
              {/* Match Score */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">Match Analysis</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="text-center p-3 bg-secondary rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{match.matchScore}%</div>
                    <div className="text-xs text-muted-foreground">Overall Match</div>
                  </div>
                  <div className="text-center p-3 bg-secondary rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{match.experienceMatch}%</div>
                    <div className="text-xs text-muted-foreground">Experience Match</div>
                  </div>
                </div>
              </div>

              {/* Scoring Breakdown */}
              {match.listing.scoringResult && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Calculator className="h-4 w-4" />
                      Score Breakdown
                    </h3>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="text-center p-2 bg-secondary/50 rounded">
                        <div className="text-lg font-medium">
                          {match.listing.scoringResult.baseScore}
                        </div>
                        <div className="text-xs text-muted-foreground">Base Score</div>
                      </div>
                      <div className="text-center p-2 bg-secondary/50 rounded">
                        <div className="text-lg font-medium">
                          {match.listing.scoringResult.finalScore}
                        </div>
                        <div className="text-xs text-muted-foreground">Final Score</div>
                      </div>
                    </div>
                    {match.listing.scoringResult.adjustments.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground mb-2">Adjustments Applied:</p>
                        {match.listing.scoringResult.adjustments.map((adj, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm bg-secondary/30 px-2 py-1.5 rounded"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs font-normal">
                                {adj.category}
                              </Badge>
                              <span className="text-muted-foreground">{adj.reason}</span>
                            </div>
                            <span
                              className={`font-mono font-medium ${
                                adj.points > 0
                                  ? "text-green-600"
                                  : adj.points < 0
                                    ? "text-red-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {adj.points > 0 ? "+" : ""}
                              {adj.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* Match Reasons */}
              {match.matchReasons && match.matchReasons.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Why This Is a Good Match</h3>
                  <ul className="space-y-2">
                    {match.matchReasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-500 mt-1">✓</span>
                        <span className="text-sm">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Separator className="my-4" />

              {/* Key Strengths */}
              {match.keyStrengths && match.keyStrengths.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Your Key Strengths</h3>
                  <div className="flex flex-wrap gap-2">
                    {match.keyStrengths.map((strength, idx) => (
                      <Badge key={idx} variant="secondary">
                        {strength}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Potential Concerns */}
              {match.potentialConcerns && match.potentialConcerns.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2 text-orange-600">Potential Concerns</h3>
                  <ul className="space-y-2">
                    {match.potentialConcerns.map((concern, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-orange-500 mt-1">⚠</span>
                        <span className="text-sm">{concern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Separator className="my-4" />

              {/* Linked Records */}
              <div>
                <h3 className="font-semibold mb-3">Linked Records</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Company */}
                  <div className="bg-secondary p-3 rounded-lg">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Company
                    </Label>
                    {match.listing.companyId ? (
                      <div className="mt-1">
                        <Button
                          variant="link"
                          className="h-auto p-0 text-blue-600 hover:underline text-sm"
                          onClick={() => openModal({ type: "company", companyId: match.listing.companyId })}
                        >
                          {match.listing.companyName}
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground flex items-center gap-1 text-sm">
                        <AlertCircle className="h-3 w-3" />
                        No company linked
                      </p>
                    )}
                  </div>

                  {/* Source */}
                  <div className="bg-secondary p-3 rounded-lg">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      Source
                    </Label>
                    {match.listing.sourceId ? (
                      <div className="mt-1">
                        <Button
                          variant="link"
                          className="h-auto p-0 text-blue-600 hover:underline text-sm"
                          onClick={() => openModal({ type: "jobSource", sourceId: match.listing.sourceId })}
                        >
                          View Source Details
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground flex items-center gap-1 text-sm">
                        <AlertCircle className="h-3 w-3" />
                        No source linked
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Skills Tab */}
          <TabsContent value="skills" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[250px] sm:h-[350px] md:h-[400px] pr-4">
              {/* Matched Skills */}
              <div>
                <h3 className="font-semibold mb-2 text-green-600">
                  Matched Skills ({match.matchedSkills?.length || 0})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {match.matchedSkills && match.matchedSkills.length > 0 ? (
                    match.matchedSkills.map((skill, idx) => (
                      <Badge key={idx} className="bg-green-500">
                        {skill}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No matched skills data available
                    </p>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              {/* Missing Skills */}
              <div>
                <h3 className="font-semibold mb-2 text-orange-600">
                  Skills to Highlight ({match.missingSkills?.length || 0})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {match.missingSkills && match.missingSkills.length > 0 ? (
                    match.missingSkills.map((skill, idx) => (
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

          {/* Customization Tab */}
          <TabsContent value="customization" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[250px] sm:h-[350px] md:h-[400px] pr-4">
              {match.customizationRecommendations &&
              match.customizationRecommendations.length > 0 ? (
                <div>
                  <h3 className="font-semibold mb-3">How to Customize Your Application</h3>
                  <ul className="space-y-3">
                    {match.customizationRecommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1 font-bold">{idx + 1}.</span>
                        <span className="text-sm">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No customization recommendations available
                </p>
              )}

              {/* Resume Intake Data Preview */}
              {match.resumeIntakeData && (
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
                        <br />✓ Skills prioritized (
                        {match.resumeIntakeData.skillsPriority?.length || 0})
                        <br />✓ ATS keywords identified (
                        {match.resumeIntakeData.atsKeywords?.length || 0})
                        <br />✓ Experience highlights prepared
                      </p>
                    </div>
                  </div>
                </>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Description Tab */}
          <TabsContent value="description" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[250px] sm:h-[350px] md:h-[400px] pr-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {companyInfo && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">About {match.listing.companyName}</h3>
                    <p className="text-sm whitespace-pre-wrap">{companyInfo}</p>
                  </div>
                )}

                <Separator className="my-4" />

                <div>
                  <h3 className="font-semibold mb-2">Job Description</h3>
                  <div className="text-sm whitespace-pre-wrap">{match.listing.description}</div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 mt-auto border-t flex-shrink-0">
          {onGenerateResume && (
            <Button onClick={() => onGenerateResume(match)} className="flex-1">
              <FileText className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Generate Custom Resume</span>
              <span className="sm:hidden">Generate Resume</span>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.open(match.listing.url, "_blank")}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">View Job Posting</span>
            <span className="sm:hidden">View Job</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
