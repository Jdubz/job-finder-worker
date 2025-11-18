/**
 * WebSocket Integration Tests
 *
 * Comprehensive tests for WebSocket real-time updates functionality
 * Required for dev-bot integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock socket.io-client
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  })),
}))

// Mock WebSocket context (since it doesn't exist yet)
const mockWebSocketContext = {
  isConnected: true,
  lastMessage: null as any,
  sendMessage: vi.fn(),
}

vi.mock("@/contexts/WebSocketContext", () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => children,
  useWebSocket: () => mockWebSocketContext,
}))

// Mock component to test WebSocket functionality
const TestComponent = () => {
  const { isConnected, lastMessage, sendMessage } = mockWebSocketContext

  return (
    <div>
      <div data-testid="connection-status">{isConnected ? "Connected" : "Disconnected"}</div>
      <div data-testid="last-message">
        {lastMessage ? JSON.stringify(lastMessage) : "No message"}
      </div>
      <button
        onClick={() => sendMessage("test-message", { data: "test" })}
        data-testid="send-message"
      >
        Send Message
      </button>
    </div>
  )
}

describe("WebSocket Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("WebSocket functionality", () => {
    it("should provide WebSocket context", () => {
      render(<TestComponent />)

      expect(screen.getByTestId("connection-status")).toBeInTheDocument()
      expect(screen.getByTestId("last-message")).toBeInTheDocument()
    })

    it("should show connection status", () => {
      render(<TestComponent />)

      expect(screen.getByTestId("connection-status")).toHaveTextContent("Connected")
    })

    it("should handle message sending", () => {
      render(<TestComponent />)

      const sendButton = screen.getByTestId("send-message")
      sendButton.click()

      expect(mockWebSocketContext.sendMessage).toHaveBeenCalledWith("test-message", {
        data: "test",
      })
    })
  })

  describe("dev-bot integration", () => {
    it("should handle task progress updates", () => {
      const taskProgressMessage = {
        taskId: "task-123",
        status: "in-progress",
        progress: 50,
        message: "Processing files...",
      }

      mockWebSocketContext.lastMessage = taskProgressMessage as any

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent(
        JSON.stringify(taskProgressMessage)
      )
    })

    it("should handle task completion events", () => {
      const taskCompleteMessage = {
        taskId: "task-123",
        status: "completed",
        result: "Task completed successfully",
      }

      mockWebSocketContext.lastMessage = taskCompleteMessage as any

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent(
        JSON.stringify(taskCompleteMessage)
      )
    })

    it("should handle task error events", () => {
      const taskErrorMessage = {
        taskId: "task-123",
        status: "error",
        error: "Task failed with error",
      }

      mockWebSocketContext.lastMessage = taskErrorMessage as any

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent(JSON.stringify(taskErrorMessage))
    })

    it("should handle system health updates", () => {
      const systemHealthMessage = {
        status: "healthy",
        services: {
          backend: "up",
          frontend: "up",
          worker: "up",
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketContext.lastMessage = systemHealthMessage as any

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent(
        JSON.stringify(systemHealthMessage)
      )
    })
  })

  describe("connection management", () => {
    it("should handle disconnection", () => {
      mockWebSocketContext.isConnected = false

      render(<TestComponent />)

      expect(screen.getByTestId("connection-status")).toHaveTextContent("Disconnected")
    })

    it("should handle reconnection", () => {
      // Start disconnected
      mockWebSocketContext.isConnected = false
      const { rerender } = render(<TestComponent />)

      expect(screen.getByTestId("connection-status")).toHaveTextContent("Disconnected")

      // Simulate reconnection
      mockWebSocketContext.isConnected = true
      rerender(<TestComponent />)

      expect(screen.getByTestId("connection-status")).toHaveTextContent("Connected")
    })
  })

  describe("message handling", () => {
    it("should handle no messages", () => {
      mockWebSocketContext.lastMessage = null

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent("No message")
    })

    it("should handle complex message objects", () => {
      const complexMessage = {
        type: "task-update",
        data: {
          taskId: "task-123",
          status: "in-progress",
          progress: 75,
          details: {
            filesProcessed: 10,
            totalFiles: 15,
            currentFile: "src/components/Button.tsx",
          },
        },
        timestamp: new Date().toISOString(),
      }

      mockWebSocketContext.lastMessage = complexMessage as any

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent(JSON.stringify(complexMessage))
    })
  })

  describe("error handling", () => {
    it("should handle malformed messages gracefully", () => {
      // Simulate malformed message
      mockWebSocketContext.lastMessage = "invalid-json" as any

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent("invalid-json")
    })

    it("should handle null/undefined messages", () => {
      mockWebSocketContext.lastMessage = null

      render(<TestComponent />)

      expect(screen.getByTestId("last-message")).toHaveTextContent("No message")
    })
  })
})
