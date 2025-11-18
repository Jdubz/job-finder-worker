export function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Job Finder</h1>
        <p className="text-muted-foreground mt-2">AI-powered job discovery and matching platform</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="border rounded-lg p-6 space-y-2">
          <h3 className="font-semibold">Document Builder</h3>
          <p className="text-sm text-muted-foreground">
            Generate custom resumes and cover letters with AI
          </p>
        </div>

        <div className="border rounded-lg p-6 space-y-2">
          <h3 className="font-semibold">Job Applications</h3>
          <p className="text-sm text-muted-foreground">
            Track and manage your job application pipeline
          </p>
        </div>

        <div className="border rounded-lg p-6 space-y-2">
          <h3 className="font-semibold">Smart Matching</h3>
          <p className="text-sm text-muted-foreground">
            AI analyzes job postings to find the best matches
          </p>
        </div>
      </div>
    </div>
  )
}
