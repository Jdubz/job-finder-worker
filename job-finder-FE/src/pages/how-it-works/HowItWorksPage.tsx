import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ROUTES } from "@/types/routes"
import { Briefcase, Sparkles, FileText, Target, CheckCircle2, ArrowRight, Shield } from "lucide-react"

export function HowItWorksPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-12">
      {/* Hero */}
      <div className="text-center space-y-3">
        <Badge variant="outline" className="mb-1">
          <Sparkles className="h-3 w-3 mr-1" />
          Built for hiring partners
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">How Job Finder Works</h1>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          We turn your open role into a short list of tailored applicant materials—so you see prepared candidates
          without doing extra coaching.
        </p>
      </div>

      {/* Promise cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Clear Inputs</CardTitle>
            <CardDescription>Share a job link and the description you want candidates to target.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ranked Matches</CardTitle>
            <CardDescription>Roles move through our queue and return an AI score and priority you can sort.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ready-to-Share Docs</CardTitle>
            <CardDescription>Downloadable resumes and cover letters tailored to that specific role.</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Separator />

      {/* Steps */}
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">The current flow</h2>
          <p className="text-muted-foreground">What the product does today—no future promises.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <Badge>Step 1</Badge>
              </div>
              <CardTitle>Capture the role</CardTitle>
              <CardDescription>
                You (or the candidate) paste the job link, title, and description. We keep the exact text so the
                analysis matches what hiring teams care about.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <Badge>Step 2</Badge>
              </div>
              <CardTitle>Align to the candidate</CardTitle>
              <CardDescription>
                The candidate’s “Career Story” library (roles, achievements, skills) is matched to the posting.
                Each job gets a score and a High/Medium/Low priority so recruiters can triage quickly.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <Badge>Step 3</Badge>
              </div>
              <CardTitle>Deliver tailored materials</CardTitle>
              <CardDescription>
                From the Matches table, generate a resume and optional cover letter in the Document Builder.
                PDFs stay specific to the job details you provided.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Separator />

      {/* What you see in the app */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">What you can review</h2>
          <p className="text-muted-foreground">Screens that are live in the product today.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Matches</CardTitle>
              <CardDescription>Sortable list of analyzed roles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <span>Shows score, company, title, and priority for every job we analyzed.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <span>Filters for priority or best scores keep attention on the strongest fits.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <span>Click any row to jump straight into document generation for that role.</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Career Story</CardTitle>
              <CardDescription>Candidate-owned library of experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <span>Structured entries for roles, achievements, skills, and education.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <span>Used directly by the Document Builder so resumes stay consistent.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                <span>Easy to update when new accomplishments land.</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Document Builder</CardTitle>
              <CardDescription>Exports the tailored resume and optional cover letter.</CardDescription>
            </div>
            <a
              href={ROUTES.DOCUMENT_BUILDER}
              className="inline-flex items-center gap-2 text-primary font-medium"
            >
              Open the builder
              <ArrowRight className="h-4 w-4" />
            </a>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
              <span>Select a match, confirm the job details, and generate PDFs.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
              <span>Progress steps show when data is collected, generated, and rendered.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
              <span>Download links appear on completion—no waiting on email.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Reliability */}
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Quality & access</h2>
          <p className="text-muted-foreground">Simple guardrails that exist right now.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Shield className="h-7 w-7 mb-2 text-primary" />
              <CardTitle>Sign-in required</CardTitle>
              <CardDescription>Google auth and role-based views keep admin pages gated.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Shield className="h-7 w-7 mb-2 text-primary" />
              <CardTitle>Traceable queue</CardTitle>
              <CardDescription>Every job moves through Pending → Analyzing → Matched so status is never hidden.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Shield className="h-7 w-7 mb-2 text-primary" />
              <CardTitle>Editable inputs</CardTitle>
              <CardDescription>Roles and career entries can be updated anytime if the description changes.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-lg p-8 text-center space-y-3">
        <h2 className="text-2xl font-bold">Want to see a sample packet?</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Open the Matches page, pick a role, and generate the resume and cover letter we’d send for that specific job.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <a
            href={ROUTES.JOB_APPLICATIONS}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            View Matches
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={ROUTES.DOCUMENT_BUILDER}
            className="inline-flex items-center gap-2 px-6 py-3 border border-input rounded-lg font-medium hover:bg-accent transition-colors"
          >
            Build a Packet
          </a>
        </div>
      </div>
    </div>
  )
}
