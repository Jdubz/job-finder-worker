// @ts-nocheck
/**
 * Vite Plugin: Port Checker
 * 
 * Provides helpful error messages when the default port is already in use
 * and prevents automatic port switching.
 */

import type { Plugin } from 'vite'
import { execSync } from 'child_process'

interface PortCheckerOptions {
  port: number
  projectName: string
}

export function portChecker(options: PortCheckerOptions): Plugin {
  return {
    name: 'port-checker',
    configureServer(server) {
      const { port } = options
      
      server.middlewares.use('/__port-check', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            // Check if port is in use
            const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim()
            if (result) {
              // Get process info
              const processInfo = execSync(`ps -p ${result} -o pid,ppid,cmd --no-headers`, { encoding: 'utf8' }).trim()
              
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({
                portInUse: true,
                pid: result,
                processInfo,
                message: `Port ${port} is already in use by another process. Please stop the existing server first.`
              }))
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ portInUse: false }))
            }
          } catch (_error) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ portInUse: false }))
          }
        } else {
          next()
        }
      })
    },
    buildStart() {
      // Check port on startup
      try {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim()
        if (result) {
          const processInfo = execSync(`ps -p ${result} -o pid,ppid,cmd --no-headers`, { encoding: 'utf8' }).trim()
          
          console.error('\n❌ PORT CONFLICT DETECTED')
          console.error(`Port ${port} is already in use by another process:`)
          console.error(`PID: ${result}`)
          console.error(`Process: ${processInfo}`)
          console.error('\n🔧 SOLUTIONS:')
          console.error(`1. Kill the existing process: kill ${result}`)
          console.error(`2. Or find and stop the other ${projectName} dev server`)
          console.error(`3. Or use a different port: npm run dev -- --port 5174`)
          console.error('\n💡 TIP: Check for multiple dev servers running:')
          console.error('   ps aux | grep -E "(vite|npm.*dev)" | grep -v grep')
          console.error('')
          
          process.exit(1)
        }
      } catch (_error) {
        // Port is free, continue
      }
    }
  }
}
