import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { CompanyDetailsModalContent } from "./entities/CompanyModalContent"
import { JobListingModalContent } from "./entities/JobListingModalContent"
import { JobMatchModalContent } from "./entities/JobMatchModalContent"
import { JobSourceModalContent } from "./entities/JobSourceModalContent"
import { QueueItemModalContent } from "./entities/QueueItemModalContent"

export function EntityModalHost() {
  const { modal, closeModal } = useEntityModal()

  if (!modal) return null

  const renderContent = () => {
    switch (modal.type) {
      case "company":
        return <CompanyDetailsModalContent companyId={modal.companyId} company={modal.company} />
      case "jobListing":
        return (
          <JobListingModalContent
            listing={modal.listing}
            handlers={{ onDelete: modal.onDelete, onResubmit: modal.onResubmit }}
          />
        )
      case "jobMatch":
        return <JobMatchModalContent match={modal.match} handlers={{ onGenerateResume: modal.onGenerateResume }} />
      case "jobSource":
        return (
          <JobSourceModalContent
            source={modal.source}
            handlers={{ onToggleStatus: modal.onToggleStatus, onDelete: modal.onDelete }}
          />
        )
      case "jobQueueItem":
        return <QueueItemModalContent item={modal.item} handlers={{ onCancel: modal.onCancel }} />
      default:
        return null
    }
  }

  const widthClass =
    modal.type === "jobListing" || modal.type === "jobMatch"
      ? "w-[98vw] sm:max-w-6xl"
      : modal.type === "jobSource"
        ? "w-[95vw] sm:max-w-4xl"
        : "w-[90vw] sm:max-w-3xl"

  return (
    <Dialog open={!!modal} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className={`${widthClass} max-h-[95vh] overflow-hidden flex flex-col`}>
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}
