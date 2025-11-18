import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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
          AI-Powered Job Search
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">How Job Finder Works</h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          An intelligent, end-to-end platform that transforms your job search from manual drudgery
          into a streamlined, AI-assisted process
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <Zap className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Automated Discovery</CardTitle>
            <CardDescription>
              Submit job URLs or let our scraper find opportunities for you
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Sparkles className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>AI-Powered Matching</CardTitle>
            <CardDescription>
              Advanced AI analyzes requirements and generates custom materials
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <TrendingUp className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Pipeline Management</CardTitle>
            <CardDescription>
              Track applications, interviews, and follow-ups in one place
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
              Start your job search by submitting job postings you're interested in. Our system
              supports multiple intake methods to fit your workflow.
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
              <CardTitle>Queue Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Job URLs queued</span>
                <Badge variant="secondary">Real-time processing</Badge>
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
                Each job moves through our pipeline automatically, with retry logic and error
                handling built in
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Intelligent Scraping */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <Card className="md:order-2">
            <CardHeader>
              <CardTitle>Smart Scraping Technology</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">Supported Platforms:</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Greenhouse</Badge>
                  <Badge variant="outline">Workday</Badge>
                  <Badge variant="outline">Lever</Badge>
                  <Badge variant="outline">BambooHR</Badge>
                  <Badge variant="outline">Custom ATS</Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Extracted Data:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Job title and description</li>
                  <li>• Company name and website</li>
                  <li>• Location and remote policy</li>
                  <li>• Salary range (when available)</li>
                  <li>• Required skills and qualifications</li>
                  <li>• Application deadline</li>
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
              Once a job is queued, our Python-based scraper extracts all relevant information from
              the job posting. We handle different ATS platforms, parse structured data, and clean
              up messy formatting.
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
                  <p className="font-medium">Company Enrichment</p>
                  <p className="text-sm text-muted-foreground">
                    Fetches additional company information (culture, tech stack, size) to help you
                    make informed decisions
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
              <CardTitle>Resume Customization</CardTitle>
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
              Using the match analysis and resume intake data, generate perfectly tailored
              application materials for each position. Our AI provides specific, actionable guidance
              - not generic templates.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Resume Builder</p>
                  <p className="text-sm text-muted-foreground">
                    Pull content from your profile library, reorder based on relevance, emphasize
                    key achievements, and optimize for ATS scanning
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Cover Letter Generation</p>
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

        {/* Step 5: Application Tracking */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <GitBranch className="h-6 w-6 text-primary" />
              </div>
              <div>
                <Badge className="mb-1">Step 5</Badge>
                <h3 className="text-2xl font-bold">Pipeline Tracking</h3>
              </div>
            </div>
            <p className="text-muted-foreground">
              Monitor all your applications in a Kanban-style board. Track status changes, schedule
              interviews, set reminders, and never lose track of an opportunity.
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Status Tracking</p>
                  <p className="text-sm text-muted-foreground">
                    Applied → Screening → Interview → Offer → Rejected (track every application
                    stage)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Interview Scheduling</p>
                  <p className="text-sm text-muted-foreground">
                    Track interview dates, types (phone, technical, behavioral), and add preparation
                    notes
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Follow-up Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Set reminders for thank-you emails, application follow-ups, and offer deadlines
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Application Board View</CardTitle>
              <CardDescription>Your personal job search CRM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">Senior Frontend Engineer</p>
                    <Badge variant="secondary">Applied</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Company XYZ • Applied 3 days ago</p>
                </div>
                <div className="p-3 border rounded-lg border-primary/50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">Platform Engineer</p>
                    <Badge className="bg-blue-600">Interview</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Company ABC • Tech interview tomorrow
                  </p>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">Full Stack Developer</p>
                    <Badge variant="outline">Screening</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Company 123 • Recruiter call scheduled
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="my-12" />

      {/* Technology Stack */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Built with Modern Technology</h2>
          <p className="text-muted-foreground">
            Enterprise-grade architecture for reliability and performance
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Firebase Backend</CardTitle>
              <CardDescription>
                Cloud Functions for serverless API, Firestore for data persistence, and Firebase
                Auth for secure authentication
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Sparkles className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Advanced AI</CardTitle>
              <CardDescription>
                Powered by Claude and GPT-4 for intelligent matching, content generation, and
                personalized recommendations
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Database className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Python Worker</CardTitle>
              <CardDescription>
                Dedicated Python microservice for web scraping, data extraction, and queue
                processing
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>React Frontend</CardTitle>
              <CardDescription>
                Modern TypeScript + React app with Tailwind CSS, shadcn/ui components, and
                responsive design
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Clock className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Real-time Updates</CardTitle>
              <CardDescription>
                Live status updates, real-time queue monitoring, and instant notifications when jobs
                are processed
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Secure & Private</CardTitle>
              <CardDescription>
                Your data is encrypted, stored securely in Firebase, and never shared. Role-based
                access control protects sensitive features
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
                  Submit multiple job URLs at once. Our queue system processes them in parallel,
                  with intelligent retry logic and error handling.
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
                <h4 className="font-semibold mb-1">Multi-format Export</h4>
                <p className="text-sm text-muted-foreground">
                  Export resumes and cover letters in PDF, DOCX, or Markdown. Customize styling and
                  formatting to match your personal brand.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Company Intelligence</h4>
                <p className="text-sm text-muted-foreground">
                  Automatically enriches company data with tech stack, culture info, size category,
                  and priority scoring to help you prioritize applications.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mt-1">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Analytics & Insights</h4>
                <p className="text-sm text-muted-foreground">
                  Track success rates, average time-to-interview, most successful application
                  strategies, and identify patterns in your job search.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-12" />

      {/* Technical Architecture */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Technical Architecture</h2>
          <p className="text-muted-foreground">How the system works under the hood</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>End-to-End Data Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-center text-sm">
              <div className="text-center p-4 border rounded-lg flex-1">
                <Briefcase className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Job URL Submitted</p>
                <p className="text-xs text-muted-foreground mt-1">Frontend → API</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <Database className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Queued in Firestore</p>
                <p className="text-xs text-muted-foreground mt-1">job-queue collection</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <Zap className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Python Worker</p>
                <p className="text-xs text-muted-foreground mt-1">Scrapes & extracts</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">AI Analysis</p>
                <p className="text-xs text-muted-foreground mt-1">Claude/GPT-4</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 md:rotate-0" />
              <div className="text-center p-4 border rounded-lg flex-1">
                <FileText className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="font-medium">Match Saved</p>
                <p className="text-xs text-muted-foreground mt-1">job-matches collection</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resilient Queue</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Automatic retry logic, dead-letter queue, and exponential backoff ensure no jobs are
              lost
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Structured Logging</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Cloud Logging integration with request tracing, error tracking, and performance
              monitoring
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Type-Safe APIs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Shared TypeScript types ensure consistency between frontend, backend, and worker
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
            href="/job-finder"
            className="inline-flex items-center gap-2 px-6 py-3 border border-input rounded-lg font-medium hover:bg-accent transition-colors"
          >
            Explore Features
          </a>
        </div>
      </div>
    </div>
  )
}
