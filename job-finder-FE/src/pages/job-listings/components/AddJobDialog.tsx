import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
            Submit a job posting URL for analysis. Job details will be automatically extracted from the page.
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
            <Label htmlFor="jobUrl">Job URL</Label>
            <Input
              id="jobUrl"
              type="url"
              placeholder="https://example.com/careers/job-title"
              value={formState.jobUrl}
              onChange={(e) => onFieldChange("jobUrl", e.target.value)}
              disabled={isSubmitting}
            />
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
