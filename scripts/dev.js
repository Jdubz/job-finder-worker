#!/usr/bin/env node

/**
 * Rapid Development Workflow Script
 *
 * - Copies production SQLite DB to temp location (in-memory-like ephemeral copy)
 * - Starts backend with hot reload using the temp DB
 * - Starts frontend with network exposure for cross-device testing
 * - Cleans up temp DB on exit
 */

import { spawn } from 'node:child_process'
import { copyFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir, networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')

// Configuration
const PROD_DB_PATH = join(ROOT_DIR, 'infra/sqlite/jobfinder.db')
const TEMP_DB_DIR = join(tmpdir(), 'job-finder-dev')
const TEMP_DB_NAME = `jobfinder-dev-${randomBytes(4).toString('hex')}.db`
const TEMP_DB_PATH = join(TEMP_DB_DIR, TEMP_DB_NAME)

const FE_DIR = join(ROOT_DIR, 'job-finder-FE')
const BE_DIR = join(ROOT_DIR, 'job-finder-BE/server')
const MIGRATIONS_DIR = join(ROOT_DIR, 'infra/sqlite/migrations')

// Track child processes for cleanup
const children = []

function log(message) {
  console.log(`\x1b[36m[dev]\x1b[0m ${message}`)
}

function logError(message) {
  console.error(`\x1b[31m[dev]\x1b[0m ${message}`)
}

function logWarn(message) {
  console.warn(`\x1b[33m[dev]\x1b[0m ${message}`)
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port)
  })
}

async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (await checkPort(port)) {
      return port
    }
  }
  return null
}

function cleanup() {
  log('Shutting down...')

  // Kill child processes
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  // Remove temp database files
  try {
    if (existsSync(TEMP_DB_PATH)) {
      unlinkSync(TEMP_DB_PATH)
      log(`Removed temp DB: ${TEMP_DB_PATH}`)
    }
    // Also remove WAL and SHM files if they exist
    const walPath = `${TEMP_DB_PATH}-wal`
    const shmPath = `${TEMP_DB_PATH}-shm`
    if (existsSync(walPath)) unlinkSync(walPath)
    if (existsSync(shmPath)) unlinkSync(shmPath)
  } catch (err) {
    logError(`Failed to cleanup temp DB: ${err.message}`)
  }
}

function copyDatabase() {
  if (!existsSync(PROD_DB_PATH)) {
    logError(`Production database not found at: ${PROD_DB_PATH}`)
    logError('Please ensure the production database exists before running dev mode.')
    process.exit(1)
  }

  // Create temp directory if needed
  if (!existsSync(TEMP_DB_DIR)) {
    mkdirSync(TEMP_DB_DIR, { recursive: true })
  }

  log(`Copying production DB to: ${TEMP_DB_PATH}`)
  copyFileSync(PROD_DB_PATH, TEMP_DB_PATH)
  log('Database copy complete')
}

function startBackend(port) {
  log(`Starting backend with hot reload on port ${port}...`)

  const backend = spawn('npm', ['run', 'dev'], {
    cwd: BE_DIR,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_PATH: TEMP_DB_PATH,
      JF_SQLITE_MIGRATIONS_DIR: MIGRATIONS_DIR,
      PORT: String(port)
    }
  })

  backend.on('error', (err) => {
    logError(`Backend error: ${err.message}`)
  })

  backend.on('exit', (code) => {
    if (code !== null && code !== 0) {
      logError(`Backend exited with code ${code}`)
    }
  })

  children.push(backend)
  return backend
}

function startFrontend(bePort, fePort, networkIP) {
  log(`Starting frontend with network exposure on port ${fePort}...`)

  // Use network IP so the frontend works from other devices on the network
  const frontend = spawn('npx', ['vite', '--port', String(fePort), '--strictPort'], {
    cwd: FE_DIR,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_API_BASE_URL: `http://${networkIP}:${bePort}`
    }
  })

  frontend.on('error', (err) => {
    logError(`Frontend error: ${err.message}`)
  })

  frontend.on('exit', (code) => {
    if (code !== null && code !== 0) {
      logError(`Frontend exited with code ${code}`)
    }
  })

  children.push(frontend)
  return frontend
}

function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

async function main() {
  // Setup signal handlers
  process.on('SIGINT', () => {
    cleanup()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    cleanup()
    process.exit(0)
  })

  process.on('exit', cleanup)

  // Find available ports
  const DEFAULT_BE_PORT = 8080
  const DEFAULT_FE_PORT = 5173

  const bePort = await findAvailablePort(DEFAULT_BE_PORT)
  const fePort = await findAvailablePort(DEFAULT_FE_PORT)

  if (!bePort) {
    logError(`Could not find available port starting from ${DEFAULT_BE_PORT}`)
    process.exit(1)
  }

  if (!fePort) {
    logError(`Could not find available port starting from ${DEFAULT_FE_PORT}`)
    process.exit(1)
  }

  if (bePort !== DEFAULT_BE_PORT) {
    logWarn(`Port ${DEFAULT_BE_PORT} in use, using port ${bePort} for backend`)
  }

  if (fePort !== DEFAULT_FE_PORT) {
    logWarn(`Port ${DEFAULT_FE_PORT} in use, using port ${fePort} for frontend`)
  }

  // Copy production database
  copyDatabase()

  // Get local network IP for display
  const localIP = getLocalIP()

  // Display startup info
  console.log('')
  log('='.repeat(50))
  log('Development servers starting...')
  log('')
  log(`  Frontend (local):   http://localhost:${fePort}`)
  log(`  Frontend (network): http://${localIP}:${fePort}`)
  log(`  Backend (network):  http://${localIP}:${bePort}`)
  log('')
  log(`  API URL for frontend: http://${localIP}:${bePort}`)
  log(`  Using temp DB: ${TEMP_DB_PATH}`)
  log('='.repeat(50))
  console.log('')

  // Start services
  startBackend(bePort)

  // Small delay to let backend start first
  await new Promise(resolve => setTimeout(resolve, 1000))

  startFrontend(bePort, fePort, localIP)
}

main().catch((err) => {
  logError(`Fatal error: ${err.message}`)
  cleanup()
  process.exit(1)
})
