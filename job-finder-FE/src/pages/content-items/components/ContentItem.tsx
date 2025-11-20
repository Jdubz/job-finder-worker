import React, { useState } from "react"
import type {
  ContentItem as ContentItemType,
  UpdateContentItemData,
} from "../../../types/content-items"
import { ConfirmDialog } from "./ConfirmDialog"
import { FormActions } from "./FormActions"
import { Button } from "../../../components/ui/button"
import { Card } from "../../../components/ui/card"

// Import generic components
import { GenericContentView } from "./content-types/GenericContentView"
import { GenericContentEdit } from "./content-types/GenericContentEdit"

interface ContentItemProps {
  item: ContentItemType
  isOwner: boolean
  onUpdate: (id: string, data: UpdateContentItemData) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddChild?: (parentId: string, childType: string) => void
  children?: React.ReactNode
}

/**
 * Display component for a single content item
 * Renders appropriate view/edit component based on type
 */
export const ContentItem: React.FC<ContentItemProps> = ({
  item,
  isOwner,
  onUpdate,
  onDelete,
  onAddChild,
  children,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editData, setEditData] = useState<UpdateContentItemData>(item as UpdateContentItemData)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onUpdate(item.id, editData)
      setIsEditing(false)
    } catch (error) {
      console.error("Failed to save content item:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditData(item as UpdateContentItemData)
    setIsEditing(false)
  }

  const handleDeleteClick = () => {
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    setShowDeleteDialog(false)
    setIsDeleting(true)
    try {
      await onDelete(item.id)
    } catch (error) {
      console.error("Failed to delete content item:", error)
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false)
  }

  // Get item title for delete confirmation
  const getItemTitle = (): string => {
    switch (item.type) {
      case "company":
        return item.company
      case "project":
        return item.name
      case "skill-group":
        return item.category
      case "education":
        return item.institution
      case "profile-section":
        return item.heading
      case "text-section":
        return item.heading || "Text Section"
      case "accomplishment":
        return item.description.substring(0, 50) + "..."
      case "timeline-event":
        return item.title
      default:
        return "Item"
    }
  }

  if (isEditing) {
    return (
      <Card data-testid={`content-item-${item.id}`} className="border-2 border-primary">
        <div className="p-6 space-y-6">
          {/* Render generic edit component */}
          <GenericContentEdit data={editData} onChange={setEditData} type={item.type} />

          <FormActions
            onCancel={handleCancel}
            onSave={() => void handleSave()}
            onDelete={handleDeleteClick}
            isSubmitting={isSaving}
            isDeleting={isDeleting}
          />
        </div>

        <ConfirmDialog
          isOpen={showDeleteDialog}
          title={`Delete ${item.type}`}
          message={`Are you sure you want to delete "${getItemTitle()}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={handleDeleteCancel}
          isDestructive={true}
        />
      </Card>
    )
  }

  return (
    <Card data-testid={`content-item-${item.id}`}>
      <div className="p-6 space-y-4">
        {/* Render generic view component */}
        <GenericContentView item={item} />

        {/* Render children (nested items) */}
        {children && <div className="mt-6 space-y-4">{children}</div>}

        {/* Editor Actions */}
        {isOwner && (
          <div className="flex gap-2 pt-4 border-t">
            <Button type="button" onClick={() => setIsEditing(true)} variant="outline" size="sm">
              Edit
            </Button>
            {canHaveChildren(item.type) && onAddChild && (
              <Button
                type="button"
                onClick={() => onAddChild(item.id, getChildType(item.type))}
                variant="outline"
                size="sm"
              >
                + Add {getChildTypeName(item.type)}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * Determine if an item type can have children
 */
function canHaveChildren(type: string): boolean {
  return type === "company" || type === "text-section"
}

/**
 * Get the child type for a given parent type
 */
function getChildType(parentType: string): string {
  switch (parentType) {
    case "company":
      return "project"
    case "text-section":
      return "education" // or project for Selected Projects
    default:
      return "text-section"
  }
}

/**
 * Get human-readable name for child type
 */
function getChildTypeName(parentType: string): string {
  switch (parentType) {
    case "company":
      return "Project"
    case "text-section":
      return "Child Item"
    default:
      return "Item"
  }
}
