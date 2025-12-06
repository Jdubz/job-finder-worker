export const ROUTES = {
  HOME: "/",
  HOW_IT_WORKS: "/how-it-works",
  CONTENT_ITEMS: "/content-items",
  DOCUMENT_BUILDER: "/document-builder",
  DOCUMENTS: "/documents",
  AI_PROMPTS: "/ai-prompts",
  // Authenticated routes (viewer or admin)
  JOB_APPLICATIONS: "/job-applications",
  JOB_LISTINGS: "/job-listings",
  COMPANIES: "/companies",
  SOURCES: "/sources",
  // Admin-only routes
  QUEUE_MANAGEMENT: "/queue-management",
  JOB_FINDER_CONFIG: "/job-finder-config",
  SYSTEM_HEALTH: "/system-health",
  // Legal pages
  TERMS_OF_USE: "/terms-of-use",
  PRIVACY_POLICY: "/privacy-policy",
  COOKIE_POLICY: "/cookie-policy",
  DISCLAIMER: "/disclaimer",
  // Auth
  LOGIN: "/login",
  UNAUTHORIZED: "/unauthorized",
} as const

export type RouteKey = keyof typeof ROUTES
export type RoutePath = (typeof ROUTES)[RouteKey]

// Routes that require authentication (viewer or admin role)
export const AUTHENTICATED_ROUTES: RoutePath[] = [
  ROUTES.JOB_APPLICATIONS,
  ROUTES.JOB_LISTINGS,
  ROUTES.COMPANIES,
  ROUTES.SOURCES,
]

// Routes that require admin role
export const ADMIN_ROUTES: RoutePath[] = [
  ROUTES.QUEUE_MANAGEMENT,
  ROUTES.JOB_FINDER_CONFIG,
  ROUTES.SYSTEM_HEALTH,
]

// Public routes that anyone can access
export const PUBLIC_ROUTES: RoutePath[] = [
  ROUTES.HOME,
  ROUTES.HOW_IT_WORKS,
  ROUTES.CONTENT_ITEMS,
  ROUTES.DOCUMENT_BUILDER,
  ROUTES.DOCUMENTS,
  ROUTES.AI_PROMPTS,
  ROUTES.TERMS_OF_USE,
  ROUTES.PRIVACY_POLICY,
  ROUTES.COOKIE_POLICY,
  ROUTES.DISCLAIMER,
  ROUTES.LOGIN,
  ROUTES.UNAUTHORIZED,
]
