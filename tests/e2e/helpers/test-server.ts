import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import http from "node:http"

const TEST_AUTH_TOKEN = "e2e-test-token"

export interface TestServerContext {
  origin: string
  apiBase: string
  authToken: string
  dbPath: string
  close: () => Promise<void>
}

async function createTmpDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jobfinder-e2e-"))
  return dir
}

async function writeFakeServiceAccount(dir: string) {
  const filePath = path.join(dir, "firebase-test-sa.json")
  const payload = {
    type: "service_account",
    project_id: "job-finder-e2e",
    private_key_id: "test-key-id",
    private_key: "-----BEGIN PRIVATE KEY-----\\nFAKEKEY\\n-----END PRIVATE KEY-----\\n",
    client_email: "test-user@e2e.local",
    client_id: "1234567890",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/e2e",
  }
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2))
  return filePath
}

export async function setupTestServer(): Promise<TestServerContext> {
  const tmpDir = await createTmpDir()
  const dbPath = `file:jobfinder-e2e-${process.pid}-${Date.now()}?mode=memory&cache=shared`

  const serviceAccountPath = await writeFakeServiceAccount(tmpDir)

  process.env.NODE_ENV = "test"
  process.env.PORT = "0"
  process.env.DATABASE_PATH = dbPath
  process.env.JF_SQLITE_DB_PATH = dbPath
  process.env.FIREBASE_PROJECT_ID = "job-finder-e2e"
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH = serviceAccountPath
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
    await fs.rm(tmpDir, { recursive: true, force: true })
  }

  return {
    origin,
    apiBase: `${origin}/api`,
    authToken: TEST_AUTH_TOKEN,
    dbPath,
    close,
  }
}
