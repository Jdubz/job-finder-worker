export const ROUTES = {
  HOME: "/",
  HOW_IT_WORKS: "/how-it-works",
  CONTENT_ITEMS: "/content-items",
  DOCUMENT_BUILDER: "/document-builder",
  AI_PROMPTS: "/ai-prompts",
  // Editor-only routes
  JOB_APPLICATIONS: "/job-applications",
  JOB_LISTINGS: "/job-listings",
  JOB_FINDER: "/job-finder",
  COMPANIES: "/companies",
  SOURCES: "/sources",
  QUEUE_MANAGEMENT: "/queue-management",
  JOB_FINDER_CONFIG: "/job-finder-config",
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

// Editor-only routes that require authentication
export const EDITOR_ROUTES: RoutePath[] = [
  ROUTES.JOB_APPLICATIONS,
  ROUTES.JOB_LISTINGS,
  ROUTES.JOB_FINDER,
  ROUTES.COMPANIES,
  ROUTES.SOURCES,
  ROUTES.QUEUE_MANAGEMENT,
  ROUTES.JOB_FINDER_CONFIG,
]

// Public routes that anyone can access
export const PUBLIC_ROUTES: RoutePath[] = [
  ROUTES.HOME,
  ROUTES.HOW_IT_WORKS,
  ROUTES.CONTENT_ITEMS,
  ROUTES.DOCUMENT_BUILDER,
  ROUTES.AI_PROMPTS,
  ROUTES.TERMS_OF_USE,
  ROUTES.PRIVACY_POLICY,
  ROUTES.COOKIE_POLICY,
  ROUTES.DISCLAIMER,
  ROUTES.LOGIN,
  ROUTES.UNAUTHORIZED,
]
