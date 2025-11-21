import { describe, expect, it } from "vitest"
import type { ContentItemNode } from "@shared/types"
import type { ContentItemFormValues } from "@/types/content-items"
import {
  countNodes,
  flattenContentItems,
  normalizeImportNodes,
  serializeForExport,
  sortNodesByOrder
} from "../content-items.helpers"

const baseNode: ContentItemNode = {
  id: "root",
  userId: "user-1",
  parentId: null,
  order: 5,
  title: "Root",
  visibility: "published",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  createdBy: "seed",
  updatedBy: "seed"
}

describe("content-items helpers", () => {
  it("sortNodesByOrder sorts recursively", () => {
    const tree: ContentItemNode[] = [
      {
        ...baseNode,
        id: "b",
        order: 2,
        children: [
          { ...baseNode, id: "b-2", parentId: "b", order: 5 },
          { ...baseNode, id: "b-1", parentId: "b", order: 1 }
        ]
      },
      { ...baseNode, id: "a", order: 1 }
    ]

    const sorted = sortNodesByOrder(tree)
    expect(sorted.map((node) => node.id)).toEqual(["a", "b"])
    expect(sorted[1].children?.map((node) => node.id)).toEqual(["b-1", "b-2"])
  })

  it("countNodes counts nested children", () => {
    const nodes: ContentItemNode[] = [
      { ...baseNode, id: "root-1", children: [{ ...baseNode, id: "child-1", parentId: "root-1" }] },
      { ...baseNode, id: "root-2" }
    ]
    expect(countNodes(nodes)).toBe(3)
  })

  it("flattenContentItems includes descendants depth-first", () => {
    const nodes: ContentItemNode[] = [
      {
        ...baseNode,
        id: "root-1",
        children: [
          { ...baseNode, id: "child-1", parentId: "root-1" },
          { ...baseNode, id: "child-2", parentId: "root-1" }
        ]
      }
    ]
    const flat = flattenContentItems(nodes)
    expect(flat.map((node) => node.id)).toEqual(expect.arrayContaining(["root-1", "child-1", "child-2"]))
  })

  it("serializeForExport trims empty fields and preserves children", () => {
    const nodes: ContentItemNode[] = [
      {
        ...baseNode,
        id: "root-1",
        order: 0,
        title: "Root",
        description: undefined,
        children: [{ ...baseNode, id: "child-1", parentId: "root-1", order: 1, title: null }]
      }
    ]
    const payload = serializeForExport(nodes)
    expect(payload[0]).toMatchObject({ id: "root-1", order: 0, title: "Root" })
    expect(payload[0].children?.[0]).toMatchObject({ id: "child-1", parentId: "root-1" })
    expect(payload[0].description).toBeUndefined()
  })

  it("normalizeImportNodes hydrates nested relationships and modern fields", () => {
    const legacyRecords = [
      {
        id: "parent",
        name: "Legacy Parent",
        order: 2,
        visibility: "published",
        createdAt: "2024-02-01T00:00:00.000Z"
      },
      {
        id: "child",
        parentId: "parent",
        heading: "Child Heading",
        role: "Engineer",
        order_index: 0,
        description: "Summary",
        accomplishments: ["Shipped feature", "Led team"],
        skills: "Node.js, React "
      }
    ]

    const normalized = normalizeImportNodes(legacyRecords)
    expect(normalized).toHaveLength(1)
    const [parent] = normalized
    expect(parent.legacyId).toBe("parent")
    expect(parent.children).toHaveLength(1)
    const child = parent.children[0]
    expect(child.values.title).toBe("Child Heading")
    expect(child.values.role).toBe("Engineer")
    expect(child.values.description).toMatch(/- Shipped feature/)
    expect(child.values.skills).toEqual(["Node.js", "React"])
    expect(child.order).toBe(0)
  })

  it("normalizeImportNodes falls back to generated ids and order", () => {
    const normalized = normalizeImportNodes([
      {
        description: "Standalone",
        points: ["Did a thing"],
        parentId: { nullValue: null }
      }
    ])

    expect(normalized[0].legacyId).toMatch(/import-/)
    expect(normalized[0].values.description).toContain("- Did a thing")
    expect(normalized[0].parentLegacyId).toBeNull()
  })

  it("normalizeImportNodes breaks parent/child cycles", () => {
    const normalized = normalizeImportNodes([
      { id: "cycle-a", parentId: "cycle-b", name: "A" },
      { id: "cycle-b", parentId: "cycle-a", name: "B" }
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0].legacyId).toBe("cycle-a")
    expect(normalized[0].children).toHaveLength(1)
    expect(normalized[0].children?.[0].children).toEqual([])
  })
})
