import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Plus, RefreshCcw } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useContentItems } from "@/hooks/useContentItems"
import { ContentItemForm } from "./components/ContentItemForm"
import { ContentItemCard } from "./components/ContentItemCard"
import type { ContentItemFormValues } from "@/types/content-items"

export function ContentItemsPage() {
  const { user } = useAuth()
  const {
    contentItems,
    loading,
    error,
    createContentItem,
    updateContentItem,
    deleteContentItem,
    reorderContentItem,
    refetch
  } = useContentItems()

  const [showRootForm, setShowRootForm] = useState(false)
  const handleCreateRoot = async (values: ContentItemFormValues) => {
    if (!user?.id) throw new Error("User must be authenticated")
    await createContentItem({
      ...values,
      userId: user.id,
      parentId: null
    })
    setShowRootForm(false)
  }

  const handleCreateChild = async (parentId: string, values: ContentItemFormValues) => {
    if (!user?.id) throw new Error("User must be authenticated")
    await createContentItem({
      ...values,
      userId: user.id,
      parentId
    })
  }

  const handleSaveItem = async (id: string, values: ContentItemFormValues) => {
    await updateContentItem(id, values)
  }

  const handleDeleteItem = async (id: string) => {
    await deleteContentItem(id)
  }

  const handleReorder = async (id: string, parentId: string | null, newIndex: number) => {
    await reorderContentItem(id, parentId, newIndex)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Content Items</h1>
          <p className="text-sm text-muted-foreground">
            Maintain a nested resume/portfolio structure. Render only the fields that matter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowRootForm((prev) => !prev)}>
            <Plus className="mr-2 h-4 w-4" />
            {showRootForm ? "Hide Root Form" : "Add Root Item"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {showRootForm && (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">New root item</h2>
          <ContentItemForm
            onSubmit={handleCreateRoot}
            onCancel={() => setShowRootForm(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading content…
        </div>
      ) : contentItems.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No content items found. Start by creating a root entry.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {contentItems.map((item, index) => (
            <ContentItemCard
              key={item.id}
              item={item}
              siblings={contentItems}
              index={index}
              onSave={handleSaveItem}
              onDelete={handleDeleteItem}
              onCreateChild={handleCreateChild}
              onMove={handleReorder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
