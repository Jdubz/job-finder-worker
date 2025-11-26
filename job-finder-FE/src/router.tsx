import { createBrowserRouter, Navigate } from "react-router-dom"
import { MainLayout } from "@/components/layout/MainLayout"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
import { ROUTES } from "@/types/routes"
import { LazyPage } from "@/components/common/LazyPage"
import { lazyWithRetry } from "@/lib/lazyWithRetry"
import { RouteErrorBoundary } from "@/components/error/RouteErrorBoundary"

// Lazy load pages for code splitting with automatic retry on chunk load failures
const HowItWorksPage = lazyWithRetry(() =>
  import("@/pages/how-it-works/HowItWorksPage").then((m) => ({
    default: m.HowItWorksPage,
  }))
)
const ContentItemsPage = lazyWithRetry(() =>
  import("@/pages/content-items/ContentItemsPage").then((m) => ({
    default: m.ContentItemsPage,
  }))
)
const DocumentBuilderPage = lazyWithRetry(() =>
  import("@/pages/document-builder/DocumentBuilderPage").then((m) => ({
    default: m.DocumentBuilderPage,
  }))
)
const AIPromptsPage = lazyWithRetry(() =>
  import("@/pages/ai-prompts/AIPromptsPage").then((m) => ({
    default: m.AIPromptsPage,
  }))
)
const SettingsPage = lazyWithRetry(() =>
  import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
)
const JobApplicationsPage = lazyWithRetry(() =>
  import("@/pages/job-applications/JobApplicationsPage").then((m) => ({
    default: m.JobApplicationsPage,
  }))
)
const JobFinderPage = lazyWithRetry(() =>
  import("@/pages/job-finder/JobFinderPage").then((m) => ({ default: m.JobFinderPage }))
)
const QueueManagementPage = lazyWithRetry(() =>
  import("@/pages/queue-management/QueueManagementPage").then((m) => ({
    default: m.QueueManagementPage,
  }))
)
const JobFinderConfigPage = lazyWithRetry(() =>
  import("@/pages/job-finder-config/JobFinderConfigPage").then((m) => ({
    default: m.JobFinderConfigPage,
  }))
)
const UnauthorizedPage = lazyWithRetry(() =>
  import("@/pages/auth/UnauthorizedPage").then((m) => ({ default: m.UnauthorizedPage }))
)
const TermsOfUsePage = lazyWithRetry(() =>
  import("@/pages/legal/TermsOfUsePage").then((m) => ({ default: m.TermsOfUsePage }))
)
const PrivacyPolicyPage = lazyWithRetry(() =>
  import("@/pages/legal/PrivacyPolicyPage").then((m) => ({ default: m.PrivacyPolicyPage }))
)
const CookiePolicyPage = lazyWithRetry(() =>
  import("@/pages/legal/CookiePolicyPage").then((m) => ({ default: m.CookiePolicyPage }))
)
const DisclaimerPage = lazyWithRetry(() =>
  import("@/pages/legal/DisclaimerPage").then((m) => ({ default: m.DisclaimerPage }))
)

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Public routes (accessible to everyone, including unauthenticated users)
      {
        path: ROUTES.HOME,
        element: (
          <LazyPage>
            <HowItWorksPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.HOW_IT_WORKS,
        element: (
          <LazyPage>
            <HowItWorksPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.CONTENT_ITEMS,
        element: (
          <LazyPage>
            <ContentItemsPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.DOCUMENT_BUILDER,
        element: (
          <LazyPage>
            <DocumentBuilderPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.JOB_APPLICATIONS,
        element: (
          <LazyPage>
            <JobApplicationsPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.JOB_FINDER,
        element: (
          <LazyPage>
            <JobFinderPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.UNAUTHORIZED,
        element: (
          <LazyPage>
            <UnauthorizedPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.TERMS_OF_USE,
        element: (
          <LazyPage>
            <TermsOfUsePage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.PRIVACY_POLICY,
        element: (
          <LazyPage>
            <PrivacyPolicyPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.COOKIE_POLICY,
        element: (
          <LazyPage>
            <CookiePolicyPage />
          </LazyPage>
        ),
      },
      {
        path: ROUTES.DISCLAIMER,
        element: (
          <LazyPage>
            <DisclaimerPage />
          </LazyPage>
        ),
      },

      // Admin-only routes (require owner/admin role)
      {
        element: <ProtectedRoute requireOwner unauthRedirectTo={ROUTES.HOME} />,
        children: [
          {
            path: ROUTES.QUEUE_MANAGEMENT,
            element: (
              <LazyPage>
                <QueueManagementPage />
              </LazyPage>
            ),
          },
          {
            path: ROUTES.JOB_FINDER_CONFIG,
            element: (
              <LazyPage>
                <JobFinderConfigPage />
              </LazyPage>
            ),
          },
          {
            path: ROUTES.SETTINGS,
            element: (
              <LazyPage>
                <SettingsPage />
              </LazyPage>
            ),
          },
        ],
      },

      // Publicly visible; editing handled inside page (admin-only for changes)
      {
        path: ROUTES.AI_PROMPTS,
        element: (
          <LazyPage>
            <AIPromptsPage />
          </LazyPage>
        ),
      },

      // Catch-all redirect
      {
        path: "*",
        element: <Navigate to={ROUTES.HOME} replace />,
      },
    ],
  },
])
