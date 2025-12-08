import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Pause, Play } from "lucide-react"

interface ConfirmToggleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isProcessingEnabled: boolean
  isToggling: boolean
  onConfirm: () => void
}

/**
 * Confirmation dialog for toggling queue processing on/off.
 */
export function ConfirmToggleDialog({
  open,
  onOpenChange,
  isProcessingEnabled,
  isToggling,
  onConfirm,
}: ConfirmToggleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isProcessingEnabled ? "Pause Queue Processing?" : "Start Queue Processing?"}
          </DialogTitle>
          <DialogDescription>
            {isProcessingEnabled
              ? "The worker will stop picking up new tasks from the queue. Items currently being processed will complete. Pending items will remain in the queue."
              : "The worker will resume processing pending items in the queue."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isProcessingEnabled ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isToggling}
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isProcessingEnabled ? (
              <Pause className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isProcessingEnabled ? "Pause Processing" : "Start Processing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
