import http from "node:http"
import os from "node:os"
import path from "node:path"

const TEST_AUTH_TOKEN = "dev-admin-token"

export interface TestServerContext {
  origin: string
  apiBase: string
  authToken: string
  dbPath: string
  close: () => Promise<void>
}

export async function setupTestServer(): Promise<TestServerContext> {
  // Use a pure in-memory SQLite database so e2e runs stay isolated and avoid filesystem dirs.
  const dbPath = 'file:memory:?cache=shared'

  process.env.NODE_ENV = "test"
  process.env.PORT = "0"
  process.env.DATABASE_PATH = dbPath
  process.env.JF_SQLITE_DB_PATH = dbPath
  // Point migrations at the repo-level SQL files
  process.env.JF_SQLITE_MIGRATIONS_DIR = path.resolve("infra/sqlite/migrations")
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
