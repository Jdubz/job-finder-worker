import { useEntityModal } from "@/contexts/EntityModalContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExternalLink, FileText } from "lucide-react"
import type { JobMatchWithListing } from "@shared/types"

interface JobMatchModalContentProps {
  match: JobMatchWithListing
  handlers?: {
    onGenerateResume?: (match: JobMatchWithListing) => void
  }
}

export function JobMatchModalContent({ match, handlers }: JobMatchModalContentProps) {
  const { openModal } = useEntityModal()
  const companyInfo = match.company?.about || match.company?.culture || match.company?.mission

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-2xl font-semibold leading-tight">{match.listing.title}</p>
          <p className="text-base text-muted-foreground flex flex-wrap gap-2">
            <button
              type="button"
              className="text-foreground hover:underline"
              onClick={() =>
                openModal({
                  type: "company",
                  companyId: match.listing.companyId || undefined,
                  company: match.company || undefined,
                })
              }
            >
              {match.listing.companyName}
            </button>
            {match.listing.location && <span>• {match.listing.location}</span>}
            {match.listing.salaryRange && <span>• {match.listing.salaryRange}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Badge className="text-base">{match.applicationPriority}</Badge>
          {typeof match.matchScore === "number" && (
            <Badge variant="outline">Overall {match.matchScore}%</Badge>
          )}
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
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="text-center p-3 bg-secondary rounded-lg">
                <div className="text-2xl font-bold text-green-600">{match.matchScore}%</div>
                <div className="text-xs text-muted-foreground">Overall Match</div>
              </div>
              <div className="text-center p-3 bg-secondary rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{match.experienceMatch}%</div>
                <div className="text-xs text-muted-foreground">Experience Match</div>
              </div>
              <div className="text-center p-3 bg-secondary rounded-lg">
                <Badge className="text-base">{match.applicationPriority}</Badge>
                <div className="text-xs text-muted-foreground mt-1">Priority</div>
              </div>
            </div>

            {match.matchReasons && match.matchReasons.length > 0 && (
              <>
                <h3 className="font-semibold mb-2">Why This Is a Good Match</h3>
                <ul className="space-y-2">
                  {match.matchReasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span className="text-sm">{reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {match.keyStrengths && match.keyStrengths.length > 0 && (
              <>
                <Separator className="my-4" />
                <h3 className="font-semibold mb-2">Your Key Strengths</h3>
                <div className="flex flex-wrap gap-2">
                  {match.keyStrengths.map((strength, idx) => (
                    <Badge key={idx} variant="secondary">
                      {strength}
                    </Badge>
                  ))}
                </div>
              </>
            )}

            {match.potentialConcerns && match.potentialConcerns.length > 0 && (
              <>
                <Separator className="my-4" />
                <h3 className="font-semibold mb-2 text-orange-600">Potential Concerns</h3>
                <ul className="space-y-2">
                  {match.potentialConcerns.map((concern, idx) => (
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
                  <p className="text-sm text-muted-foreground">No matched skills data available</p>
                )}
              </div>
            </div>

            <Separator />

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

        <TabsContent value="customization" className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-[260px] sm:h-[360px] md:h-[420px] pr-4 space-y-4">
            {match.customizationRecommendations && match.customizationRecommendations.length > 0 ? (
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
              <p className="text-sm text-muted-foreground">No customization recommendations available</p>
            )}

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
                      <br />✓ Skills prioritized ({match.resumeIntakeData.skillsPriority?.length || 0})
                      <br />✓ ATS keywords identified ({match.resumeIntakeData.atsKeywords?.length || 0})
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
                  <h3 className="font-semibold mb-2">About {match.listing.companyName}</h3>
                  <p className="text-sm whitespace-pre-wrap">{companyInfo}</p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Job Description</h3>
                <div className="text-sm whitespace-pre-wrap">{match.listing.description}</div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 mt-auto border-t flex-shrink-0">
        {handlers?.onGenerateResume && (
          <Button onClick={() => handlers.onGenerateResume?.(match)} className="flex-1">
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
              listing: match.listing,
            })
          }
        >
          View Listing
        </Button>
        <Button variant="outline" onClick={() => window.open(match.listing.url, "_blank")}>
          <ExternalLink className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">View Job Posting</span>
          <span className="sm:hidden">View Job</span>
        </Button>
      </div>
    </div>
  )
}
