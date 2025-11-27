import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { logger } from '../../logger'

type LifecycleEventName = 'restarting' | 'ready' | 'draining.start' | 'draining.complete' | 'status'

type LifecyclePayload = {
  id: string
  event: LifecycleEventName
  data: Record<string, unknown>
  ts: string
}

type Client = {
  id: string
  res: Response
  heartbeat?: NodeJS.Timeout
}

type ServerPhase = 'starting' | 'ready' | 'draining' | 'restarting'

const clients = new Set<Client>()
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
  for (const client of clients) {
    client.res.write(serialized)
  }
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
  const clientId = randomUUID()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

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

  const heartbeat = setInterval(() => {
    res.write(':\n\n')
  }, 15000)

  const client: Client = { id: clientId, res, heartbeat }
  clients.add(client)

  req.on('close', () => {
    clients.delete(client)
    clearInterval(heartbeat)
    res.end()
  })
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
  logger.error({ error }, 'Uncaught exception - broadcasting restart')
  setLifecyclePhase('restarting', { reason: 'uncaughtException' })
  broadcastLifecycleEvent('restarting', { reason: 'uncaughtException' })
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection - broadcasting restart')
  setLifecyclePhase('restarting', { reason: 'unhandledRejection' })
  broadcastLifecycleEvent('restarting', { reason: 'unhandledRejection' })
})
