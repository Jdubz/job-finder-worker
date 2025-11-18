import { Firestore, Timestamp, Query } from "@google-cloud/firestore"
import { CONTENT_ITEMS_COLLECTION } from "../config/database"
import { createFirestoreInstance } from "../config/firestore"
import { createDefaultLogger } from "../utils/logger"
import type { SimpleLogger } from "../types/logger.types"
import type {
  ContentItem,
  ContentItemType,
  CreateContentItemData,
  UpdateContentItemData,
  ListContentItemsOptions,
  ContentItemVisibility,
} from "../types/content-item.types"

const COLLECTION_NAME = CONTENT_ITEMS_COLLECTION

export class ContentItemService {
  private db: Firestore
  private logger: SimpleLogger
  private collectionName = COLLECTION_NAME

  constructor(logger?: SimpleLogger) {
    // Use shared Firestore factory for consistent configuration
    this.db = createFirestoreInstance()

    // Use shared logger factory
    this.logger = logger || createDefaultLogger()
  }

  /**
   * List content items with optional filters
   */
  async listItems(options?: ListContentItemsOptions): Promise<ContentItem[]> {
    try {
      let query = this.db.collection(this.collectionName).orderBy("order", "asc")

      // Apply filters
      if (options?.type) {
        query = query.where("type", "==", options.type) as Query
      }

      if (options?.parentId !== undefined) {
        query = query.where("parentId", "==", options.parentId) as Query
      }

      if (options?.visibility) {
        query = query.where("visibility", "==", options.visibility) as Query
      }

      // Tag filter (array-contains, only supports single tag)
      if (options?.tags && options.tags.length > 0) {
        query = query.where("tags", "array-contains", options.tags[0]) as Query
      }

      // Pagination
      if (options?.offset) {
        // Note: Firestore doesn't support offset directly, need to use startAfter with a doc
        // For now, we'll fetch all and slice client-side
        // TODO: Implement proper cursor-based pagination
      }

      if (options?.limit) {
        query = query.limit(options.limit) as Query
      }

      const snapshot = await query.get()

      let items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<ContentItem, "id">),
      })) as ContentItem[]

      // Apply client-side offset if needed
      if (options?.offset) {
        items = items.slice(options.offset)
      }

      this.logger.info("Retrieved content items", {
        count: items.length,
        filters: options,
      })

      return items
    } catch (error) {
      this.logger.error("Failed to list content items", { error, options })
      throw error
    }
  }

  /**
   * Get a single content item by ID
   */
  async getItem(id: string): Promise<ContentItem | null> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(id)
      const doc = await docRef.get()

      if (!doc.exists) {
        this.logger.info("Content item not found", { id })
        return null
      }

      const item = {
        id: doc.id,
        ...(doc.data() as Omit<ContentItem, "id">),
      } as ContentItem

      this.logger.info("Retrieved content item", { id, type: item.type })
      return item
    } catch (error) {
      this.logger.error("Failed to get content item", { error, id })
      throw error
    }
  }

  /**
   * Get all children of a parent item
   */
  async getChildren(parentId: string): Promise<ContentItem[]> {
    return this.listItems({ parentId })
  }

  /**
   * Get all root-level items (no parent)
   */
  async getRootItems(): Promise<ContentItem[]> {
    return this.listItems({ parentId: null })
  }

  /**
   * Create a new content item
   */
  async createItem(data: CreateContentItemData, userEmail: string): Promise<ContentItem> {
    try {
      const now = Timestamp.now()

      // Build item object
      const item: Record<string, unknown> = {
        ...data,
        createdAt: now,
        updatedAt: now,
        createdBy: userEmail,
        updatedBy: userEmail,
      }

      // Ensure parentId is present (null for root items)
      if (item.parentId === undefined) {
        item.parentId = null
      }

      // Set default visibility if not provided
      if (!item.visibility) {
        item.visibility = "published"
      }

      const docRef = await this.db.collection(this.collectionName).add(item)

      const createdItem: ContentItem = {
        id: docRef.id,
        ...(item as Omit<ContentItem, "id">),
      } as ContentItem

      this.logger.info("Created content item", {
        id: docRef.id,
        type: data.type,
        parentId: data.parentId,
        createdBy: userEmail,
      })

      return createdItem
    } catch (error) {
      this.logger.error("Failed to create content item", {
        error,
        data,
        userEmail,
      })
      throw error
    }
  }

  /**
   * Update an existing content item
   */
  async updateItem(id: string, data: UpdateContentItemData, userEmail: string): Promise<ContentItem> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(id)
      const doc = await docRef.get()

      if (!doc.exists) {
        throw new Error(`Content item not found: ${id}`)
      }

      // Build updates object
      const updates: Record<string, unknown> = {
        ...data,
        updatedAt: Timestamp.now(),
        updatedBy: userEmail,
      }

      // Remove undefined values (Firestore doesn't accept them)
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined) {
          delete updates[key]
        }
      })

      await docRef.update(updates)

      // Fetch updated document
      const updatedDoc = await docRef.get()
      const updatedItem: ContentItem = {
        id: updatedDoc.id,
        ...(updatedDoc.data() as Omit<ContentItem, "id">),
      } as ContentItem

      this.logger.info("Updated content item", {
        id,
        type: updatedItem.type,
        updatedBy: userEmail,
        fieldsUpdated: Object.keys(updates).filter((k) => k !== "updatedAt" && k !== "updatedBy"),
      })

      return updatedItem
    } catch (error) {
      this.logger.error("Failed to update content item", {
        error,
        id,
        data,
        userEmail,
      })
      throw error
    }
  }

  /**
   * Delete a content item
   * Note: This does NOT cascade delete children. Use deleteWithChildren for that.
   */
  async deleteItem(id: string): Promise<void> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(id)
      const doc = await docRef.get()

      if (!doc.exists) {
        throw new Error(`Content item not found: ${id}`)
      }

      await docRef.delete()

      this.logger.info("Deleted content item", { id })
    } catch (error) {
      this.logger.error("Failed to delete content item", {
        error,
        id,
      })
      throw error
    }
  }

  /**
   * Delete a content item and all its children recursively
   */
  async deleteWithChildren(id: string): Promise<number> {
    try {
      let deletedCount = 0

      // Get all children first
      const children = await this.getChildren(id)

      // Recursively delete children
      for (const child of children) {
        deletedCount += await this.deleteWithChildren(child.id)
      }

      // Delete the item itself
      await this.deleteItem(id)
      deletedCount += 1

      this.logger.info("Deleted content item with children", { id, deletedCount })

      return deletedCount
    } catch (error) {
      this.logger.error("Failed to delete content item with children", {
        error,
        id,
      })
      throw error
    }
  }

  /**
   * Reorder items by updating their order field
   * Takes an array of { id, order } tuples
   */
  async reorderItems(items: Array<{ id: string; order: number }>, userEmail: string): Promise<void> {
    try {
      const batch = this.db.batch()
      const now = Timestamp.now()

      for (const item of items) {
        const docRef = this.db.collection(this.collectionName).doc(item.id)
        batch.update(docRef, {
          order: item.order,
          updatedAt: now,
          updatedBy: userEmail,
        })
      }

      await batch.commit()

      this.logger.info("Reordered content items", {
        count: items.length,
        updatedBy: userEmail,
      })
    } catch (error) {
      this.logger.error("Failed to reorder content items", {
        error,
        items,
        userEmail,
      })
      throw error
    }
  }

  /**
   * Change visibility of a content item
   */
  async setVisibility(id: string, visibility: ContentItemVisibility, userEmail: string): Promise<ContentItem> {
    return this.updateItem(id, { visibility }, userEmail)
  }

  /**
   * Get items by type
   */
  async getItemsByType(type: ContentItemType): Promise<ContentItem[]> {
    return this.listItems({ type })
  }

  /**
   * Get the full hierarchy tree starting from root items
   * Returns items with a children property
   */
  async getHierarchy(): Promise<Array<ContentItem & { children?: ContentItem[] }>> {
    try {
      // Get all items
      const allItems = await this.listItems()

      // Build a map for quick lookup
      const itemMap = new Map<string, ContentItem & { children?: ContentItem[] }>()
      allItems.forEach((item) => {
        itemMap.set(item.id, { ...item, children: [] })
      })

      // Build hierarchy
      const rootItems: Array<ContentItem & { children?: ContentItem[] }> = []

      allItems.forEach((item) => {
        const itemWithChildren = itemMap.get(item.id)!

        if (item.parentId === null) {
          // Root item
          rootItems.push(itemWithChildren)
        } else {
          // Child item - add to parent's children array
          const parent = itemMap.get(item.parentId)
          if (parent) {
            if (!parent.children) {
              parent.children = []
            }
            parent.children.push(itemWithChildren)
          }
        }
      })

      this.logger.info("Retrieved content item hierarchy", {
        totalItems: allItems.length,
        rootItems: rootItems.length,
      })

      return rootItems
    } catch (error) {
      this.logger.error("Failed to get content item hierarchy", { error })
      throw error
    }
  }
}
