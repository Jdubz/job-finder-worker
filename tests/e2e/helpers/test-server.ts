import http from "node:http"

const TEST_AUTH_TOKEN = "e2e-test-token"

export interface TestServerContext {
  origin: string
  apiBase: string
  authToken: string
  dbPath: string
  close: () => Promise<void>
}

export async function setupTestServer(): Promise<TestServerContext> {
  const dbPath = `file:jobfinder-e2e-${process.pid}-${Date.now()}?mode=memory&cache=shared`

  process.env.NODE_ENV = "test"
  process.env.PORT = "0"
  process.env.DATABASE_PATH = dbPath
  process.env.JF_SQLITE_DB_PATH = dbPath
  process.env.TEST_AUTH_BYPASS_TOKEN = TEST_AUTH_TOKEN

  const { buildApp } = await import("../../../job-finder-BE/server/src/app")
  const { closeDb } = await import("../../../job-finder-BE/server/src/db/sqlite")

  const app = buildApp()
  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })

  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  const origin = `http://127.0.0.1:${port}`

  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    closeDb()
  }

  return {
    origin,
    apiBase: `${origin}/api`,
    authToken: TEST_AUTH_TOKEN,
    dbPath,
    close,
  }
}
