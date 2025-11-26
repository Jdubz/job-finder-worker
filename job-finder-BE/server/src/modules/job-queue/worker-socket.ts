import type { Server } from 'http'
import { WebSocketServer } from 'ws'
import { logger } from '../../logger'
import { env } from '../../config/env'
import { broadcastQueueEvent, sendCommandToWorker, setWorkerSocket } from './queue-events'

type WorkerMessage = {
  event: string
  data?: Record<string, unknown>
  itemId?: string
  status?: string
  stage?: string
  message?: string
}

export function initWorkerSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/worker/stream' })

  wss.on('connection', ws => {
    const tokenHeader = (ws as any)._req?.headers?.authorization as string | undefined
    const token = tokenHeader?.startsWith('Bearer ') ? tokenHeader.slice(7) : undefined
    if (env.WORKER_WS_TOKEN && token !== env.WORKER_WS_TOKEN) {
      logger.warn('Worker WS connection rejected: invalid token')
      ws.close(4401, 'unauthorized')
      return
    }

    logger.info('Worker connected via WebSocket')
    setWorkerSocket(ws)

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString()) as WorkerMessage
        if (msg.event) {
          broadcastQueueEvent(msg.event as any, { ...msg, workerId: 'default' })
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to parse worker WS message')
      }
    })

    ws.on('close', () => {
      logger.info('Worker WebSocket disconnected')
      setWorkerSocket(null)
    })
  })

  return {
    sendCancel: (itemId: string, workerId = 'default') =>
      sendCommandToWorker({ command: 'cancel', itemId, workerId, ts: new Date().toISOString() })
  }
}
