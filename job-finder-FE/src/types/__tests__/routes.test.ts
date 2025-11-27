/**
 * Routes Configuration Tests
 * Tests for application route constants
 */

import { describe, it, expect } from "vitest"
import { ROUTES } from "../routes"

describe("ROUTES configuration", () => {
  describe("route paths", () => {
    it("should define HOME route", () => {
      expect(ROUTES.HOME).toBe("/")
    })

    it("should define HOW_IT_WORKS route", () => {
      expect(ROUTES.HOW_IT_WORKS).toBeDefined()
      expect(ROUTES.HOW_IT_WORKS).toMatch(/^\//)
    })

    it("should define CONTENT_ITEMS route", () => {
      expect(ROUTES.CONTENT_ITEMS).toBeDefined()
      expect(ROUTES.CONTENT_ITEMS).toMatch(/^\//)
    })

    it("should define DOCUMENT_BUILDER route", () => {
      expect(ROUTES.DOCUMENT_BUILDER).toBeDefined()
      expect(ROUTES.DOCUMENT_BUILDER).toMatch(/^\//)
    })

    it("should define JOB_APPLICATIONS route", () => {
      expect(ROUTES.JOB_APPLICATIONS).toBeDefined()
      expect(ROUTES.JOB_APPLICATIONS).toMatch(/^\//)
    })

    it("should define JOB_FINDER route", () => {
      expect(ROUTES.JOB_FINDER).toBeDefined()
      expect(ROUTES.JOB_FINDER).toMatch(/^\//)
    })
  })

  describe("route uniqueness", () => {
    it("should not have duplicate route paths", () => {
      const paths = Object.values(ROUTES)
      const uniquePaths = new Set(paths)

      expect(uniquePaths.size).toBe(paths.length)
    })

    it("should all start with forward slash", () => {
      const paths = Object.values(ROUTES)
      paths.forEach((path) => {
        expect(path).toMatch(/^\//)
      })
    })

    it("should not have trailing slashes (except HOME)", () => {
      const paths = Object.values(ROUTES).filter((path) => path !== "/")
      paths.forEach((path) => {
        expect(path).not.toMatch(/\/$/)
      })
    })
  })

  describe("route structure", () => {
    it("should have all required application routes", () => {
      const requiredRoutes = [
        "HOME",
        "HOW_IT_WORKS",
        "CONTENT_ITEMS",
        "DOCUMENT_BUILDER",
        "JOB_APPLICATIONS",
        "JOB_FINDER",
      ]

      requiredRoutes.forEach((route) => {
        expect(ROUTES).toHaveProperty(route)
      })
    })

    it("should export ROUTES as const object", () => {
      expect(ROUTES).toBeDefined()
      expect(typeof ROUTES).toBe("object")
      expect(ROUTES).not.toBeNull()
    })
  })
})
