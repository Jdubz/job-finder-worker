import type { Response, Request } from 'express'
import { randomUUID } from 'crypto'
import type { QueueItem } from '@shared/types'
import type { WebSocket } from 'ws'

type QueueEventName =
  | 'snapshot'
  | 'item.created'
  | 'item.updated'
  | 'item.deleted'
  | 'item.cancelled'
  | 'progress'
  | 'command.ack'
  | 'command.error'
  | string

type QueueEventPayload = {
  id: string
  event: QueueEventName
  data: Record<string, unknown>
  ts: string
}

type SseClient = {
  id: string
  res: Response
  heartbeat?: NodeJS.Timeout
}

type PendingCommand = {
  workerId: string
  command: 'cancel'
  itemId: string
  ts: string
}

const clients = new Set<SseClient>()
const commandQueue = new Map<string, PendingCommand[]>()
let workerSocket: WebSocket | null = null

const toEventString = (payload: QueueEventPayload) =>
  `id: ${payload.id}\nevent: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`

export function broadcastQueueEvent(event: QueueEventName, data: Record<string, unknown>) {
  if (clients.size === 0) return
  const payload: QueueEventPayload = {
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
  const clientId = randomUUID()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // Initial retry hint and snapshot
  res.write('retry: 3000\n\n')
  const snapshot: QueueEventPayload = {
    id: randomUUID(),
    event: 'snapshot',
    data: { items },
    ts: new Date().toISOString()
  }
  res.write(toEventString(snapshot))

  const heartbeat = setInterval(() => {
    res.write(':\n\n')
  }, 15000)

  const client: SseClient = { id: clientId, res, heartbeat }
  clients.add(client)

  req.on('close', () => {
    clients.delete(client)
    clearInterval(heartbeat)
    res.end()
  })
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

export function takePendingCommands(workerId = 'default'): PendingCommand[] {
  const commands = commandQueue.get(workerId) ?? []
  commandQueue.set(workerId, [])
  return commands
}

export function setWorkerSocket(ws: WebSocket | null) {
  workerSocket = ws
}

export function sendCommandToWorker(command: PendingCommand) {
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
