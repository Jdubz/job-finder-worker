import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Optional: copy a prod snapshot only when explicitly enabled.
// Default is an isolated in-memory database for deterministic tests.
if (!process.env.DATABASE_PATH) {
  const useProdSnapshot = process.env.USE_PROD_DB_SNAPSHOT === 'true'
  const prodDbPath = process.env.PROD_DATABASE_PATH ?? '/srv/job-finder/data/jobfinder.db'
  const tempDbPath = path.join('/tmp', 'jobfinder-test.db')

  if (useProdSnapshot && fs.existsSync(prodDbPath)) {
    try {
      fs.copyFileSync(prodDbPath, tempDbPath)
      const walSrc = `${prodDbPath}-wal`
      const shmSrc = `${prodDbPath}-shm`
      const walDest = `${tempDbPath}-wal`
      const shmDest = `${tempDbPath}-shm`
      if (fs.existsSync(walSrc)) fs.copyFileSync(walSrc, walDest)
      if (fs.existsSync(shmSrc)) fs.copyFileSync(shmSrc, shmDest)
      process.env.DATABASE_PATH = tempDbPath
    } catch (err) {
      console.warn('Failed to copy prod DB for tests, falling back to in-memory', err)
      process.env.DATABASE_PATH = 'file:memory:?cache=shared'
    }
  } else {
    process.env.DATABASE_PATH = 'file:memory:?cache=shared'
  }
}

// Ensure migrations are applied from the repo path
process.env.JF_SQLITE_MIGRATIONS_DIR =
  process.env.JF_SQLITE_MIGRATIONS_DIR ?? path.resolve(__dirname, '../../../infra/sqlite/migrations')

// Keep test artifacts in a repo-local, git-ignored folder (never /srv/...)
const defaultArtifactsDir = path.resolve(__dirname, '../../.artifacts-test')
const artifactsDir = process.env.GENERATOR_ARTIFACTS_DIR ?? defaultArtifactsDir

// Keep test artifacts in a repo-local, git-ignored folder (never /srv/...)
process.env.GENERATOR_ARTIFACTS_DIR = artifactsDir

// Ensure logs stay within the repo during tests to avoid permission issues
process.env.LOG_DIR = process.env.LOG_DIR ?? path.resolve(__dirname, '../../.logs-test')

// Clean up artifacts between test runs so they don't accumulate across developers/CI runs.
if (artifactsDir === defaultArtifactsDir) {
  fs.rmSync(artifactsDir, { recursive: true, force: true })
  fs.mkdirSync(artifactsDir, { recursive: true })
} else if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true })
}

// Make the auth bypass token available before any modules load (tests share module cache)
process.env.TEST_AUTH_BYPASS_TOKEN = process.env.TEST_AUTH_BYPASS_TOKEN ?? 'bypass-token'

// Reset the artifacts public base to ensure tests use relative URLs regardless of local .env settings.
// This must happen before any modules that import the storage service are loaded.
delete process.env.GENERATOR_ARTIFACTS_PUBLIC_BASE
