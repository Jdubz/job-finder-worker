import { API_CONFIG } from '@/config/api'
import type { ChatMessage } from '@shared/types'

export type { ChatMessage }

// Request timeout in milliseconds
const CHAT_TIMEOUT = 60_000 // 60 seconds for streaming chat
const STT_TIMEOUT = 30_000 // 30 seconds for speech-to-text
const TTS_TIMEOUT = 30_000 // 30 seconds for text-to-speech

/**
 * Create an AbortSignal that times out after the specified duration
 * Combines with an optional external signal
 */
function createTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Request timeout'))
  }, timeoutMs)

  // If external signal aborts, abort ours too
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason)
    } else {
      externalSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId)
        controller.abort(externalSignal.reason)
      })
    }
  }

  // Clean up timeout when signal aborts
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId)
  })

  return controller.signal
}


/**
 * Stream a chat response from the backend
 * Calls the onChunk callback for each text chunk received
 * Returns the complete response text when done
 */
export async function streamChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const timeoutSignal = createTimeoutSignal(CHAT_TIMEOUT, signal)

  const response = await fetch(`${API_CONFIG.baseUrl}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    credentials: 'include',
    signal: timeoutSignal,
  })

  if (!response.ok) {
    throw new Error('Chat request failed')
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process SSE events (data: {...}\n\n format)
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue

      const data = line.slice(6) // Remove 'data: ' prefix
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        if (parsed.text) {
          fullText += parsed.text
          onChunk(parsed.text)
        }
        if (parsed.error) {
          throw new Error(parsed.error)
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return fullText
}

/**
 * Convert audio blob to text using Deepgram STT
 */
export async function speechToText(audioBlob: Blob, signal?: AbortSignal): Promise<string> {
  const timeoutSignal = createTimeoutSignal(STT_TIMEOUT, signal)

  const response = await fetch(`${API_CONFIG.baseUrl}/chat/stt`, {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
    body: audioBlob,
    credentials: 'include',
    signal: timeoutSignal,
  })

  if (!response.ok) {
    throw new Error('Speech-to-text request failed')
  }

  const result = await response.json()
  return result.data?.text || ''
}

/**
 * Convert text to speech audio using Deepgram TTS
 * Returns an audio blob that can be played
 */
export async function textToSpeech(
  text: string,
  signal?: AbortSignal
): Promise<Blob> {
  const timeoutSignal = createTimeoutSignal(TTS_TIMEOUT, signal)

  const response = await fetch(`${API_CONFIG.baseUrl}/chat/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    credentials: 'include',
    signal: timeoutSignal,
  })

  if (!response.ok) {
    throw new Error('Text-to-speech request failed')
  }

  return response.blob()
}
