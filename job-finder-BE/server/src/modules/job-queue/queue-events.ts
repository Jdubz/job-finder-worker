import type { Response, Request } from 'express'
import { randomUUID } from 'crypto'
import type {
  QueueItem,
  QueueSseEventName,
  QueueSsePayload,
  QueueEventDataMap,
  CancelCommand,
} from '@shared/types'
import { logger } from '../../logger'
import type { WebSocket } from 'ws'
import { HEARTBEAT_INTERVAL_MS, initSseStream, type SseClient } from '../shared/sse'

const clients = new Set<SseClient>()
const commandQueue = new Map<string, CancelCommand[]>()
let workerSocket: WebSocket | null = null

const MAX_STRING_LENGTH = 2000
const DROP_KEY_SET = new Set([
  'raw_html',
  'raw',
  'raw_listing',
  'full_text',
  'html',
  'description',
])

const toEventString = <E extends QueueSseEventName>(payload: QueueSsePayload<E>) =>
  `id: ${payload.id}\nevent: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`

// ---------------------------------------------------------------------------
// Payload sanitizers (reduce SSE size; avoid giant job descriptions)
// ---------------------------------------------------------------------------

function sanitizeQueueItem(item: QueueItem): QueueItem {
  const beforeSize = byteLengthSafe(item)
  const clone: QueueItem = { ...item }

  const sanitizeUnknown = (value: unknown): unknown => {
    if (!value) return value

    if (typeof value === 'string') {
      return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value
    }

    if (Array.isArray(value)) {
      return value.map(sanitizeUnknown)
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(value)) {
        if (DROP_KEY_SET.has(key)) continue

        // Drop especially heavy nested fields we never need in SSE
        if (key === 'description' || key === 'raw_html' || key === 'full_text') continue

        if (typeof val === 'string' && val.length > MAX_STRING_LENGTH) {
          result[key] = `${val.slice(0, MAX_STRING_LENGTH)}…`
          continue
        }
        result[key] = sanitizeUnknown(val)
      }
      return result
    }

    return value
  }

  if (clone.pipeline_state) clone.pipeline_state = sanitizeUnknown(clone.pipeline_state) as any
  // Ensure we drop bulky descriptions in known locations
  if ((clone.pipeline_state as any)?.job_data) {
    delete (clone.pipeline_state as any).job_data.description
    delete (clone.pipeline_state as any).job_data.full_text
    delete (clone.pipeline_state as any).job_data.raw_html
  }
  if (clone.scraped_data) clone.scraped_data = sanitizeUnknown(clone.scraped_data) as any
  if ((clone.scraped_data as any)?.description) delete (clone.scraped_data as any).description
  if ((clone as any).input) (clone as any).input = sanitizeUnknown((clone as any).input) as any
  if (clone.metadata) clone.metadata = sanitizeUnknown(clone.metadata) as any

  const afterSize = byteLengthSafe(clone)
  if (afterSize < beforeSize) {
    logger.debug(
      {
        itemId: item.id,
        sizeBefore: beforeSize,
        sizeAfter: afterSize,
      },
      'Sanitized queue item payload for SSE'
    )
  }

  return clone
}

function sanitizeEventData<E extends QueueSseEventName>(
  event: E,
  data: E extends keyof QueueEventDataMap ? QueueEventDataMap[E] : Record<string, unknown>
): E extends keyof QueueEventDataMap ? QueueEventDataMap[E] : Record<string, unknown> {
  if (event === 'snapshot' && 'items' in (data as any)) {
    return {
      ...(data as any),
      items: (data as any).items.map((item: QueueItem) => sanitizeQueueItem(item)),
    } as any
  }

  if (event === 'item.created' || event === 'item.updated') {
    return {
      ...(data as any),
      queueItem: sanitizeQueueItem((data as any).queueItem),
    }
  }

  return data
}

function byteLengthSafe(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return 0
  }
}

export function broadcastQueueEvent<E extends QueueSseEventName>(
  event: E,
  data: E extends keyof QueueEventDataMap ? QueueEventDataMap[E] : Record<string, unknown>
) {
  if (clients.size === 0) return
  const safeData = sanitizeEventData(event, data)
  const payload: QueueSsePayload<E> = {
    id: randomUUID(),
    event,
    data: safeData,
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
    data: sanitizeEventData('snapshot', { items }),
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
