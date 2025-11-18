#!/usr/bin/env node

/**
 * Port Checker Script
 * 
 * Checks if port 5173 is already in use and provides helpful error messages
 * to prevent automatic port switching and multiple dev servers.
 */

import { execSync } from 'child_process'

const PORT = 5173

function checkPort() {
  try {
    // Check if port is in use
    const result = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' }).trim()
    
    if (result) {
      // Handle multiple PIDs (split by newlines)
      const pids = result.split('\n').filter(pid => pid.trim())
      
      console.log('\n✅ SERVER ALREADY RUNNING')
      console.log(`Port ${PORT} is already in use - using existing server!`)
      
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
        console.log(`🎉 Found existing Vite dev server (PID: ${viteProcesses[0]})`)
        console.log(`➜ Server should be available at: http://localhost:${PORT}/`)
        console.log('')
        console.log('💡 TIP: If you need to restart the server, use:')
        console.log('   npm run dev:new')
        console.log('')
        console.log('✅ Using existing server - no need to start a new one!')
        process.exit(2) // Special exit code to indicate server already running
      } else {
        console.log('⚠️  Port is in use by non-Vite process')
        console.log('💡 TIP: Use a different port: npm run dev:force -- --port 5174')
        process.exit(1)
      }
    } else {
      console.log(`✅ Port ${PORT} is available`)
    }
  } catch (error) {
    // Port is free, continue
    console.log(`✅ Port ${PORT} is available`)
  }
}

checkPort()
