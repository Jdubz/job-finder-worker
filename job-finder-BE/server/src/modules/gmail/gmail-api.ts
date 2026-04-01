import { refreshAccessToken } from "./gmail-oauth"
import type { GmailTokenPayload } from "./gmail-auth.service"

// ---------------------------------------------------------------------------
// Gmail API types
// ---------------------------------------------------------------------------

export type GmailMessage = {
  id: string
  threadId: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    body?: { size?: number; data?: string }
    parts?: GmailPart[]
  }
  snippet?: string
  historyId?: string
}

export type GmailPart = {
  mimeType?: string
  filename?: string
  body?: { size?: number; data?: string }
  parts?: GmailPart[]
}

export type MessageListResult = {
  items: Array<{ id: string; threadId: string; historyId?: string }>
  latestHistoryId?: number
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export async function ensureAccessToken(tokens: GmailTokenPayload): Promise<GmailTokenPayload> {
  if (tokens.access_token && tokens.expiry_date && tokens.expiry_date > Date.now() + 60_000) {
    return tokens
  }
  const refreshed = await refreshAccessToken(tokens.refresh_token)
  return {
    ...tokens,
    access_token: refreshed.access_token,
    expiry_date: Date.now() + refreshed.expires_in * 1000,
    scope: refreshed.scope,
    token_type: refreshed.token_type
  }
}

// ---------------------------------------------------------------------------
// Message fetching
// ---------------------------------------------------------------------------

export async function fetchMessageList(
  accessToken: string,
  q?: string,
  maxResults: number = 200,
  maxPages: number = 10
): Promise<MessageListResult> {
  const items: Array<{ id: string; threadId: string }> = []
  let pageToken: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      maxResults: String(Math.min(maxResults - items.length, 500)),
      includeSpamTrash: "false"
    })
    if (q) params.set("q", q)
    if (pageToken) params.set("pageToken", pageToken)

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gmail list failed: ${res.status} ${text}`)
    }
    const json = (await res.json()) as {
      messages?: Array<{ id: string; threadId: string }>
      nextPageToken?: string
      resultSizeEstimate?: number
    }

    if (json.messages) items.push(...json.messages)
    if (!json.nextPageToken || items.length >= maxResults) break
    pageToken = json.nextPageToken
  }

  return { items, latestHistoryId: undefined }
}

export async function fetchHistoryDelta(
  accessToken: string,
  startHistoryId: string,
  maxResults: number = 50
): Promise<MessageListResult> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
    maxResults: String(maxResults)
  })
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail history failed: ${res.status} ${text}`)
  }
  const json = (await res.json()) as {
    history?: Array<{ id?: string; messagesAdded?: Array<{ message?: { id: string; threadId: string } }> }>
    historyId?: string
  }

  const items: Array<{ id: string; threadId: string; historyId?: string }> = []
  let latest = json.historyId ? Number(json.historyId) : undefined

  for (const h of json.history ?? []) {
    if (h.id) {
      const idNum = Number(h.id)
      if (!Number.isNaN(idNum) && (latest === undefined || idNum > latest)) latest = idNum
    }
    for (const ma of h.messagesAdded ?? []) {
      if (ma.message?.id && ma.message.threadId) {
        items.push({ id: ma.message.id, threadId: ma.message.threadId, historyId: h.id })
      }
    }
  }

  return { items, latestHistoryId: latest }
}

export async function fetchFullMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail get failed: ${res.status} ${text}`)
  }
  return (await res.json()) as GmailMessage
}

export async function fetchFullMessages(
  accessToken: string,
  items: Array<{ id: string; threadId: string }>,
  concurrency = 8
): Promise<GmailMessage[]> {
  const messages: GmailMessage[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const resolved = await Promise.all(batch.map((m) => fetchFullMessage(accessToken, m.id)))
    messages.push(...resolved)
  }
  return messages
}

// ---------------------------------------------------------------------------
// Message parsing helpers
// ---------------------------------------------------------------------------

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(normalized, "base64").toString("utf8")
}

export function extractBody(msg: GmailMessage): string {
  const buffers: string[] = []

  const walk = (p: GmailPart | undefined) => {
    if (!p) return
    const mime = (p.mimeType || "").toLowerCase()
    if (mime === "text/plain" || mime === "text/html" || !p.mimeType) {
      const data = p.body?.data
      if (data) {
        buffers.push(decodeBase64Url(data))
      }
    }
    if (p.parts) p.parts.forEach(walk)
  }

  if (msg.payload) walk(msg.payload as GmailPart)
  if (buffers.length === 0 && msg.snippet) buffers.push(msg.snippet)
  return buffers.join("\n")
}

export function getHeader(msg: GmailMessage, name: string): string | undefined {
  const headers = msg.payload?.headers || []
  const match = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
  return match?.value
}

export function extractSenderDomain(from: string | undefined): string | undefined {
  if (!from) return undefined
  const match = from.match(/@([a-zA-Z0-9.-]+)/)
  return match?.[1]?.toLowerCase()
}
