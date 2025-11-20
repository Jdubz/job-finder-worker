#!/usr/bin/env node

import path from "node:path"
import { spawn } from "node:child_process"

const API_PORT = process.env.JF_E2E_API_PORT || "5080"
const AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "e2e-test-token"

const dbName = `jobfinder-e2e-${process.pid}-${Date.now()}`
const dbPath = `file:${dbName}?mode=memory&cache=shared`
const migrationsDir = path.resolve(process.cwd(), "infra/sqlite/migrations")

const childEnv = {
  ...process.env,
  NODE_ENV: "test",
  PORT: API_PORT,
  DATABASE_PATH: dbPath,
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

child.on("exit", (code) => {
  process.exit(code ?? 0)
})
