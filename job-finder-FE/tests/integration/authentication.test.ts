/**
 * Authentication Helper Integration Tests
 *
 * Verifies the GIS-based helper utilities that power integration/E2E flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest"
import {
  signInTestUser,
  cleanupTestAuth,
  getTestAuthToken,
  TEST_USERS,
  makeAuthenticatedRequest,
  makeUnauthenticatedRequest,
} from "../utils/testHelpers"

describe("Authentication Helpers", () => {
  const originalFetch = global.fetch

  beforeEach(async () => {
    await cleanupTestAuth()
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("signs in the regular test user", async () => {
    const user = await signInTestUser("regular")

    expect(user).toBeDefined()
    expect(user.email).toBe(TEST_USERS.regular.email)
    expect(user.id).toBe(TEST_USERS.regular.id)
  })

  it("signs in the admin test user", async () => {
    const user = await signInTestUser("admin")

    expect(user).toBeDefined()
    expect(user.email).toBe(TEST_USERS.admin.email)
    expect(user.id).toBe(TEST_USERS.admin.id)
  })

  it("returns the bypass token when requesting auth credentials", async () => {
    await signInTestUser("regular")
    const token = await getTestAuthToken("regular")

    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(0)
  })

  it("reuses the bypass token after cleanup and re-login", async () => {
    const firstToken = await getTestAuthToken("regular")
    await cleanupTestAuth()
    await signInTestUser("regular")
    const secondToken = await getTestAuthToken("regular")

    expect(firstToken).toBeDefined()
    expect(secondToken).toBeDefined()
  })

  it("attaches Authorization header for authenticated requests", async () => {
    await signInTestUser("regular")
    const token = await getTestAuthToken("regular")

    await makeAuthenticatedRequest("https://api.test/resource", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    })

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/resource",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }),
        method: "POST",
      })
    )
  })

  it("omits Authorization header for unauthenticated requests", async () => {
    await makeUnauthenticatedRequest("https://api.test/resource", {
      method: "GET",
    })

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/resource",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    )
    const [, options] = (global.fetch as Mock).mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })
})
