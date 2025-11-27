import type { Response, Request } from 'express'
import { randomUUID } from 'crypto'
import type {
  QueueItem,
  QueueSseEventName,
  QueueSsePayload,
  QueueEventDataMap,
  CancelCommand,
} from '@shared/types'
import type { WebSocket } from 'ws'
import { HEARTBEAT_INTERVAL_MS, initSseStream, type SseClient } from '../shared/sse'

const clients = new Set<SseClient>()
const commandQueue = new Map<string, CancelCommand[]>()
let workerSocket: WebSocket | null = null

const toEventString = <E extends QueueSseEventName>(payload: QueueSsePayload<E>) =>
  `id: ${payload.id}\nevent: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`

export function broadcastQueueEvent<E extends QueueSseEventName>(
  event: E,
  data: E extends keyof QueueEventDataMap ? QueueEventDataMap[E] : Record<string, unknown>
) {
  if (clients.size === 0) return
  const payload: QueueSsePayload<E> = {
    id: randomUUID(),
    event,
    data,
    ts: new Date().toISOString()
  }
  const serialized = toEventString(payload)
  for (const client of clients) {
    client.res.write(serialized)
  }
}

export function handleQueueEventsSse(req: Request, res: Response, items: QueueItem[]) {
  initSseStream(req, res, clients, HEARTBEAT_INTERVAL_MS)

  // Initial retry hint and snapshot
  res.write('retry: 3000\n\n')
  const snapshot: QueueSsePayload<'snapshot'> = {
    id: randomUUID(),
    event: 'snapshot',
    data: { items },
    ts: new Date().toISOString()
  }
  res.write(toEventString(snapshot))
}

export function enqueueCancelCommand(itemId: string, workerId = 'default') {
  const commands = commandQueue.get(workerId) ?? []
  commands.push({
    workerId,
    command: 'cancel',
    itemId,
    ts: new Date().toISOString()
  })
  commandQueue.set(workerId, commands)
}

export function takePendingCommands(workerId = 'default'): CancelCommand[] {
  const commands = commandQueue.get(workerId) ?? []
  commandQueue.set(workerId, [])
  return commands
}

export function setWorkerSocket(ws: WebSocket | null) {
  workerSocket = ws
}

export function sendCommandToWorker(command: CancelCommand) {
  // Send immediately if WS connected; otherwise enqueue for polling fallback
  if (workerSocket && workerSocket.readyState === workerSocket.OPEN) {
    try {
      workerSocket.send(
        JSON.stringify({ event: `command.${command.command}`, itemId: command.itemId, workerId: command.workerId })
      )
      return
    } catch {
      // fall through to enqueue
    }
  }
  const list = commandQueue.get(command.workerId) ?? []
  list.push(command)
  commandQueue.set(command.workerId, list)
}
