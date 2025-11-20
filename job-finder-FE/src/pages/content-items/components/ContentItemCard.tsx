import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { ContentItemNode } from "@shared/types"
import type { ContentItemFormValues } from "@/types/content-items"
import { ContentItemForm } from "./ContentItemForm"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"

interface ContentItemCardProps {
  item: ContentItemNode
  siblings: ContentItemNode[]
  index: number
  depth?: number
  onSave: (id: string, values: ContentItemFormValues) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreateChild: (parentId: string, values: ContentItemFormValues) => Promise<void>
  onMove: (id: string, parentId: string | null, newIndex: number) => Promise<void>
}

export function ContentItemCard({
  item,
  siblings,
  index,
  depth = 0,
  onSave,
  onDelete,
  onCreateChild,
  onMove
}: ContentItemCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showChildForm, setShowChildForm] = useState(false)

  const canMoveUp = index > 0
  const canMoveDown = index < siblings.length - 1

  const handleSave = async (values: ContentItemFormValues) => {
    setIsProcessing(true)
    try {
      await onSave(item.id, values)
      setIsEditing(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDelete = async () => {
    setIsProcessing(true)
    try {
      await onDelete(item.id)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreateChild = async (values: ContentItemFormValues) => {
    setIsProcessing(true)
    try {
      await onCreateChild(item.id, values)
      setShowChildForm(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMove = async (direction: -1 | 1) => {
    const targetIndex = Math.min(Math.max(index + direction, 0), siblings.length - 1)
    if (targetIndex === index) return
    setIsProcessing(true)
    try {
      await onMove(item.id, item.parentId ?? null, targetIndex)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      {isEditing ? (
        <ContentItemForm
          initialValues={item}
          onSubmit={handleSave}
          onCancel={() => setIsEditing(false)}
          submitLabel="Update Item"
        />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {item.title && <h3 className="text-lg font-semibold">{item.title}</h3>}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {item.role && <span>{item.role}</span>}
              {item.location && <span>{item.location}</span>}
              {(item.startDate || item.endDate) && (
                <span className="font-mono">
                  {item.startDate ?? "????"} &ndash; {item.endDate ?? "Present"}
                </span>
              )}
              {item.website && (
                <a className="text-primary underline" href={item.website} target="_blank" rel="noreferrer">
                  Website
                </a>
              )}
            </div>
            {item.description && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{item.description}</p>
            )}
            {item.skills && item.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {item.skills.map((skill) => (
                  <span
                    key={`${item.id}-${skill}`}
                    className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

  <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="default" onClick={() => setIsEditing(true)} disabled={isProcessing}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowChildForm((prev) => !prev)}
              disabled={isProcessing}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Child
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isProcessing}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleMove(-1)}
              disabled={!canMoveUp || isProcessing}
            >
              <ArrowUp className="mr-1 h-4 w-4" /> Up
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleMove(1)}
              disabled={!canMoveDown || isProcessing}
            >
              <ArrowDown className="mr-1 h-4 w-4" /> Down
            </Button>
          </div>
        </>
      )}

      {showChildForm && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <h4 className="mb-2 text-sm font-semibold">Add child item</h4>
          <ContentItemForm
            onSubmit={handleCreateChild}
            onCancel={() => setShowChildForm(false)}
            submitLabel="Create Child"
          />
        </div>
      )}

      {item.children && item.children.length > 0 && (
        <div className="space-y-3 border-l border-muted pl-4">
          {item.children.map((child, childIndex) => (
            <ContentItemCard
              key={child.id}
              item={child}
              siblings={item.children ?? []}
              index={childIndex}
              depth={depth + 1}
              onSave={onSave}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </div>
  )
}
