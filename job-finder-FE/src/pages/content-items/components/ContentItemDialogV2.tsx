/**
 * Content Item Dialog V2
 *
 * Simplified version using GenericContentEdit component.
 * Reduces code complexity and improves maintainability.
 */

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { contentItemsClient } from "@/api"
import type {
  ContentItem,
  ContentItemType,
  UpdateContentItemData,
  ContentItemVisibility,
} from "@/types/content-items"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"
import { GenericContentEdit } from "./content-types/GenericContentEdit"
import { logger } from "@/services/logging"

interface ContentItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: ContentItemType
  item?: ContentItem | null
  onSave: () => void
}

export function ContentItemDialogV2({
  open,
  onOpenChange,
  type,
  item,
  onSave,
}: ContentItemDialogProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<UpdateContentItemData>({})
  const [visibility, setVisibility] = useState<ContentItemVisibility>("published")

  // Initialize form data when dialog opens or item changes
  useEffect(() => {
    if (open) {
      if (item) {
        // Edit mode - populate with existing data
        setFormData(item as UpdateContentItemData)
        setVisibility(item.visibility || "published")
        logger.debug("database", "processing", `Edit content item: ${item.id}`, {
          details: { itemType: item.type, itemId: item.id },
        })
      } else {
        // Create mode - initialize with empty data
        setFormData({})
        setVisibility("published")
        logger.debug("database", "processing", `Create content item: ${type}`)
      }
      setError(null)
    }
  }, [open, item, type])

  const handleSave = async () => {
    if (!user) {
      setError("You must be logged in to save content items")
      return
    }
    if (!user.email) {
      setError("A verified email address is required to save content items")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const baseData = {
        type,
        visibility,
      }

      if (item) {
        // Update existing item using client
        const updateData: UpdateContentItemData = {
          ...baseData,
          ...formData,
        }

        await contentItemsClient.updateContentItem(item.id, user.email, updateData)

        await logger.info("database", "completed", `Updated content item: ${item.id}`, {
          details: { itemType: type, itemId: item.id },
        })
      } else {
        // Create new item using client
        const createData = {
          ...baseData,
          ...formData,
          parentId: null,
          order: 0,
        }

        await contentItemsClient.createContentItem(user.uid, user.email, createData)

        await logger.info("database", "completed", `Created content item: ${type}`, {
          details: { itemType: type },
        })
      }

      onSave()
      onOpenChange(false)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save content item"
      setError(errorMessage)

      await logger.error("database", "failed", `Failed to save content item: ${errorMessage}`, {
        error: {
          type: err instanceof Error ? err.constructor.name : "UnknownError",
          message: errorMessage,
          stack: err instanceof Error ? err.stack : undefined,
        },
        details: { itemType: type, itemId: item?.id },
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFormChange = (newData: UpdateContentItemData) => {
    setFormData(newData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? `Edit ${type.replace("-", " ")}` : `Add ${type.replace("-", " ")}`}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Visibility Setting */}
          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(value: ContentItemVisibility) => setVisibility(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generic Content Edit Form */}
          <GenericContentEdit data={formData} onChange={handleFormChange} type={type} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {item ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
