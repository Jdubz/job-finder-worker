import { useState } from "react"
import { toPng } from "html-to-image"
import { Button } from "@/components/ui/button"
import { Download, Camera } from "lucide-react"

type Props = {
  targetId: string
}

export function ScreenshotButton({ targetId }: Props) {
  const [isCapturing, setIsCapturing] = useState(false)

  const handleCapture = async () => {
    const el = document.getElementById(targetId)
    if (!el) return
    setIsCapturing(true)
    try {
      const dataUrl = await toPng(el, { cacheBust: true, backgroundColor: "#ffffff" })
      const link = document.createElement("a")
      link.download = "config-screenshot.png"
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error("Failed to capture screenshot", err)
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCapture} disabled={isCapturing} className="gap-2">
      {isCapturing ? <Download className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
      {isCapturing ? "Preparing..." : "Capture screenshot"}
    </Button>
  )
}
