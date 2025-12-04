import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download, ExternalLink, Loader2 } from "lucide-react"
import { useState } from "react"

interface DocumentPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  title: string
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  url,
  title,
}: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(true)

  const handleDownload = () => {
    if (!url) return
    const link = document.createElement("a")
    link.href = url
    link.download = title.replace(/[^a-zA-Z0-9]/g, "_") + ".pdf"
    link.target = "_blank"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenInNewTab = () => {
    if (!url) return
    window.open(url, "_blank")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg truncate pr-4">{title}</DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 relative bg-muted/50 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {url && (
            <iframe
              src={url}
              className="w-full h-full border-0"
              title={title}
              onLoad={() => setLoading(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
