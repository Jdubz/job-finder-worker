import { randomUUID } from 'crypto'
import type { Request, Response } from 'express'

export type SseClient = {
  id: string
  res: Response
  heartbeat?: NodeJS.Timeout
}

export const HEARTBEAT_INTERVAL_MS = 15_000

/**
 * Configure an Express response for Server-Sent Events and register the client.
 *
 * Sets the standard SSE headers, starts a heartbeat, and cleans up on disconnect.
 */
export function initSseStream(
  req: Request,
  res: Response,
  clients: Set<SseClient>,
  heartbeatMs = HEARTBEAT_INTERVAL_MS
): SseClient {
  const clientId = randomUUID()

  // Set Cloudflare-compatible SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // For Nginx
  res.flushHeaders?.()

  const heartbeat = setInterval(() => {
    res.write(':\n\n')
  }, heartbeatMs)

  const client: SseClient = { id: clientId, res, heartbeat }
  clients.add(client)

  req.on('close', () => {
    clients.delete(client)
    clearInterval(heartbeat)
    res.end()
  })

  return client
}

/**
 * Broadcast a serialized SSE payload to all connected clients.
 * Wraps each write in try/catch — dead clients are pruned from the Set.
 */
export function safeBroadcast(clients: Set<SseClient>, serialized: string): void {
  for (const client of clients) {
    try {
      client.res.write(serialized)
    } catch {
      // Client disconnected — clean up
      if (client.heartbeat) clearInterval(client.heartbeat)
      clients.delete(client)
    }
  }
}
