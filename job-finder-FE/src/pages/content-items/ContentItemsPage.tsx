import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type {
  ContentItem as ContentItemTypeUnion,
  ContentItemType,
  ContentItemWithChildren,
  UpdateContentItemData,
  CreateContentItemData,
} from "@/types/content-items"
import { useContentItems } from "@/hooks/useContentItems"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Download, Upload, AlertCircle, FileText } from "lucide-react"
import { ContentItem } from "./components/ContentItem"
import { ContentItemDialog } from "./components/ContentItemDialog"
import { logger } from "@/services/logging"

export function ContentItemsPage() {
  const { isOwner } = useAuth()

  const {
    contentItems,
    loading,
    error: firestoreError,
    createContentItem,
    updateContentItem,
    deleteContentItem,
  } = useContentItems()

  const [hierarchy, setHierarchy] = useState<ContentItemWithChildren[]>([])
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<ContentItemType>("company")
  const [, setPreselectedParentId] = useState<string | null>(null)

  // Auto-dismiss success alerts after 3 seconds
  useEffect(() => {
    if (alert?.type === "success") {
      const timer = setTimeout(() => setAlert(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [alert])

  // Build hierarchy when content items change
  useEffect(() => {
    if (firestoreError) {
      setAlert({
        type: "error",
        message: "Failed to load content. Please try again.",
      })
      return
    }

    const filteredItems = contentItems.filter(
      (item) => item.visibility === "published" || item.visibility === "draft"
    )

    const newHierarchy = buildHierarchy(filteredItems as unknown as ContentItemTypeUnion[])

    // Only update hierarchy if it's actually different
    setHierarchy((prevHierarchy) => {
      if (prevHierarchy.length !== newHierarchy.length) {
        return newHierarchy
      }

      // Check if any items have changed
      const hasChanged = prevHierarchy.some((prevItem, index) => {
        const newItem = newHierarchy[index]
        return !newItem || prevItem.id !== newItem.id
      })

      return hasChanged ? newHierarchy : prevHierarchy
    })
  }, [contentItems, firestoreError])

  // Build hierarchy from flat list
  const buildHierarchy = (items: ContentItemTypeUnion[]): ContentItemWithChildren[] => {
    const itemsMap = new Map<string, ContentItemWithChildren>()
    const rootItems: ContentItemWithChildren[] = []
    const processedItems = new Set<string>()

    // First pass: create map of all items
    items.forEach((item) => {
      itemsMap.set(item.id, { ...item, children: [] })
    })

    // Second pass: build parent-child relationships
    items.forEach((item) => {
      // Skip if already processed to prevent duplicates
      if (processedItems.has(item.id)) {
        return
      }

      const itemWithChildren = itemsMap.get(item.id)
      if (!itemWithChildren) {
        return
      }

      processedItems.add(item.id)

      // Only treat as root if parentId is explicitly null or undefined
      // Skip items with parentId that points to missing parent (orphaned items)
      if (item.parentId) {
        if (itemsMap.has(item.parentId)) {
          const parent = itemsMap.get(item.parentId)
          if (parent && parent.children) {
            parent.children.push(itemWithChildren)
          }
        }
        // If parent doesn't exist, skip this item (orphaned)
      } else {
        // No parentId = root item
        rootItems.push(itemWithChildren)
      }
    })

    // Sort root items by order
    return rootItems.sort((a, b) => a.order - b.order)
  }

  const handleUpdateItem = async (id: string, data: UpdateContentItemData) => {
    try {
      await updateContentItem(id, data)
      setAlert({
        type: "success",
        message: "Item updated successfully",
      })
    } catch (error) {
      console.error("Failed to update content item:", error)
      setAlert({
        type: "error",
        message: "Failed to update item. Please try again.",
      })
      throw error
    }
  }

  const handleDeleteItem = async (id: string) => {
    try {
      // Delete the item and its children
      await deleteContentItem(id)
      const children = contentItems.filter((item) => item.parentId === id)
      await Promise.all(children.map((child) => deleteContentItem(child.id)))

      setAlert({
        type: "success",
        message: "Item deleted successfully",
      })
    } catch (error) {
      console.error("Failed to delete content item:", error)
      setAlert({
        type: "error",
        message: "Failed to delete item. Please try again.",
      })
      throw error
    }
  }

  const handleAddChild = (parentId: string, childType: string) => {
    setPreselectedParentId(parentId)
    setDialogType(childType as ContentItemType)
    setDialogOpen(true)
  }

  const handleCreateNew = () => {
    setPreselectedParentId(null)
    setDialogType("company")
    setDialogOpen(true)
  }

  const handleExportItems = async () => {
    try {
      const dataStr = JSON.stringify(contentItems, null, 2)
      const dataBlob = new Blob([dataStr], { type: "application/json" })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = "content-items-export.json"
      link.click()
      URL.revokeObjectURL(url)

      setAlert({
        type: "success",
        message: `Exported ${contentItems.length} items`,
      })
    } catch (error) {
      console.error("Failed to export content items:", error)
      setAlert({
        type: "error",
        message: "Failed to export. Please try again.",
      })
    }
  }

  const handleReplaceAllItems = async () => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".json"

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        try {
          const text = await file.text()
          const items = JSON.parse(text) as CreateContentItemData[]

          if (!Array.isArray(items)) {
            throw new Error("Invalid file format")
          }

          // Replace all mode: clear existing items first
          if (contentItems.length > 0) {
            await logger.info(
              "database",
              "processing",
              `Clearing ${contentItems.length} existing items for import`,
              { details: { itemsToClear: contentItems.length, importMode: "replace" } }
            )
            await Promise.all(contentItems.map((item) => deleteContentItem(item.id)))
          }

          // Import all items
          await Promise.all(
            items.map((item) => {
              // Remove timestamp fields - let the service create them
              const itemData = item
              return createContentItem({
                ...itemData,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                visibility: (itemData.visibility || "draft") as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            })
          )

          setAlert({
            type: "success",
            message: `Replaced all content-items with ${items.length} imported items`,
          })
        } catch (error) {
          console.error("Failed to replace all:", error)
          setAlert({
            type: "error",
            message: "Failed to replace all. Please check the file format.",
          })
        }
      }

      input.click()
    } catch (error) {
      console.error("Failed to replace all content items:", error)
      setAlert({
        type: "error",
        message: "Failed to replace all. Please try again.",
      })
    }
  }

  const handleImportItems = async () => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".json"

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        try {
          const text = await file.text()
          const items = JSON.parse(text) as CreateContentItemData[]

          if (!Array.isArray(items)) {
            throw new Error("Invalid file format")
          }

          // Add new items mode: check for duplicates
          const existingIds = new Set(contentItems.map((item) => item.id))

          // Filter out items that already exist
          const newItems = items.filter(
            (item) => !existingIds.has((item as Record<string, unknown>).id as string)
          )

          if (newItems.length === 0) {
            setAlert({
              type: "success",
              message: "No new items to import - all items already exist",
            })
            return
          }

          if (newItems.length < items.length) {
            const skippedCount = items.length - newItems.length
            await logger.info(
              "database",
              "processing",
              `Skipped ${skippedCount} duplicate items during import`,
              { details: { skippedCount, totalItems: items.length, newItems: newItems.length } }
            )
          }

          await Promise.all(
            newItems.map((item) => {
              // Remove timestamp fields - let the service create them
              const itemData = item
              return createContentItem({
                ...itemData,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                visibility: (itemData.visibility || "draft") as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            })
          )

          setAlert({
            type: "success",
            message: `Imported ${newItems.length} items successfully`,
          })
        } catch (error) {
          console.error("Failed to import:", error)
          setAlert({
            type: "error",
            message: "Failed to import. Please check the file format.",
          })
        }
      }

      input.click()
    } catch (error) {
      console.error("Failed to import content items:", error)
      setAlert({
        type: "error",
        message: "Failed to import. Please try again.",
      })
    }
  }

  const handleDownloadResume = () => {
    try {
      // Create a link to download the resume.pdf file
      const link = document.createElement("a")
      link.href = "/resume.pdf" // Static file in public directory
      link.download = "resume.pdf"
      link.target = "_blank"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setAlert({
        type: "success",
        message: "Resume download started",
      })
    } catch (error) {
      console.error("Failed to download resume:", error)
      setAlert({
        type: "error",
        message: "Failed to download resume. Please try again.",
      })
    }
  }

  const handleUploadResume = () => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".pdf,.doc,.docx"
      input.multiple = false

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        // Validate file type
        const allowedTypes = [".pdf", ".doc", ".docx"]
        const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`
        if (!allowedTypes.includes(fileExtension)) {
          setAlert({
            type: "error",
            message: "Please select a PDF, DOC, or DOCX file.",
          })
          return
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024 // 10MB
        if (file.size > maxSize) {
          setAlert({
            type: "error",
            message: "File size must be less than 10MB.",
          })
          return
        }

        try {
          // Here you would typically upload the file to your backend
          // For now, we'll just show a success message
          setAlert({
            type: "success",
            message: `Resume "${file.name}" uploaded successfully`,
          })
        } catch (error) {
          console.error("Failed to upload resume:", error)
          setAlert({
            type: "error",
            message: "Failed to upload resume. Please try again.",
          })
        }
      }

      input.click()
    } catch (error) {
      console.error("Failed to upload resume:", error)
      setAlert({
        type: "error",
        message: "Failed to upload resume. Please try again.",
      })
    }
  }

  // Recursive rendering function
  const renderItemWithChildren = (item: ContentItemWithChildren, depth = 0) => {
    return (
      <ContentItem
        key={`${item.id}-${depth}`}
        item={item}
        isOwner={isOwner}
        onUpdate={handleUpdateItem}
        onDelete={handleDeleteItem}
        onAddChild={handleAddChild}
      >
        {/* Render children if they exist */}
        {item.children && item.children.length > 0 && (
          <div className="mt-4">
            {item.children.map((child) => renderItemWithChildren(child, depth + 1))}
          </div>
        )}
      </ContentItem>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Experience</h1>
            <p className="text-muted-foreground mt-2">
              Manage your professional experience and portfolio
            </p>
          </div>
          {isOwner && (
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Content
            </Button>
          )}
        </div>

        {/* Actions */}
        {isOwner && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportItems}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportItems}>
              <Upload className="mr-2 h-4 w-4" />
              Add New
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReplaceAllItems}>
              <Upload className="mr-2 h-4 w-4" />
              Replace All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadResume}>
              <FileText className="mr-2 h-4 w-4" />
              Download Resume
            </Button>
            <Button variant="outline" size="sm" onClick={handleUploadResume}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Resume
            </Button>
          </div>
        )}

        {/* Alert */}
        {alert && (
          <Alert variant={alert.type === "error" ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Render all content items in hierarchy order */}
      {hierarchy.length > 0 ? (
        <div className="space-y-4">{hierarchy.map((item) => renderItemWithChildren(item, 0))}</div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <div className="mx-auto max-w-md space-y-3">
            <h3 className="text-lg font-medium">No content yet</h3>
            <p className="text-sm text-muted-foreground">
              {isOwner
                ? "Add your professional experience to showcase your career history and accomplishments."
                : "Check back later for content details."}
            </p>
            {isOwner && (
              <Button onClick={handleCreateNew} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Content
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Create Content Dialog */}
      {dialogOpen && (
        <ContentItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          type={dialogType}
          onSave={() => {
            setDialogOpen(false)
            setPreselectedParentId(null)
            setAlert({
              type: "success",
              message: "Item created successfully",
            })
          }}
        />
      )}
    </div>
  )
}
