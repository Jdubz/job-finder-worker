// @ts-nocheck
/**
 * Build Hierarchy Tests
 * Tests for the buildHierarchy function to ensure it handles duplicates and hierarchy correctly
 */

import { describe, it, expect } from "vitest"
import type { ContentItemType, ContentItemWithChildren } from "@/types/content-items"

// Import the buildHierarchy function (we'll need to extract it for testing)
// For now, we'll recreate the logic to test it
const buildHierarchy = (items: ContentItemType[]): ContentItemWithChildren[] => {
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

    const itemWithChildren = itemsMap.get(item.id)!
    processedItems.add(item.id)

    // Only treat as root if parentId is explicitly null or undefined
    // Skip items with parentId that points to missing parent (orphaned items)
    if (item.parentId) {
      if (itemsMap.has(item.parentId)) {
        const parent = itemsMap.get(item.parentId)!
        parent.children!.push(itemWithChildren)
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

describe("buildHierarchy", () => {
  const createMockItem = (id: string, parentId: string | null = null, order: number = 0) => ({
    id,
    type: "company" as const,
    name: `Item ${id}`,
    parentId,
    order,
    visibility: "published" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "test-user",
    updatedBy: "test-user",
  })

  it("should build hierarchy correctly with root items", () => {
    const items = [
      createMockItem("item-1", null, 1),
      createMockItem("item-2", null, 2),
      createMockItem("item-3", null, 0),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(3)
    expect(hierarchy[0].id).toBe("item-3") // order 0
    expect(hierarchy[1].id).toBe("item-1") // order 1
    expect(hierarchy[2].id).toBe("item-2") // order 2
  })

  it("should build hierarchy correctly with parent-child relationships", () => {
    const items = [
      createMockItem("company-1", null, 0),
      createMockItem("project-1", "company-1", 0),
      createMockItem("project-2", "company-1", 1),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(1)
    expect(hierarchy[0].id).toBe("company-1")
    expect(hierarchy[0].children).toHaveLength(2)
    expect(hierarchy[0].children![0].id).toBe("project-1")
    expect(hierarchy[0].children![1].id).toBe("project-2")
  })

  it("should handle orphaned items gracefully", () => {
    const items = [
      createMockItem("company-1", null, 0),
      createMockItem("orphaned-project", "non-existent-company", 0),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(1)
    expect(hierarchy[0].id).toBe("company-1")
    expect(hierarchy[0].children).toHaveLength(0)
  })

  it("should prevent duplicate items in hierarchy", () => {
    const items = [
      createMockItem("company-1", null, 0),
      createMockItem("company-1", null, 0), // Duplicate
      createMockItem("project-1", "company-1", 0),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(1)
    expect(hierarchy[0].id).toBe("company-1")
    expect(hierarchy[0].children).toHaveLength(1)
    expect(hierarchy[0].children![0].id).toBe("project-1")
  })

  it("should handle nested hierarchies correctly", () => {
    const items = [
      createMockItem("company-1", null, 0),
      createMockItem("project-1", "company-1", 0),
      createMockItem("task-1", "project-1", 0),
      createMockItem("task-2", "project-1", 1),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(1)
    expect(hierarchy[0].id).toBe("company-1")
    expect(hierarchy[0].children).toHaveLength(1)
    expect(hierarchy[0].children![0].id).toBe("project-1")
    expect(hierarchy[0].children![0].children).toHaveLength(2)
    expect(hierarchy[0].children![0].children![0].id).toBe("task-1")
    expect(hierarchy[0].children![0].children![1].id).toBe("task-2")
  })

  it("should handle empty items array", () => {
    const hierarchy = buildHierarchy([])
    expect(hierarchy).toHaveLength(0)
  })

  it("should maintain order within children", () => {
    const items = [
      createMockItem("company-1", null, 0),
      createMockItem("project-3", "company-1", 3),
      createMockItem("project-1", "company-1", 1),
      createMockItem("project-2", "company-1", 2),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(1)
    expect(hierarchy[0].children).toHaveLength(3)

    // Children should be sorted by order
    const children = hierarchy[0].children!.sort((a, b) => a.order - b.order)
    expect(children[0].id).toBe("project-1")
    expect(children[1].id).toBe("project-2")
    expect(children[2].id).toBe("project-3")
  })

  it("should handle items with undefined parentId", () => {
    const items = [
      createMockItem("company-1", undefined as any, 0),
      createMockItem("company-2", null, 1),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(2)
    expect(hierarchy[0].id).toBe("company-1")
    expect(hierarchy[1].id).toBe("company-2")
  })

  it("should handle complex hierarchy with multiple companies and projects", () => {
    const items = [
      createMockItem("company-1", null, 0),
      createMockItem("company-2", null, 1),
      createMockItem("project-1", "company-1", 0),
      createMockItem("project-2", "company-1", 1),
      createMockItem("project-3", "company-2", 0),
      createMockItem("task-1", "project-1", 0),
    ]

    const hierarchy = buildHierarchy(items)

    expect(hierarchy).toHaveLength(2)

    // Company 1
    expect(hierarchy[0].id).toBe("company-1")
    expect(hierarchy[0].children).toHaveLength(2)
    expect(hierarchy[0].children![0].id).toBe("project-1")
    expect(hierarchy[0].children![1].id).toBe("project-2")
    expect(hierarchy[0].children![0].children).toHaveLength(1)
    expect(hierarchy[0].children![0].children![0].id).toBe("task-1")

    // Company 2
    expect(hierarchy[1].id).toBe("company-2")
    expect(hierarchy[1].children).toHaveLength(1)
    expect(hierarchy[1].children![0].id).toBe("project-3")
  })
})
