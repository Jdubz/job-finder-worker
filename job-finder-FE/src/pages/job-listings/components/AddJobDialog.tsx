import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertCircle, Loader2 } from "lucide-react"

interface AddJobFormState {
  jobUrl: string
  jobTitle: string
  jobDescription: string
  jobLocation: string
  jobTechStack: string
  bypassFilter: boolean
  companyName: string
}

interface AddJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formState: AddJobFormState
  isSubmitting: boolean
  submitError: string | null
  onFieldChange: <K extends keyof AddJobFormState>(field: K, value: AddJobFormState[K]) => void
  onSubmit: (e: React.FormEvent) => Promise<void>
}

/**
 * Dialog for adding a new job listing for analysis.
 */
export function AddJobDialog({
  open,
  onOpenChange,
  formState,
  isSubmitting,
  submitError,
  onFieldChange,
  onSubmit,
}: AddJobDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Job for Analysis</DialogTitle>
          <DialogDescription>
            Submit a job posting URL for analysis. Title and description are optional — the system will attempt to extract them from the page if left blank.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="jobUrl">Job URL *</Label>
            <Input
              id="jobUrl"
              type="url"
              placeholder="https://example.com/careers/job-title"
              value={formState.jobUrl}
              onChange={(e) => onFieldChange("jobUrl", e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">Direct link to the job posting page. If title and description are left blank, the system will attempt to extract them automatically.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobTitle">Job Title</Label>
            <Input
              id="jobTitle"
              type="text"
              placeholder="Senior Frontend Engineer"
              value={formState.jobTitle}
              onChange={(e) => onFieldChange("jobTitle", e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobDescription">Job Description</Label>
            <Textarea
              id="jobDescription"
              placeholder="Paste the full job description"
              value={formState.jobDescription}
              onChange={(e) => onFieldChange("jobDescription", e.target.value)}
              disabled={isSubmitting}
              className="min-h-[140px]"
            />
            <p className="text-sm text-muted-foreground">
              {formState.jobDescription.trim() ? "Providing the description avoids false negatives in keyword/tech filters." : "Leave blank to attempt auto-extraction from the URL."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jobLocation">Location (optional)</Label>
              <Input
                id="jobLocation"
                type="text"
                placeholder="Portland, OR or Remote"
                value={formState.jobLocation}
                onChange={(e) => onFieldChange("jobLocation", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="techStack">Tech Stack (optional)</Label>
              <Input
                id="techStack"
                type="text"
                placeholder="React, TypeScript, GraphQL"
                value={formState.jobTechStack}
                onChange={(e) => onFieldChange("jobTechStack", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name (optional)</Label>
            <Input
              id="companyName"
              type="text"
              placeholder="Acme Inc."
              value={formState.companyName}
              onChange={(e) => onFieldChange("companyName", e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">If known, helps with analysis accuracy</p>
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="bypassFilter"
              checked={formState.bypassFilter}
              onCheckedChange={(checked) => onFieldChange("bypassFilter", Boolean(checked))}
              disabled={isSubmitting}
            />
            <div className="grid gap-1 leading-tight">
              <Label htmlFor="bypassFilter">Bypass intake filters</Label>
              <p className="text-sm text-muted-foreground">
                Skip automated pre-filtering for this submission and send it directly to analysis.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Job"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
