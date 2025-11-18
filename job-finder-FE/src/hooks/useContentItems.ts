/**
 * Content Items Hook
 *
 * Hook for managing content items with type safety
 */

import { useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useFirestore } from "@/contexts/FirestoreContext"
import { useFirestoreCollection } from "./useFirestoreCollection"
import type { ContentItemDocument, DocumentWithId } from "@/services/firestore/types"

interface UseContentItemsResult {
  contentItems: DocumentWithId<ContentItemDocument>[]
  loading: boolean
  error: Error | null
  createContentItem: (
    data: Omit<
      ContentItemDocument,
      "id" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
    >
  ) => Promise<string>
  updateContentItem: (id: string, data: Partial<ContentItemDocument>) => Promise<void>
  deleteContentItem: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

/**
 * Hook to manage content items for all users (editors see everything)
 */
export function useContentItems(): UseContentItemsResult {
  const { user } = useAuth()
  const { service } = useFirestore()

  // Subscribe to ALL content items (no userId filter - editors see everything)
  const {
    data: contentItems,
    loading,
    error,
    refetch,
  } = useFirestoreCollection({
    collectionName: "content-items",
    constraints: user?.uid
      ? {
          orderBy: [{ field: "order", direction: "asc" }],
        }
      : undefined,
    enabled: !!user?.uid,
  })

  /**
   * Create a new content item
   */
  const createContentItem = useCallback(
    async (
      data: Omit<
        ContentItemDocument,
        "id" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
      >
    ) => {
      if (!user?.uid) {
        throw new Error("User must be authenticated to create content items")
      }

      const itemData: Omit<ContentItemDocument, "id" | "createdAt" | "updatedAt"> = {
        ...data,
        userId: user.uid, // For querying/filtering (matches existing indexes)
        createdBy: user.uid, // For audit trail
        updatedBy: user.uid,
      }

      return service.createDocument("content-items", itemData)
    },
    [service, user?.uid]
  )

  /**
   * Update an existing content item
   */
  const updateContentItem = useCallback(
    async (id: string, data: Partial<ContentItemDocument>) => {
      if (!user?.uid) {
        throw new Error("User must be authenticated to update content items")
      }

      const updateData = {
        ...data,
        updatedBy: user.uid,
      }

      await service.updateDocument("content-items", id, updateData)
    },
    [service, user?.uid]
  )

  /**
   * Delete a content item
   */
  const deleteContentItem = useCallback(
    async (id: string) => {
      await service.deleteDocument("content-items", id)
    },
    [service]
  )

  return {
    contentItems,
    loading,
    error,
    createContentItem,
    updateContentItem,
    deleteContentItem,
    refetch,
  }
}
