import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { logger } from '../../logger'
import { HEARTBEAT_INTERVAL_MS, initSseStream, safeBroadcast, type SseClient } from '../shared/sse'

type LifecycleEventName = 'restarting' | 'ready' | 'draining.start' | 'draining.complete' | 'status'

type LifecyclePayload = {
  id: string
  event: LifecycleEventName
  data: Record<string, unknown>
  ts: string
}

type ServerPhase = 'starting' | 'ready' | 'draining' | 'restarting'

const clients = new Set<SseClient>()
let phase: ServerPhase = 'starting'
let ready = false

const serializeEvent = (payload: LifecyclePayload) =>
  `id: ${payload.id}\nevent: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`

const baseStatus = () => ({
  phase,
  ready,
  since: new Date().toISOString(),
})

export function broadcastLifecycleEvent(event: LifecycleEventName, data: Record<string, unknown> = {}) {
  if (event === 'status' && data.phase) {
    phase = data.phase as ServerPhase
  }

  const payload: LifecyclePayload = {
    id: randomUUID(),
    event,
    data,
    ts: new Date().toISOString(),
  }

  const serialized = serializeEvent(payload)
  safeBroadcast(clients, serialized)
}

export function setLifecyclePhase(next: ServerPhase, data: Record<string, unknown> = {}) {
  phase = next
  const payload = { ...baseStatus(), ...data }
  broadcastLifecycleEvent('status', payload)
  if (next === 'draining') {
    broadcastLifecycleEvent('draining.start', payload)
  }
  if (next === 'ready') {
    broadcastLifecycleEvent('ready', payload)
  }
}

export function handleLifecycleEventsSse(req: Request, res: Response) {
  initSseStream(req, res, clients, HEARTBEAT_INTERVAL_MS)

  // Faster client retries on disconnect
  res.write('retry: 1500\n\n')

  // Immediately send current status
  const snapshot: LifecyclePayload = {
    id: randomUUID(),
    event: 'status',
    data: baseStatus(),
    ts: new Date().toISOString(),
  }
  res.write(serializeEvent(snapshot))
}

export function getLifecyclePhase(): ServerPhase {
  return phase
}

export function setReady(isReady: boolean, data: Record<string, unknown> = {}) {
  ready = isReady
  broadcastLifecycleEvent('status', { ...baseStatus(), ...data })
}

export function isReady(): boolean {
  return ready
}

process.on('uncaughtException', (error) => {
  // Extra console for CI visibility when pino redacts
  console.error('UNCaught exception', error)
  logger.error({ error, stack: error.stack }, 'Uncaught exception - broadcasting restart')
  setLifecyclePhase('restarting', { reason: 'uncaughtException' })
  broadcastLifecycleEvent('restarting', { reason: 'uncaughtException' })
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection - broadcasting restart')
  setLifecyclePhase('restarting', { reason: 'unhandledRejection' })
  broadcastLifecycleEvent('restarting', { reason: 'unhandledRejection' })
})
