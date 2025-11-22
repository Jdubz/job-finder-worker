import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useQueueItems } from "@/hooks/useQueueItems"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { QueueStatusTable } from "./components/QueueStatusTable"

export function JobFinderPage() {
  const { user, isOwner } = useAuth()
  const { submitJob: submitJobToQueue } = useQueueItems()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [jobUrl, setJobUrl] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyUrl, setCompanyUrl] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validation
    if (!jobUrl.trim()) {
      setError("Job URL is required")
      return
    }

    try {
      setIsSubmitting(true)

      await submitJobToQueue(jobUrl.trim(), companyName.trim() || undefined)

      setSuccess("Job submitted successfully!")
      // Clear form
      setJobUrl("")
      setCompanyName("")
      setCompanyUrl("")
    } catch (err) {
      console.error("Failed to submit job:", err)
      setError(err instanceof Error ? err.message : "Failed to submit job. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Finder</h1>
          <p className="text-muted-foreground mt-2">
            Submit job URLs for AI analysis (Editor Only)
          </p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need editor permissions to access this feature. Please contact an administrator.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Job Finder</h1>
        <p className="text-muted-foreground mt-2">
          Submit job URLs for AI-powered analysis and matching
        </p>
      </div>

      {/* Job Submission Form */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Job for Analysis</CardTitle>
          <CardDescription>
            Enter a job posting URL to analyze it with AI and check if it's a good match
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Job URL */}
            <div className="space-y-2">
              <Label htmlFor="jobUrl">
                Job URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="jobUrl"
                type="url"
                placeholder="https://company.com/careers/job-id"
                value={jobUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJobUrl(e.target.value)}
                disabled={isSubmitting}
                required
              />
              <p className="text-sm text-muted-foreground">The full URL to the job posting</p>
            </div>

            {/* Company Name (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name (Optional)</Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Acme Corporation"
                value={companyName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCompanyName(e.target.value)
                }
                disabled={isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                Leave blank to auto-detect from the job posting
              </p>
            </div>

            {/* Company Website (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="companyUrl">Company Website (Optional)</Label>
              <Input
                id="companyUrl"
                type="url"
                placeholder="https://company.com"
                value={companyUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompanyUrl(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                Used for enhanced resume customization
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Success Alert */}
            {success && (
              <Alert className="border-green-500 bg-green-50 text-green-900">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Job for Analysis"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Queue Status */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Submissions</CardTitle>
          <CardDescription>Track the status of your submitted jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <QueueStatusTable />
        </CardContent>
      </Card>
    </div>
  )
}
