import type { Server, IncomingMessage } from 'http'
import { WebSocketServer, type WebSocket, type RawData } from 'ws'
import { logger } from '../../logger'
import { env } from '../../config/env'
import { broadcastQueueEvent, sendCommandToWorker, setWorkerSocket } from './queue-events'
import type { WorkerMessage, WorkerEventName } from '@shared/types'
import { isWorkerEventName } from '@shared/types'

export function initWorkerSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/worker/stream' })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const tokenHeader = req.headers.authorization as string | undefined
    const token = tokenHeader?.startsWith('Bearer ') ? tokenHeader.slice(7) : undefined
    if (env.WORKER_WS_TOKEN && token !== env.WORKER_WS_TOKEN) {
      logger.warn('Worker WS connection rejected: invalid token')
      ws.close(4401, 'unauthorized')
      return
    }

    logger.info('Worker connected via WebSocket')
    setWorkerSocket(ws)

    ws.on('message', (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as WorkerMessage
        if (msg.event && isWorkerEventName(msg.event)) {
          // Extract msg.data (not spread entire msg) to match HTTP handler format
          // Worker sends: { event: "...", data: { queueItem: {...}, workerId: "..." } }
          // FE expects data.queueItem, not data.data.queueItem
          const eventData = msg.data ?? {}
          broadcastQueueEvent(msg.event, { ...eventData, workerId: 'default' } as any)
        } else if (msg.event) {
          logger.debug({ event: msg.event }, 'Unknown worker event received')
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
