#!/usr/bin/env node

/**
 * Dev Server with Port Check
 * 
 * Checks if port 5173 is already in use by a Vite dev server.
 * If yes, uses the existing server. If no, starts a new one.
 */

import { execSync, spawn } from 'child_process'

const PORT = 5173

function checkForExistingServer() {
  try {
    // Check if port is in use
    const result = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' }).trim()
    
    if (result) {
      // Handle multiple PIDs (split by newlines)
      const pids = result.split('\n').filter(pid => pid.trim())
      
      // Check if it's a Vite dev server
      const viteProcesses = pids.filter(pid => {
        try {
          const processInfo = execSync(`ps -p ${pid} -o cmd --no-headers`, { encoding: 'utf8' }).trim()
          return processInfo.includes('vite') || processInfo.includes('node_modules/.bin/vite')
        } catch (e) {
          return false
        }
      })
      
      if (viteProcesses.length > 0) {
        console.log('\n✅ SERVER ALREADY RUNNING')
        console.log(`Port ${PORT} is already in use - using existing server!`)
        console.log(`🎉 Found existing Vite dev server (PID: ${viteProcesses[0]})`)
        console.log(`➜ Server should be available at: http://localhost:${PORT}/`)
        console.log('')
        console.log('💡 TIP: If you need to restart the server, use:')
        console.log('   npm run dev:new')
        console.log('')
        console.log('✅ Using existing server - no need to start a new one!')
        return true // Server already running
      } else {
        console.log('⚠️  Port is in use by non-Vite process')
        console.log('💡 TIP: Use a different port: npm run dev:new -- --port 5174')
        return false
      }
    } else {
      console.log(`✅ Port ${PORT} is available`)
      return false
    }
  } catch (error) {
    // Port is free, continue
    console.log(`✅ Port ${PORT} is available`)
    return false
  }
}

function startViteServer() {
  console.log('🚀 Starting Vite dev server...')
  
  const vite = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true
  })
  
  vite.on('error', (error) => {
    console.error('Failed to start Vite:', error)
    process.exit(1)
  })
  
  vite.on('exit', (code) => {
    process.exit(code)
  })
  
  // Handle process termination
  process.on('SIGINT', () => {
    vite.kill('SIGINT')
  })
  
  process.on('SIGTERM', () => {
    vite.kill('SIGTERM')
  })
}

// Main execution
const serverAlreadyRunning = checkForExistingServer()

if (serverAlreadyRunning) {
  // Server is already running, just exit
  process.exit(0)
} else {
  // Start new server
  startViteServer()
}
