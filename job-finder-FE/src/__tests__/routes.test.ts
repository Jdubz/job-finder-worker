import { ROUTES, PUBLIC_ROUTES } from "../types/routes"

describe("Routes Configuration", () => {
  describe("ROUTES object", () => {
    it("contains all legal page routes", () => {
      expect(ROUTES.TERMS_OF_USE).toBe("/terms-of-use")
      expect(ROUTES.PRIVACY_POLICY).toBe("/privacy-policy")
      expect(ROUTES.COOKIE_POLICY).toBe("/cookie-policy")
      expect(ROUTES.DISCLAIMER).toBe("/disclaimer")
    })

    it("contains all existing routes", () => {
      expect(ROUTES.HOME).toBe("/")
      expect(ROUTES.HOW_IT_WORKS).toBe("/how-it-works")
      expect(ROUTES.CONTENT_ITEMS).toBe("/content-items")
      expect(ROUTES.DOCUMENT_BUILDER).toBe("/document-builder")
      expect(ROUTES.AI_PROMPTS).toBe("/ai-prompts")
      expect(ROUTES.UNAUTHORIZED).toBe("/unauthorized")
    })

    it("contains editor-only routes", () => {
      expect(ROUTES.JOB_APPLICATIONS).toBe("/job-applications")
      expect(ROUTES.QUEUE_MANAGEMENT).toBe("/queue-management")
      expect(ROUTES.JOB_FINDER_CONFIG).toBe("/job-finder-config")
    })

    it("has consistent route format", () => {
      const routeValues = Object.values(ROUTES)

      routeValues.forEach((route) => {
        expect(route).toMatch(/^\//) // All routes should start with /
        // Root route "/" is allowed to end with /, others should not
        if (route !== "/") {
          expect(route).not.toMatch(/\/$/) // No routes should end with / (except root)
        }
      })
    })

    it("has unique route values", () => {
      const routeValues = Object.values(ROUTES)
      const uniqueValues = new Set(routeValues)

      expect(routeValues.length).toBe(uniqueValues.size)
    })
  })

  describe("PUBLIC_ROUTES array", () => {
    it("includes all legal page routes", () => {
      expect(PUBLIC_ROUTES).toContain(ROUTES.TERMS_OF_USE)
      expect(PUBLIC_ROUTES).toContain(ROUTES.PRIVACY_POLICY)
      expect(PUBLIC_ROUTES).toContain(ROUTES.COOKIE_POLICY)
      expect(PUBLIC_ROUTES).toContain(ROUTES.DISCLAIMER)
    })

    it("includes all public routes", () => {
      expect(PUBLIC_ROUTES).toContain(ROUTES.HOME)
      expect(PUBLIC_ROUTES).toContain(ROUTES.HOW_IT_WORKS)
      expect(PUBLIC_ROUTES).toContain(ROUTES.CONTENT_ITEMS)
      expect(PUBLIC_ROUTES).toContain(ROUTES.DOCUMENT_BUILDER)
      expect(PUBLIC_ROUTES).toContain(ROUTES.AI_PROMPTS)
      expect(PUBLIC_ROUTES).toContain(ROUTES.UNAUTHORIZED)
    })

    it("does not include editor-only routes", () => {
      expect(PUBLIC_ROUTES).not.toContain(ROUTES.JOB_APPLICATIONS)
      expect(PUBLIC_ROUTES).not.toContain(ROUTES.QUEUE_MANAGEMENT)
      expect(PUBLIC_ROUTES).not.toContain(ROUTES.JOB_FINDER_CONFIG)
    })

    it("has no duplicate routes", () => {
      const uniqueRoutes = new Set(PUBLIC_ROUTES)
      expect(PUBLIC_ROUTES.length).toBe(uniqueRoutes.size)
    })

    it("contains only valid routes from ROUTES object", () => {
      const allRouteValues = Object.values(ROUTES)

      PUBLIC_ROUTES.forEach((route) => {
        expect(allRouteValues).toContain(route)
      })
    })
  })

  describe("Route consistency", () => {
    it("all legal routes follow naming convention", () => {
      expect(ROUTES.TERMS_OF_USE).toMatch(/^\/[a-z-]+$/)
      expect(ROUTES.PRIVACY_POLICY).toMatch(/^\/[a-z-]+$/)
      expect(ROUTES.COOKIE_POLICY).toMatch(/^\/[a-z-]+$/)
      expect(ROUTES.DISCLAIMER).toMatch(/^\/[a-z-]+$/)
    })

    it("legal routes are descriptive and clear", () => {
      expect(ROUTES.TERMS_OF_USE).toContain("terms")
      expect(ROUTES.PRIVACY_POLICY).toContain("privacy")
      expect(ROUTES.COOKIE_POLICY).toContain("cookie")
      expect(ROUTES.DISCLAIMER).toContain("disclaimer")
    })

    it("all routes are properly typed", () => {
      // This test ensures TypeScript types are working correctly
      const testRoute: (typeof ROUTES)[keyof typeof ROUTES] = ROUTES.TERMS_OF_USE
      expect(typeof testRoute).toBe("string")
    })
  })
})
