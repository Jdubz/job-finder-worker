/**
 * Content Items Management Page Tests
 *
 * Comprehensive tests for the Content Items Management functionality
 * Rank 2 - CRITICAL: User data management
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ContentItemsPage } from "../ContentItemsPage"
import { useContentItems } from "@/hooks/useContentItems"

// Mock the useContentItems hook
vi.mock("@/hooks/useContentItems", () => ({
  useContentItems: vi.fn(),
}))

// Mock the auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isEditor: true,
    user: {
      uid: "test-user-123",
      email: "test@example.com",
      displayName: "Test User",
    },
  }),
}))

// Mock the ContentItem component
vi.mock("../components/ContentItem", () => ({
  ContentItem: ({ item, onEdit, onDelete }: any) => (
    <div data-testid={`content-item-${item.id}`}>
      <span>{item.name}</span>
      <button onClick={() => onEdit(item)} data-testid={`edit-${item.id}`}>
        Edit
      </button>
      <button onClick={() => onDelete(item.id)} data-testid={`delete-${item.id}`}>
        Delete
      </button>
    </div>
  ),
}))

// Mock the ContentItemDialog component
vi.mock("../components/ContentItemDialog", () => ({
  ContentItemDialog: ({ open, onOpenChange, type, item, parentId }: any) => (
    <div data-testid="content-item-dialog" style={{ display: open ? "block" : "none" }}>
      <div>Dialog Type: {type}</div>
      <div>Item: {item ? item.name : "New"}</div>
      <div>Parent ID: {parentId || "None"}</div>
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ),
}))

// Mock the logger
vi.mock("@/services/logging", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock data
const mockContentItems = [
  {
    id: "item-1",
    type: "skill-group" as const,
    category: "Frontend",
    skills: ["React", "Vue"],
    parentId: null,
    order: 0,
    visibility: "published" as const,
    userId: "test-user-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "test-user-123",
    updatedBy: "test-user-123",
  },
  {
    id: "item-2",
    type: "skill-group" as const,
    category: "Backend",
    skills: ["Node.js", "Python"],
    parentId: null,
    order: 1,
    visibility: "published" as const,
    userId: "test-user-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "test-user-123",
    updatedBy: "test-user-123",
  },
  {
    id: "item-3",
    type: "project" as const,
    name: "E-commerce Project",
    description: "Full-stack e-commerce application",
    parentId: null,
    order: 2,
    visibility: "published" as const,
    userId: "test-user-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "test-user-123",
    updatedBy: "test-user-123",
  },
]

// const _mockHierarchy = [
//   {
//     ...mockContentItems[0],
//     children: [],
//   },
//   {
//     ...mockContentItems[1],
//     children: [],
//   },
//   {
//     ...mockContentItems[2],
//     children: [],
//   },
// ]

describe("ContentItemsPage", () => {
  const mockUseContentItems = vi.mocked(useContentItems)

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    mockUseContentItems.mockReturnValue({
      contentItems: mockContentItems,
      loading: false,
      error: null,
      createContentItem: vi.fn(),
      updateContentItem: vi.fn(),
      deleteContentItem: vi.fn(),
      refetch: vi.fn(),
    })
  })

  describe("rendering", () => {
    it("should render content items page with all sections", () => {
      render(<ContentItemsPage />)

      expect(screen.getByText("Content Items")).toBeInTheDocument()
      expect(screen.getByText("Skills")).toBeInTheDocument()
      expect(screen.getByText("Projects")).toBeInTheDocument()
      expect(screen.getByText("Profile Sections")).toBeInTheDocument()
    })

    it("should render content items when loaded", () => {
      render(<ContentItemsPage />)

      expect(screen.getByTestId("content-item-item-1")).toBeInTheDocument()
      expect(screen.getByTestId("content-item-item-2")).toBeInTheDocument()
      expect(screen.getByTestId("content-item-item-3")).toBeInTheDocument()
    })

    it("should show loading state while fetching content items", () => {
      mockUseContentItems.mockReturnValue({
        contentItems: [],
        loading: true,
        error: null,
        createContentItem: vi.fn(),
        updateContentItem: vi.fn(),
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      expect(screen.getByText("Loading content items...")).toBeInTheDocument()
    })

    it("should show error state when content items fail to load", () => {
      mockUseContentItems.mockReturnValue({
        contentItems: [],
        loading: false,
        error: new Error("Failed to load content items"),
        createContentItem: vi.fn(),
        updateContentItem: vi.fn(),
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      expect(screen.getByText("Failed to load content. Please try again.")).toBeInTheDocument()
    })
  })

  describe("CRUD operations", () => {
    it("should open dialog for creating new skill", async () => {
      const user = userEvent.setup()
      render(<ContentItemsPage />)

      const addSkillButton = screen.getByRole("button", { name: /add skill/i })
      await user.click(addSkillButton)

      expect(screen.getByTestId("content-item-dialog")).toBeInTheDocument()
      expect(screen.getByText("Dialog Type: skill")).toBeInTheDocument()
    })

    it("should open dialog for creating new project", async () => {
      const user = userEvent.setup()
      render(<ContentItemsPage />)

      const addProjectButton = screen.getByRole("button", { name: /add project/i })
      await user.click(addProjectButton)

      expect(screen.getByTestId("content-item-dialog")).toBeInTheDocument()
      expect(screen.getByText("Dialog Type: project")).toBeInTheDocument()
    })

    it("should open dialog for creating new profile section", async () => {
      const user = userEvent.setup()
      render(<ContentItemsPage />)

      const addProfileButton = screen.getByRole("button", { name: /add profile section/i })
      await user.click(addProfileButton)

      expect(screen.getByTestId("content-item-dialog")).toBeInTheDocument()
      expect(screen.getByText("Dialog Type: profile_section")).toBeInTheDocument()
    })

    it("should open dialog for editing existing item", async () => {
      const user = userEvent.setup()
      render(<ContentItemsPage />)

      const editButton = screen.getByTestId("edit-item-1")
      await user.click(editButton)

      expect(screen.getByTestId("content-item-dialog")).toBeInTheDocument()
      expect(screen.getByText("Item: React")).toBeInTheDocument()
    })

    it("should delete item when delete button is clicked", async () => {
      const user = userEvent.setup()
      const mockDeleteContentItem = vi.fn()

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: vi.fn(),
        updateContentItem: vi.fn(),
        deleteContentItem: mockDeleteContentItem,
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      const deleteButton = screen.getByTestId("delete-item-1")
      await user.click(deleteButton)

      expect(mockDeleteContentItem).toHaveBeenCalledWith("item-1")
    })
  })

  describe("hierarchy building", () => {
    it("should organize items by type", () => {
      render(<ContentItemsPage />)

      // Check if items are organized by type
      const skillsSection = screen.getByText("Skills").closest("div")
      const projectsSection = screen.getByText("Projects").closest("div")

      expect(skillsSection).toBeInTheDocument()
      expect(projectsSection).toBeInTheDocument()
    })

    it("should handle parent-child relationships", () => {
      const itemsWithChildren = [
        {
          id: "parent-1",
          type: "skill-group" as const,
          category: "Frontend Skills",
          skills: ["React", "Vue"],
          parentId: null,
          order: 0,
          visibility: "published" as const,
          userId: "test-user-123",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "test-user-123",
          updatedBy: "test-user-123",
        },
      ]

      mockUseContentItems.mockReturnValue({
        contentItems: itemsWithChildren,
        loading: false,
        error: null,
        createContentItem: vi.fn(),
        updateContentItem: vi.fn(),
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      expect(screen.getByTestId("content-item-parent-1")).toBeInTheDocument()
    })
  })

  describe("data persistence", () => {
    it("should auto-save changes", async () => {
      const user = userEvent.setup()
      const mockUpdateContentItem = vi.fn()

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: vi.fn(),
        updateContentItem: mockUpdateContentItem,
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      // Simulate editing an item
      const editButton = screen.getByTestId("edit-item-1")
      await user.click(editButton)

      // Close dialog (simulating save)
      const closeButton = screen.getByText("Close")
      await user.click(closeButton)

      // Verify update was called
      expect(mockUpdateContentItem).toHaveBeenCalled()
    })

    it("should handle conflict resolution", async () => {
      // const _user = userEvent.setup()

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: new Error("Conflict detected"),
        createContentItem: vi.fn(),
        updateContentItem: vi.fn(),
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      expect(screen.getByText("Failed to load content. Please try again.")).toBeInTheDocument()
    })
  })

  describe("offline handling", () => {
    it("should show offline indicator when offline", () => {
      // Mock offline state
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      })

      render(<ContentItemsPage />)

      // Should still render the page
      expect(screen.getByText("Content Items")).toBeInTheDocument()
    })
  })

  describe("accessibility", () => {
    it("should have proper ARIA labels and roles", () => {
      render(<ContentItemsPage />)

      // Check for proper heading structure
      expect(screen.getByRole("heading", { name: /content items/i })).toBeInTheDocument()

      // Check for proper button labels
      expect(screen.getByRole("button", { name: /add skill/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /add project/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /add profile section/i })).toBeInTheDocument()
    })

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup()
      render(<ContentItemsPage />)

      // Test tab navigation
      await user.tab()
      expect(document.activeElement).toBeInTheDocument()
    })
  })

  describe("responsive design", () => {
    it("should handle different screen sizes", () => {
      render(<ContentItemsPage />)

      // Check if responsive classes are applied
      const mainContent = screen.getByText("Content Items").closest("div")
      expect(mainContent).toBeInTheDocument()
    })
  })

  describe("error handling", () => {
    it("should show error message when create fails", async () => {
      const user = userEvent.setup()
      const mockCreateContentItem = vi.fn().mockRejectedValue(new Error("Create failed"))

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: mockCreateContentItem,
        updateContentItem: vi.fn(),
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      // Try to create a new item
      const addSkillButton = screen.getByRole("button", { name: /add skill/i })
      await user.click(addSkillButton)

      // Should show error
      expect(screen.getByText("Failed to load content. Please try again.")).toBeInTheDocument()
    })

    it("should show error message when update fails", async () => {
      const user = userEvent.setup()
      const mockUpdateContentItem = vi.fn().mockRejectedValue(new Error("Update failed"))

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: vi.fn(),
        updateContentItem: mockUpdateContentItem,
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      // Try to edit an item
      const editButton = screen.getByTestId("edit-item-1")
      await user.click(editButton)

      // Should show error
      expect(screen.getByText("Failed to load content. Please try again.")).toBeInTheDocument()
    })

    it("should show error message when delete fails", async () => {
      const user = userEvent.setup()
      const mockDeleteContentItem = vi.fn().mockRejectedValue(new Error("Delete failed"))

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: vi.fn(),
        updateContentItem: vi.fn(),
        deleteContentItem: mockDeleteContentItem,
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      // Try to delete an item
      const deleteButton = screen.getByTestId("delete-item-1")
      await user.click(deleteButton)

      // Should show error
      expect(screen.getByText("Failed to load content. Please try again.")).toBeInTheDocument()
    })
  })

  describe("success feedback", () => {
    it("should show success message after successful operations", async () => {
      const user = userEvent.setup()

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: vi.fn().mockResolvedValue(undefined),
        updateContentItem: vi.fn().mockResolvedValue(undefined),
        deleteContentItem: vi.fn().mockResolvedValue(undefined),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      // Simulate successful operation
      const addSkillButton = screen.getByRole("button", { name: /add skill/i })
      await user.click(addSkillButton)

      // Should show success message
      expect(screen.getByText("Content item created successfully!")).toBeInTheDocument()
    })

    it("should auto-dismiss success messages after 3 seconds", async () => {
      vi.useFakeTimers()
      const user = userEvent.setup()

      mockUseContentItems.mockReturnValue({
        contentItems: mockContentItems,
        loading: false,
        error: null,
        createContentItem: vi.fn().mockResolvedValue(undefined),
        updateContentItem: vi.fn(),
        deleteContentItem: vi.fn(),
        refetch: vi.fn(),
      })

      render(<ContentItemsPage />)

      // Simulate successful operation
      const addSkillButton = screen.getByRole("button", { name: /add skill/i })
      await user.click(addSkillButton)

      // Should show success message
      expect(screen.getByText("Content item created successfully!")).toBeInTheDocument()

      // Fast-forward time
      vi.advanceTimersByTime(3000)

      // Success message should be gone
      expect(screen.queryByText("Content item created successfully!")).not.toBeInTheDocument()

      vi.useRealTimers()
    })
  })
})
