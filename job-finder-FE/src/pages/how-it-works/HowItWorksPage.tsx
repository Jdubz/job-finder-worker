import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ROUTES } from "@/types/routes"
import {
  Briefcase,
  Sparkles,
  FileText,
  Target,
  Zap,
  Database,
  GitBranch,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Shield,
  Clock,
} from "lucide-react"

export function HowItWorksPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <Badge variant="outline" className="mb-2">
          <Sparkles className="h-3 w-3 mr-1" />
          Candidate Materials, Done Fast
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">How Job Finder Helps Candidates</h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Give us a role link and we return a tailored resume and cover letter in minutes—so you see
          prepared, informed applicants without extra lift for your team.
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <Zap className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Easy Intake</CardTitle>
            <CardDescription>
              Drop in a job link (Greenhouse, Workday, Lever, etc.) and we handle the rest
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Sparkles className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>AI-Powered Matching</CardTitle>
            <CardDescription>
              AI reads the role, scores fit, and outlines what to highlight
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <TrendingUp className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Match Review</CardTitle>
            <CardDescription>
              Ranked results with quick filters and instant PDF generation
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Separator className="my-12" />

      {/* Detailed Workflow */}
      <div className="space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">The Complete Workflow</h2>
          <p className="text-muted-foreground">
            From job discovery to application submission, we've got you covered
          </p>
        </div>

        {/* Step 1: Job Discovery */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Briefcase className="h-6 w-6 text-primary" />
              </div>
              <div>
                <Badge className="mb-1">Step 1</Badge>
                <h3 className="text-2xl font-bold">Job Discovery & Intake</h3>
              </div>
            </div>
            <p className="text-muted-foreground">
              Share the role link you already have. We work with the common ATS links recruiters use,
              so there’s no new export or format needed.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Manual URL Submission</p>
                  <p className="text-sm text-muted-foreground">
                    Paste job posting URLs directly - supports Greenhouse, Workday, Lever, and most
                    ATS platforms
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Automated Company Scraping</p>
                  <p className="text-sm text-muted-foreground">
                    Add target companies to your watchlist - our scraper automatically finds new
                    postings
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">RSS Feed Integration</p>
                  <p className="text-sm text-muted-foreground">
                    Subscribe to company career RSS feeds for real-time job posting notifications
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Processing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Jobs in progress</span>
                <Badge variant="secondary">Live status</Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span>Pending: Job scraping initiated</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>Processing: AI analysis in progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span>Complete: Match generated</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Each role moves through intake → scrape → AI analysis. If something fails, we stop
                and flag it for review instead of looping.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Intelligent Scraping */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <Card className="md:order-2">
            <CardHeader>
              <CardTitle>What We Pull</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">From the role link:</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Title</Badge>
                  <Badge variant="outline">Company</Badge>
                  <Badge variant="outline">Location</Badge>
                  <Badge variant="outline">Requirements</Badge>
                  <Badge variant="outline">Nice-to-haves</Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">If available:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Salary range</li>
                  <li>• Remote policy</li>
                  <li>• Deadlines</li>
                </ul>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4 md:order-1">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <Badge className="mb-1">Step 2</Badge>
                <h3 className="text-2xl font-bold">Intelligent Scraping</h3>
              </div>
            </div>
            <p className="text-muted-foreground">
              Once a job is queued, we read the posting directly, clean the text, and structure the
              details so the AI can reason about fit.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Platform Detection</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically identifies the job board platform (Greenhouse, Workday, etc.) and
                    uses optimized scraping strategies for each
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Data Normalization</p>
                  <p className="text-sm text-muted-foreground">
                    Standardizes job data into a consistent format, removing HTML tags, normalizing
                    dates, and extracting key details
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Company Details</p>
                  <p className="text-sm text-muted-foreground">
                    Pulls basics like website and size category to keep context in one place
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: AI Matching */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <Badge className="mb-1">Step 3</Badge>
                <h3 className="text-2xl font-bold">AI-Powered Matching</h3>
              </div>
            </div>
            <p className="text-muted-foreground">
              Our AI analyzes the job description against your profile, experience, and preferences
              to generate a detailed match report with actionable insights.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Match Score (0-100)</p>
                  <p className="text-sm text-muted-foreground">
                    Comprehensive score considering skills overlap, experience level, location
                    preferences, and role alignment
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Skills Analysis</p>
                  <p className="text-sm text-muted-foreground">
                    Lists matched skills you have, missing skills to highlight, and transferable
                    skills from your background
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Application Priority</p>
                  <p className="text-sm text-muted-foreground">
                    Categorizes as High, Medium, or Low priority based on match quality and your
                    preferences
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Resume Intake Data</p>
                  <p className="text-sm text-muted-foreground">
                    Generates specific recommendations: which experiences to emphasize, projects to
                    highlight, skills to feature, and ATS keywords to include
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Sample Match Report</CardTitle>
              <CardDescription>What you get for each job</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Match</span>
                  <Badge className="bg-green-600">85/100</Badge>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: "85%" }} />
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Matched Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">TypeScript</Badge>
                  <Badge variant="secondary">React</Badge>
                  <Badge variant="secondary">Python</Badge>
                  <Badge variant="secondary">Docker</Badge>
                  <Badge variant="secondary">+8 more</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Missing Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">Kubernetes</Badge>
                  <Badge variant="outline">Go</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Priority</p>
                <Badge className="bg-orange-600">High Priority</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 4: Document Generation */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <Card className="md:order-2">
            <CardHeader>
              <CardTitle>Resume & Cover Letter PDFs</CardTitle>
              <CardDescription>AI-generated guidance for each application</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-2">Professional Summary</p>
                <p className="text-xs text-muted-foreground italic">
                  "Full-stack engineer with 5+ years building scalable distributed systems. Expert
                  in TypeScript, React, and microservices architecture..."
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Experience to Emphasize</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Platform engineering role at Fulfil (highlight Kubernetes work)</li>
                  <li>• API development for high-traffic systems</li>
                  <li>• Mention mentoring junior engineers</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Projects to Include</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Order management system (emphasize scalability)</li>
                  <li>• Real-time messaging platform</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">ATS Keywords</p>
                <p className="text-xs text-muted-foreground">
                  distributed systems, microservices, Kubernetes, CI/CD, system design, REST APIs,
                  GraphQL...
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4 md:order-1">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <Badge className="mb-1">Step 4</Badge>
                <h3 className="text-2xl font-bold">Custom Document Generation</h3>
              </div>
            </div>
            <p className="text-muted-foreground">
              Using the match analysis and resume intake data, generate tailored resume and cover
              letter PDFs for each position. Guidance stays specific to the role instead of generic
              templates.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Resume Builder (PDF)</p>
                  <p className="text-sm text-muted-foreground">
                    Pull content from your profile library, reorder based on relevance, emphasize
                    key achievements, and optimize for ATS scanning
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Cover Letter Generation (PDF)</p>
                  <p className="text-sm text-muted-foreground">
                    AI drafts a compelling cover letter highlighting your most relevant experience
                    and explaining your motivation for the role
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Gap Mitigation Strategies</p>
                  <p className="text-sm text-muted-foreground">
                    For missing requirements, AI suggests how to frame your transferable skills and
                    learning capacity
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Match Review */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <GitBranch className="h-6 w-6 text-primary" />
              </div>
              <div>
                <Badge className="mb-1">Step 5</Badge>
                <h3 className="text-2xl font-bold">Match Review</h3>
              </div>
            </div>
            <p className="text-muted-foreground">
              Review AI-ranked matches in a sortable table. Filter by company, score, and priority,
              then jump into document generation for promising roles.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Priority & Score Filters</p>
                  <p className="text-sm text-muted-foreground">Sort and filter by match score or priority.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Company Drill-down</p>
                  <p className="text-sm text-muted-foreground">Open company details from any match row.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">One-click Docs</p>
                  <p className="text-sm text-muted-foreground">Send a match to the document builder to draft PDFs.</p>
                </div>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Matches Table</CardTitle>
              <CardDescription>Ranked opportunities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">Senior Frontend Engineer</p>
                    <Badge className="bg-green-600">88%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Company XYZ • Priority: High</p>
                </div>
                <div className="p-3 border rounded-lg border-primary/50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">Platform Engineer</p>
                    <Badge className="bg-orange-600">78%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Company ABC • Priority: Medium</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">Full Stack Developer</p>
                    <Badge variant="secondary">71%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Company 123 • Priority: Low</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="my-12" />

      {/* Reliability & Security */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Reliable & Secure by Default</h2>
          <p className="text-muted-foreground">
            Built to keep candidate data private and outputs consistent.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Private Data Path</CardTitle>
              <CardDescription>
                Processing stays inside a locked-down environment with controlled access.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Sparkles className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Leading AI Models</CardTitle>
              <CardDescription>
                Uses top-tier AI to score roles and draft writing with clear guardrails.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Clock className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Status You Can See</CardTitle>
              <CardDescription>
                Live processing indicators and frequent refresh keep the matches list current.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Fast Web Experience</CardTitle>
              <CardDescription>
                Review matches and generate PDFs without waiting on email attachments.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Access Control</CardTitle>
              <CardDescription>
                Sign in with Google and role-based permissions keep admin tools restricted.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Separator className="my-12" />

      {/* Key Features */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Key Features</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Smart Content Library</h4>
                <p className="text-sm text-muted-foreground">
                  Build a reusable library of your experiences, projects, skills, and
                  accomplishments. The AI pulls relevant content for each application automatically.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Batch Processing</h4>
                <p className="text-sm text-muted-foreground">
                  Submit multiple job URLs at once. Our queue system processes them in parallel
                  and surfaces failures quickly while retries remain paused.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Filter & Strike System</h4>
                <p className="text-sm text-muted-foreground">
                  Set up exclusion lists (companies, keywords, domains) to automatically skip jobs
                  that don't match your criteria.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                <h4 className="font-semibold mb-1">PDF Export</h4>
                <p className="text-sm text-muted-foreground">
                  Generate resume and cover letter PDFs with role-specific content pulled from your
                  profile library.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Company Snapshots</h4>
                <p className="text-sm text-muted-foreground">
                  Keep company basics handy (site, size category, saved notes) while drafting.
                </p>
              </div>
            </div>

              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Quick Stats</h4>
                  <p className="text-sm text-muted-foreground">
                    Counts, priorities, and average match scores keep focus on the best leads.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      <Separator className="my-12" />

      {/* How It Flows */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">How It Flows</h2>
          <p className="text-muted-foreground">Simple steps from link to ready-to-send PDFs.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>End-to-End Path</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-center text-sm">
              <div className="text-center p-4 border rounded-lg flex-1">
                <Briefcase className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Role Link Added</p>
                <p className="text-xs text-muted-foreground mt-1">Candidate pastes the job URL</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <Database className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Processing Starts</p>
                <p className="text-xs text-muted-foreground mt-1">Job captured and queued</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <Zap className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Details Extracted</p>
                <p className="text-xs text-muted-foreground mt-1">Role text cleaned and structured</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">AI Match</p>
                <p className="text-xs text-muted-foreground mt-1">Score, strengths, gaps</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <FileText className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">PDFs Ready</p>
                <p className="text-xs text-muted-foreground mt-1">Resume & cover letter download</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stable Processing</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Generous timeouts and clear failure states surface issues for review. Retries stay
              paused until a fix is verified.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Structured Logging</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Every step is logged with context so issues can be traced quickly when needed.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consistent Data</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Shared schemas keep the web app, API, and processing in sync on the same fields.
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-lg p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">Ready to Transform Your Job Search?</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Stop manually tailoring resumes and tracking applications in spreadsheets. Let AI handle
          the busy work while you focus on interview prep and networking.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <a
            href="/document-builder"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={ROUTES.JOB_LISTINGS}
            className="inline-flex items-center gap-2 px-6 py-3 border border-input rounded-lg font-medium hover:bg-accent transition-colors"
          >
            Explore Features
          </a>
        </div>
      </div>
    </div>
  )
}
