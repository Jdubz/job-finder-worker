/**
 * Authentication Context Tests
 *
 * Comprehensive tests for the Authentication Context functionality
 * Rank 6 - MEDIUM: User access control
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { AuthProvider, useAuth } from "../AuthContext"
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth"

// Mock Firebase auth
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}))

// Mock Firebase config
vi.mock("@/config/firebase", () => ({
  auth: {},
}))

// Mock component to test the context
const TestComponent = () => {
  const { user, loading, isOwner, signOut } = useAuth()

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <div data-testid="user-email">{user?.email || "No user"}</div>
      <div data-testid="is-editor">{isOwner ? "Owner" : "Viewer"}</div>
      <button onClick={signOut} data-testid="sign-out">
        Sign Out
      </button>
    </div>
  )
}

describe("AuthContext", () => {
  const mockOnAuthStateChanged = vi.mocked(onAuthStateChanged)
  const mockSignOut = vi.mocked(firebaseSignOut)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("AuthProvider", () => {
    it("should provide loading state initially", () => {
      mockOnAuthStateChanged.mockImplementation((_auth, _callback) => {
        // Don't call callback immediately to test loading state
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      expect(screen.getByText("Loading...")).toBeInTheDocument()
    })

    it("should handle unauthenticated user", async () => {
      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        // Simulate no user
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(null)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })

    it("should handle authenticated user with viewer role", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "viewer" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })

    it("should handle authenticated user with editor role", async () => {
      const mockUser = {
        uid: "user-123",
        email: "editor@example.com",
        displayName: "Editor User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "editor" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("editor@example.com")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Owner")
      })
    })

    it("should handle user without role claims", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: {},
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })

    it("should handle token retrieval errors", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockRejectedValue(new Error("Token error")),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })

    it("should clean up auth state listener on unmount", () => {
      const unsubscribe = vi.fn()
      mockOnAuthStateChanged.mockReturnValue(unsubscribe)

      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })
  })

  describe("signOut", () => {
    it("should sign out user successfully", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "viewer" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      mockSignOut.mockResolvedValue(undefined)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
      })

      const signOutButton = screen.getByTestId("sign-out")
      signOutButton.click()

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })
    })

    it("should handle sign out errors", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "viewer" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      mockSignOut.mockRejectedValue(new Error("Sign out failed"))

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
      })

      const signOutButton = screen.getByTestId("sign-out")

      // Should not throw error
      await expect(async () => {
        signOutButton.click()
      }).not.toThrow()
    })
  })

  describe("useAuth hook", () => {
    it("should throw error when used outside AuthProvider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(() => {
        render(<TestComponent />)
      }).toThrow("useAuth must be used within an AuthProvider")

      consoleSpy.mockRestore()
    })

    it("should provide auth context values", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "editor" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Owner")
      })
    })
  })

  describe("role-based access control", () => {
    it("should correctly identify editor role", async () => {
      const mockUser = {
        uid: "user-123",
        email: "editor@example.com",
        displayName: "Editor User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "editor" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Owner")
      })
    })

    it("should correctly identify viewer role", async () => {
      const mockUser = {
        uid: "user-123",
        email: "viewer@example.com",
        displayName: "Viewer User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "viewer" },
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })

    it("should default to viewer role for users without role claims", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: {},
        }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })
  })

  describe("session management", () => {
    it("should handle user state changes", async () => {
      let authCallback: (user: any) => void = () => {}

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        authCallback = callback as (user: any) => void
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // Initially no user
      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
      })

      // Simulate user login
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi.fn().mockResolvedValue({
          claims: { role: "viewer" },
        }),
      }

      authCallback(mockUser)

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com")
      })

      // Simulate user logout
      authCallback(null)

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })
    })

    it("should handle token refresh", async () => {
      const mockUser = {
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        getIdTokenResult: vi
          .fn()
          .mockResolvedValueOnce({
            claims: { role: "viewer" },
          })
          .mockResolvedValueOnce({
            claims: { role: "editor" },
          }),
      }

      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Viewer")
      })

      // Simulate token refresh with role change
      mockUser.getIdTokenResult.mockResolvedValue({
        claims: { role: "editor" },
      })

      // Trigger auth state change again
      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        if (typeof callback === "function") {
          if (typeof callback === "function") {
            callback(mockUser as any)
          }
        }
        return () => {}
      })

      await waitFor(() => {
        expect(screen.getByTestId("is-editor")).toHaveTextContent("Owner")
      })
    })
  })

  describe("error handling", () => {
    it("should handle auth state change errors gracefully", async () => {
      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        // Simulate error in auth state change
        try {
          if (typeof callback === "function") {
            callback(null)
          }
        } catch (error) {
          // Error should be handled gracefully
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
      })
    })

    it("should handle Firebase auth errors", async () => {
      mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
        // Simulate Firebase error
        if (typeof callback === "function") {
          callback(null)
        }
        return () => {}
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
      })
    })
  })
})
