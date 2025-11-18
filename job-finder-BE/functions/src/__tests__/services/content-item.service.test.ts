import { describe, it, expect, beforeEach } from "@jest/globals"
import { ContentItemService } from "../../services/content-item.service"
import { Timestamp } from "@google-cloud/firestore"
import type { CreateContentItemData, UpdateContentItemData } from "../../types/content-item.types"

// Create mock Firestore instance
const mockFirestore: any = {
  collection: jest.fn(),
}

// Mock the firestore config
jest.mock("../../config/firestore", () => ({
  createFirestoreInstance: jest.fn(() => mockFirestore),
}))

jest.mock("../../utils/logger", () => ({
  createDefaultLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
  },
}))

describe("ContentItemService", () => {
  let service: ContentItemService
  let mockCollection: any
  let mockDoc: any
  let mockQuery: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockDoc = {
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      set: jest.fn(),
    }

    mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
    }

    mockCollection = {
      doc: jest.fn().mockReturnValue(mockDoc),
      add: jest.fn(),
      where: jest.fn().mockReturnValue(mockQuery),
      orderBy: jest.fn().mockReturnValue(mockQuery),
      get: jest.fn(),
    }

    mockFirestore.collection.mockReturnValue(mockCollection)

    service = new ContentItemService()
  })

  describe("getItem", () => {
    it("should return a content item by id", async () => {
      const mockItem = {
        type: "skill",
        title: "JavaScript",
        order: 1,
        visibility: "published",
        parentId: null,
      }

      mockDoc.get.mockResolvedValue({
        exists: true,
        id: "item-123",
        data: () => mockItem,
      })

      const result = await service.getItem("item-123")

      expect(result).toEqual({
        id: "item-123",
        ...mockItem,
      })
      expect(mockCollection.doc).toHaveBeenCalledWith("item-123")
    })

    it("should return null when item does not exist", async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
      })

      const result = await service.getItem("nonexistent")

      expect(result).toBeNull()
    })

    it("should throw error on database failure", async () => {
      mockDoc.get.mockRejectedValue(new Error("Database error"))

      await expect(service.getItem("item-123")).rejects.toThrow("Database error")
    })
  })

  describe("createItem", () => {
    it("should create a new content item", async () => {
      const newItem: CreateContentItemData = {
        type: "skill-group",
        category: "Programming",
        skills: ["TypeScript", "React", "Node.js"],
        order: 1,
        visibility: "published",
        parentId: null,
      }

      const mockDocRef = { id: "new-item-123" }
      mockCollection.add.mockResolvedValue(mockDocRef)

      const result = await service.createItem(newItem, "user@example.com")

      expect(result.id).toBe("new-item-123")
      if (result.type === "skill-group") {
        expect(result.category).toBe("Programming")
      }
      expect(result.createdBy).toBe("user@example.com")
      expect(result.updatedBy).toBe("user@example.com")
      expect(result.createdAt).toBeInstanceOf(Timestamp)
      expect(result.updatedAt).toBeInstanceOf(Timestamp)

      expect(mockCollection.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "skill-group",
          category: "Programming",
          createdBy: "user@example.com",
          updatedBy: "user@example.com",
        })
      )
    })

    it("should set default visibility to published", async () => {
      const newItem: CreateContentItemData = {
        type: "skill-group",
        category: "Backend",
        skills: ["Python", "Django", "PostgreSQL"],
        order: 1,
        parentId: null,
      }

      mockCollection.add.mockResolvedValue({ id: "new-item-456" })

      const result = await service.createItem(newItem, "user@example.com")

      expect(result.visibility).toBe("published")
    })

    it("should handle parentId correctly", async () => {
      const newItem: CreateContentItemData = {
        type: "accomplishment",
        description: "Increased team productivity by 40%",
        order: 1,
        parentId: "parent-123",
      }

      mockCollection.add.mockResolvedValue({ id: "new-item-789" })

      const result = await service.createItem(newItem, "user@example.com")

      expect(result.parentId).toBe("parent-123")
    })
  })

  describe("updateItem", () => {
    it("should update an existing content item", async () => {
      const existingItem = {
        type: "timeline-event",
        title: "JavaScript Basics",
        date: "2023-01",
        description: "Learning fundamentals",
        order: 1,
        visibility: "published",
      }

      mockDoc.get
        .mockResolvedValueOnce({
          exists: true,
          id: "item-123",
          data: () => existingItem,
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "item-123",
          data: () => ({
            ...existingItem,
            title: "Advanced JavaScript",
            updatedBy: "user@example.com",
          }),
        })

      const updates: UpdateContentItemData = {
        title: "Advanced JavaScript",
      }

      const result = await service.updateItem("item-123", updates, "user@example.com")

      if (result.type === "timeline-event") {
        expect(result.title).toBe("Advanced JavaScript")
      }
      expect(result.updatedBy).toBe("user@example.com")
      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Advanced JavaScript",
          updatedBy: "user@example.com",
        })
      )
    })

    it("should throw error when item does not exist", async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
      })

      await expect(service.updateItem("nonexistent", {}, "user@example.com")).rejects.toThrow(
        "Content item not found"
      )
    })

    it("should filter out undefined values", async () => {
      mockDoc.get
        .mockResolvedValueOnce({
          exists: true,
          id: "item-123",
          data: () => ({ title: "Test" }),
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "item-123",
          data: () => ({ title: "Test" }),
        })

      const updates: UpdateContentItemData = {
        title: "New Title",
        description: undefined,
      }

      await service.updateItem("item-123", updates, "user@example.com")

      const updateCall = mockDoc.update.mock.calls[0][0]
      expect(updateCall.title).toBe("New Title")
      expect("description" in updateCall).toBe(false)
    })
  })

  describe("deleteItem", () => {
    it("should delete an existing content item", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        id: "item-123",
        data: () => ({ title: "Test" }),
      })

      await service.deleteItem("item-123")

      expect(mockDoc.delete).toHaveBeenCalled()
    })

    it("should throw error when item does not exist", async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
      })

      await expect(service.deleteItem("nonexistent")).rejects.toThrow("Content item not found")
    })
  })

  describe("listItems", () => {
    it("should list all items with no filters", async () => {
      const mockItems = [
        { id: "1", title: "Event 1", type: "timeline-event", date: "2023-01", description: "First event" },
        { id: "2", title: "Event 2", type: "timeline-event", date: "2023-02", description: "Second event" },
      ]

      mockQuery.get.mockResolvedValue({
        docs: mockItems.map((item) => ({
          id: item.id,
          data: () => item,
        })),
      })

      const result = await service.listItems()

      expect(result).toHaveLength(2)
      if (result[0].type === "timeline-event") {
        expect(result[0].title).toBe("Event 1")
      }
      if (result[1].type === "timeline-event") {
        expect(result[1].title).toBe("Event 2")
      }
    })

    it("should filter items by type", async () => {
      mockQuery.get.mockResolvedValue({
        docs: [
          {
            id: "1",
            data: () => ({ category: "Programming", type: "skill-group", skills: ["TypeScript"] }),
          },
        ],
      })

      const result = await service.listItems({ type: "skill-group" })

      expect(result).toHaveLength(1)
      expect(mockQuery.where).toHaveBeenCalledWith("type", "==", "skill-group")
    })

    it("should filter items by parentId", async () => {
      mockQuery.get.mockResolvedValue({
        docs: [
          {
            id: "1",
            data: () => ({ title: "Child", parentId: "parent-123" }),
          },
        ],
      })

      const result = await service.listItems({ parentId: "parent-123" })

      expect(result).toHaveLength(1)
      expect(mockQuery.where).toHaveBeenCalledWith("parentId", "==", "parent-123")
    })

    it("should limit results", async () => {
      mockQuery.get.mockResolvedValue({
        docs: [
          { id: "1", data: () => ({ title: "Item 1" }) },
          { id: "2", data: () => ({ title: "Item 2" }) },
        ],
      })

      await service.listItems({ limit: 2 })

      expect(mockQuery.limit).toHaveBeenCalledWith(2)
    })
  })

  describe("getRootItems", () => {
    it("should get items with no parent", async () => {
      mockQuery.get.mockResolvedValue({
        docs: [
          {
            id: "1",
            data: () => ({ title: "Root Item", parentId: null }),
          },
        ],
      })

      const result = await service.getRootItems()

      expect(result).toHaveLength(1)
      expect(mockQuery.where).toHaveBeenCalledWith("parentId", "==", null)
    })
  })

  describe("getChildren", () => {
    it("should get children of a parent item", async () => {
      mockQuery.get.mockResolvedValue({
        docs: [
          {
            id: "1",
            data: () => ({ title: "Child", parentId: "parent-123" }),
          },
        ],
      })

      const result = await service.getChildren("parent-123")

      expect(result).toHaveLength(1)
      expect(mockQuery.where).toHaveBeenCalledWith("parentId", "==", "parent-123")
    })
  })
})
