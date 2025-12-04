import type { Server } from 'http'
import type { Socket } from 'net'
import { broadcastLifecycleEvent, setLifecyclePhase } from './lifecycle.stream'
import { logger } from '../../logger'

export function createDrainManager(server: Server) {
  const sockets = new Set<Socket>()

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  const drain = async (timeoutMs = 15000) => {
    setLifecyclePhase('draining', { openSockets: sockets.size })

    // Stop accepting new connections
    server.close()

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn({ openSockets: sockets.size }, 'Force closing lingering sockets after drain timeout')
        sockets.forEach((socket) => socket.destroy())
        broadcastLifecycleEvent('draining.complete', { forced: true, openSockets: sockets.size })
        resolve()
      }, timeoutMs)

      server.on('close', () => {
        clearTimeout(timeout)
        broadcastLifecycleEvent('draining.complete', { forced: false })
        resolve()
      })
    })
  }

  return { drain }
}
