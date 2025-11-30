import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ContentItemNode } from "@shared/types"
import type { ContentItemFormValues } from "@/types/content-items"
import { AI_CONTEXT_OPTIONS } from "@/types/content-items"
import { ContentItemForm } from "./ContentItemForm"
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { cn } from "@/lib/utils"

type MarkdownCodeProps = React.ComponentPropsWithoutRef<"code"> & {
  inline?: boolean
}

interface ContentItemCardProps {
  item: ContentItemNode
  siblings: ContentItemNode[]
  index: number
  depth?: number
  canEdit?: boolean
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
  canEdit = false,
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
    <div
      className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"
      data-testid={`content-item-${item.id}`}
      data-depth={depth}
    >
      {isProcessing && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid={`content-item-${item.id}-spinner`}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Working…</span>
        </div>
      )}
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
            <div className="flex items-center gap-2">
              {item.title && <h3 className="text-lg font-semibold">{item.title}</h3>}
              {item.aiContext && (
                <Badge variant="outline" className="text-xs">
                  {AI_CONTEXT_OPTIONS.find((o) => o.value === item.aiContext)?.label ?? item.aiContext}
                </Badge>
              )}
            </div>
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
            {item.description && <Markdown text={item.description} />}
            {item.skills && item.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {item.skills.map((skill, idx) => (
                  <span
                    key={`${item.id}-skill-${idx}`}
                    className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={() => setIsEditing(true)} disabled={isProcessing}>
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
          )}
        </>
      )}

      {canEdit && showChildForm && (
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
              canEdit={canEdit}
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

function Markdown({ text }: { text: string }) {
  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed text-muted-foreground",
        "[&_a]:text-primary [&_a]:underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5",
        "[&_strong]:text-foreground",
        "[&_p]:my-0 [&_ul]:my-0 [&_ol]:my-0",
        "[&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base",
        "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold",
        "[&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-2",
        "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          code: ({ inline, className, children, ...props }: MarkdownCodeProps) =>
            inline ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
