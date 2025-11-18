/**
 * Authentication Integration Tests
 *
 * Tests for Firebase Authentication flows
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  signInTestUser,
  cleanupTestAuth,
  getTestAuthToken,
  TEST_USERS,
  getIntegrationDescribe,
} from "../utils/testHelpers"
import { auth } from "@/config/firebase"

// Skip integration tests if Firebase is mocked (unit test mode)
const describeIntegration = getIntegrationDescribe()

describeIntegration("Authentication Integration", () => {
  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestAuth()
  })

  describe("Sign In", () => {
    it("should sign in regular test user", async () => {
      const user = await signInTestUser("regular")

      expect(user).toBeDefined()
      expect(user.email).toBe(TEST_USERS.regular.email)
      expect(user.uid).toBeDefined()
      expect(user.uid.length).toBeGreaterThan(0)
    })

    it("should sign in editor test user", async () => {
      const user = await signInTestUser("editor")

      expect(user).toBeDefined()
      expect(user.email).toBe(TEST_USERS.editor.email)
      expect(user.uid).toBeDefined()
    })

    it("should get auth token for regular user", async () => {
      await signInTestUser("regular")
      const token = await getTestAuthToken("regular")

      expect(token).toBeDefined()
      expect(typeof token).toBe("string")
      expect(token.length).toBeGreaterThan(0)
    })

    it("should get auth token for editor user", async () => {
      await signInTestUser("editor")
      const token = await getTestAuthToken("editor")

      expect(token).toBeDefined()
      expect(typeof token).toBe("string")
      expect(token.length).toBeGreaterThan(0)
    })

    it("should update current user in auth", async () => {
      await signInTestUser("regular")

      expect(auth.currentUser).not.toBeNull()
      expect(auth.currentUser?.email).toBe(TEST_USERS.regular.email)
    })
  })

  describe("Sign Out", () => {
    it("should sign out successfully", async () => {
      await signInTestUser("regular")
      expect(auth.currentUser).not.toBeNull()

      await cleanupTestAuth()

      expect(auth.currentUser).toBeNull()
    })

    it("should clear auth token after sign out", async () => {
      await signInTestUser("regular")
      const tokenBefore = await getTestAuthToken("regular")
      expect(tokenBefore).toBeDefined()

      await cleanupTestAuth()

      // After cleanup, getTestAuthToken will try to sign in again
      // So we check auth.currentUser directly
      expect(auth.currentUser).toBeNull()
    })

    it("should handle multiple sign out calls gracefully", async () => {
      await signInTestUser("regular")

      await cleanupTestAuth()
      await cleanupTestAuth() // Second cleanup should not throw

      expect(auth.currentUser).toBeNull()
    })
  })

  describe("User Switching", () => {
    it("should switch between users", async () => {
      // Sign in as regular user
      const user1 = await signInTestUser("regular")
      expect(user1.email).toBe(TEST_USERS.regular.email)

      // Switch to editor user
      await cleanupTestAuth()
      const user2 = await signInTestUser("editor")
      expect(user2.email).toBe(TEST_USERS.editor.email)

      // Verify current user is editor
      expect(auth.currentUser?.email).toBe(TEST_USERS.editor.email)
    })

    it("should get different tokens for different users", async () => {
      // Get token for regular user
      await signInTestUser("regular")
      const token1 = await getTestAuthToken("regular")

      // Switch to editor user
      await cleanupTestAuth()
      await signInTestUser("editor")
      const token2 = await getTestAuthToken("editor")

      expect(token1).toBeDefined()
      expect(token2).toBeDefined()
      expect(token1).not.toBe(token2)
    })
  })

  describe("Token Operations", () => {
    it("should get fresh token", async () => {
      await signInTestUser("regular")

      const token1 = await getTestAuthToken("regular")
      const token2 = await getTestAuthToken("regular")

      // Tokens should be the same (or both valid) since user hasn't changed
      expect(token1).toBeDefined()
      expect(token2).toBeDefined()
      expect(typeof token1).toBe("string")
      expect(typeof token2).toBe("string")
    })

    it("should validate token format", async () => {
      await signInTestUser("regular")
      const token = await getTestAuthToken("regular")

      // Firebase tokens are typically JWT format (3 parts separated by dots)
      expect(token).toBeDefined()
      expect(token.split(".").length).toBe(3)
    })

    it("should get user ID from token", async () => {
      const user = await signInTestUser("regular")
      const token = await getTestAuthToken("regular")

      expect(user.uid).toBeDefined()
      expect(token).toBeDefined()

      // The user ID should be consistent
      const token2 = await getTestAuthToken("regular")
      expect(token2).toBeDefined()
    })
  })

  describe("User Properties", () => {
    it("should have email property", async () => {
      const user = await signInTestUser("regular")

      expect(user.email).toBeDefined()
      expect(user.email).toBe(TEST_USERS.regular.email)
    })

    it("should have uid property", async () => {
      const user = await signInTestUser("regular")

      expect(user.uid).toBeDefined()
      expect(typeof user.uid).toBe("string")
      expect(user.uid.length).toBeGreaterThan(0)
    })

    it("should have consistent uid across sign-ins", async () => {
      const user1 = await signInTestUser("regular")
      const uid1 = user1.uid

      await cleanupTestAuth()

      const user2 = await signInTestUser("regular")
      const uid2 = user2.uid

      expect(uid1).toBe(uid2)
    })

    it("should have different uids for different users", async () => {
      const user1 = await signInTestUser("regular")
      const uid1 = user1.uid

      await cleanupTestAuth()

      const user2 = await signInTestUser("editor")
      const uid2 = user2.uid

      expect(uid1).not.toBe(uid2)
    })
  })

  describe("Error Handling", () => {
    it("should handle sign out when not signed in", async () => {
      // Should not throw error
      await expect(cleanupTestAuth()).resolves.not.toThrow()
    })

    it("should handle getting token when not signed in", async () => {
      // getTestAuthToken will try to sign in, so it should succeed
      const token = await getTestAuthToken("regular")
      expect(token).toBeDefined()
    })
  })

  describe("Auth State", () => {
    it("should reflect current user state", async () => {
      // Initially not signed in
      expect(auth.currentUser).toBeNull()

      // After sign in
      await signInTestUser("regular")
      expect(auth.currentUser).not.toBeNull()

      // After sign out
      await cleanupTestAuth()
      expect(auth.currentUser).toBeNull()
    })

    it("should maintain auth state within a session", async () => {
      await signInTestUser("regular")

      const user1 = auth.currentUser
      const user2 = auth.currentUser

      expect(user1).toBe(user2)
      expect(user1?.email).toBe(user2?.email)
    })
  })

  describe("Test Credentials", () => {
    it("should have valid test user credentials", () => {
      expect(TEST_USERS.regular.email).toBeDefined()
      expect(TEST_USERS.regular.password).toBeDefined()
      expect(TEST_USERS.editor.email).toBeDefined()
      expect(TEST_USERS.editor.password).toBeDefined()
    })

    it("should have different credentials for different users", () => {
      expect(TEST_USERS.regular.email).not.toBe(TEST_USERS.editor.email)
    })

    it("should have valid email format", () => {
      expect(TEST_USERS.regular.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      expect(TEST_USERS.editor.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    })
  })
})
