/**
 * Tests for FirestoreContext
 */

import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { FirestoreProvider, useFirestore } from "../FirestoreContext"

// Mock the Firestore service
vi.mock("@/services/firestore/FirestoreService", () => ({
  firestoreService: {
    subscribeToCollection: vi.fn(),
    subscribeToDocument: vi.fn(),
    getDocument: vi.fn(),
    addDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
}))

import { firestoreService } from "@/services/firestore/FirestoreService"

describe("FirestoreContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("FirestoreProvider", () => {
    it("should provide firestore context to children", () => {
      function TestComponent() {
        const { service } = useFirestore()
        return <div data-testid="service">{service ? "service-available" : "no-service"}</div>
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      expect(screen.getByTestId("service")).toHaveTextContent("service-available")
    })

    it("should provide subscription methods", () => {
      function TestComponent() {
        const { subscribeToCollection, subscribeToDocument } = useFirestore()
        return (
          <div>
            <div data-testid="subscribe-collection">{typeof subscribeToCollection}</div>
            <div data-testid="subscribe-document">{typeof subscribeToDocument}</div>
          </div>
        )
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      expect(screen.getByTestId("subscribe-collection")).toHaveTextContent("function")
      expect(screen.getByTestId("subscribe-document")).toHaveTextContent("function")
    })

    it("should provide cache management methods", () => {
      function TestComponent() {
        const { clearCache, getCachedData } = useFirestore()
        return (
          <div>
            <div data-testid="clear-cache">{typeof clearCache}</div>
            <div data-testid="get-cached-data">{typeof getCachedData}</div>
          </div>
        )
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      expect(screen.getByTestId("clear-cache")).toHaveTextContent("function")
      expect(screen.getByTestId("get-cached-data")).toHaveTextContent("function")
    })
  })

  describe("subscribeToCollection", () => {
    it("should subscribe to collection", async () => {
      const unsubscribeMock = vi.fn()
      const mockData = [{ id: "1", name: "Test" }]

      vi.mocked(firestoreService.subscribeToCollection).mockImplementation(
        (_collection, onData, _onError) => {
          setTimeout(() => onData(mockData), 0)
          return unsubscribeMock
        }
      )

      function TestComponent() {
        const { subscribeToCollection } = useFirestore()
        const [data, setData] = React.useState<any[]>([])

        React.useEffect(() => {
          const unsubscribe = subscribeToCollection("content-items", setData, (error) =>
            console.error(error)
          )
          return unsubscribe
        }, [subscribeToCollection])

        return <div data-testid="data">{data.length > 0 ? data[0].name : "no-data"}</div>
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("data")).toHaveTextContent("Test")
      })
    })

    it("should handle subscription errors", async () => {
      const error = new Error("Subscription failed")
      const onErrorMock = vi.fn()

      vi.mocked(firestoreService.subscribeToCollection).mockImplementation(
        (_collection, _onData, onError) => {
          setTimeout(() => onError(error), 0)
          return vi.fn()
        }
      )

      function TestComponent() {
        const { subscribeToCollection } = useFirestore()

        React.useEffect(() => {
          const unsubscribe = subscribeToCollection("content-items", () => {}, onErrorMock)
          return unsubscribe
        }, [subscribeToCollection])

        return <div>Test</div>
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      await waitFor(() => {
        expect(onErrorMock).toHaveBeenCalledWith(error)
      })
    })
  })

  describe("subscribeToDocument", () => {
    it("should subscribe to document", async () => {
      const unsubscribeMock = vi.fn()
      const mockDoc = { id: "1", name: "Test Document" }

      vi.mocked(firestoreService.subscribeToDocument).mockImplementation(
        (_collection, _docId, onData, _onError) => {
          setTimeout(() => onData(mockDoc), 0)
          return unsubscribeMock
        }
      )

      function TestComponent() {
        const { subscribeToDocument } = useFirestore()
        const [doc, setDoc] = React.useState<any>(null)

        React.useEffect(() => {
          const unsubscribe = subscribeToDocument("content-items", "1", setDoc, (error) =>
            console.error(error)
          )
          return unsubscribe
        }, [subscribeToDocument])

        return <div data-testid="doc">{doc ? doc.name : "no-doc"}</div>
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("doc")).toHaveTextContent("Test Document")
      })
    })
  })

  describe("cache management", () => {
    it("should cache collection data", async () => {
      const mockData = [{ id: "1", name: "Test" }]
      let callCount = 0

      vi.mocked(firestoreService.subscribeToCollection).mockImplementation(
        (_collection, onData, _onError) => {
          callCount++
          setTimeout(() => onData(mockData), 0)
          return vi.fn()
        }
      )

      function TestComponent() {
        const { subscribeToCollection } = useFirestore()
        const [_data, setData] = React.useState<any[]>([])

        React.useEffect(() => {
          // Subscribe twice with same cache key
          const unsubscribe1 = subscribeToCollection(
            "content-items",
            setData,
            (error) => console.error(error),
            undefined,
            "test-cache"
          )

          const unsubscribe2 = subscribeToCollection(
            "content-items",
            setData,
            (error) => console.error(error),
            undefined,
            "test-cache"
          )

          return () => {
            unsubscribe1()
            unsubscribe2()
          }
        }, [subscribeToCollection])

        return <div data-testid="call-count">{callCount}</div>
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      await waitFor(() => {
        // Should only call subscribe once due to caching
        expect(callCount).toBeLessThanOrEqual(1)
      })
    })

    it("should clear cache", () => {
      function TestComponent() {
        const { clearCache } = useFirestore()
        return (
          <button onClick={() => clearCache()} data-testid="clear-btn">
            Clear
          </button>
        )
      }

      render(
        <FirestoreProvider>
          <TestComponent />
        </FirestoreProvider>
      )

      const btn = screen.getByTestId("clear-btn")
      expect(() => btn.click()).not.toThrow()
    })
  })

  describe("useFirestore hook", () => {
    it("should throw error when used outside FirestoreProvider", () => {
      function TestComponent() {
        useFirestore()
        return <div>Test</div>
      }

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(() => render(<TestComponent />)).toThrow(
        "useFirestore must be used within a FirestoreProvider"
      )

      consoleSpy.mockRestore()
    })
  })
})
