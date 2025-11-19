#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

const API_PORT = process.env.JF_E2E_API_PORT || "5080"
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "e2e-test-token"
const tmpRoot = await mkdtemp(path.join(tmpdir(), "jobfinder-api-e2e-"))
const serviceAccountPath = path.join(tmpRoot, "firebase-service-account.json")

const serviceAccount = {
  type: "service_account",
  project_id: "job-finder-e2e",
  private_key_id: "test-key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n",
  client_email: "e2e-test@job-finder.local",
  client_id: "1234567890",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/e2e",
}

await writeFile(serviceAccountPath, JSON.stringify(serviceAccount, null, 2))

const dbName = `jobfinder-e2e-${process.pid}-${Date.now()}`
const dbPath = `file:${dbName}?mode=memory&cache=shared`
const migrationsDir = path.resolve(process.cwd(), "infra/sqlite/migrations")

const childEnv = {
  ...process.env,
  NODE_ENV: "test",
  PORT: API_PORT,
  DATABASE_PATH: dbPath,
  FIREBASE_PROJECT_ID: "job-finder-e2e",
  FIREBASE_SERVICE_ACCOUNT_PATH: serviceAccountPath,
  TEST_AUTH_BYPASS_TOKEN: AUTH_TOKEN,
  JF_SQLITE_MIGRATIONS_DIR: migrationsDir,
}

const child = spawn("npm", ["run", "dev", "--workspace", "job-finder-BE/server"], {
  env: childEnv,
  stdio: "inherit",
  shell: true,
})

const shutdown = async (signal) => {
  if (!child.killed) {
    child.kill(signal)
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

child.on("exit", async (code) => {
  await rm(tmpRoot, { recursive: true, force: true })
  process.exit(code ?? 0)
})
