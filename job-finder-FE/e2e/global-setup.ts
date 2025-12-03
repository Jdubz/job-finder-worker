import { request, type FullConfig } from "@playwright/test"
import { seedBaseConfigs } from "./fixtures/api-client"

/**
 * Create a reusable authenticated storage state for the default admin/dev token.
 * Viewer/unauth tests clear or override cookies as needed in their own hooks.
 */
export default async function globalSetup(_config: FullConfig) {
  const apiBase = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
  const authToken = process.env.JF_E2E_AUTH_TOKEN || "dev-admin-token"
  const storagePath = "e2e/.auth/admin.json"

  const requestContext = await request.newContext()
  const response = await requestContext.post(`${apiBase}/auth/login`, {
    data: { credential: authToken },
    headers: { "Content-Type": "application/json" },
  })

  if (!response.ok()) {
    throw new Error(`Failed to create admin storage state: ${response.status()} ${await response.text()}`)
  }

  // Ensure baseline configs exist for UI routes that require them
  await seedBaseConfigs(requestContext)

  await requestContext.storageState({ path: storagePath })
  await requestContext.dispose()
}
