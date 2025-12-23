import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamChat, speechToText, textToSpeech } from '../chat-client'
import type { ChatMessage } from '@shared/types'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock API config
vi.mock('@/config/api', () => ({
  API_CONFIG: {
    baseUrl: 'https://api.test.com',
  },
}))

describe('chat-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('streamChat', () => {
    it('streams text chunks from SSE response', async () => {
      const sseData = [
        'data: {"text":"Hello"}\n\n',
        'data: {"text":" world"}\n\n',
        'data: [DONE]\n\n',
      ].join('')

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        },
      })

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      })

      const chunks: string[] = []
      const result = await streamChat(
        [{ role: 'user', content: 'Hi' }],
        (chunk) => chunks.push(chunk)
      )

      expect(chunks).toEqual(['Hello', ' world'])
      expect(result).toBe('Hello world')
    })

    it('calls API with correct parameters', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      mockFetch.mockResolvedValue({ ok: true, body: stream })

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]

      await streamChat(messages, () => {})

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/chat/message',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
          credentials: 'include',
        })
      )
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(
        streamChat([{ role: 'user', content: 'Hi' }], () => {})
      ).rejects.toThrow('Chat request failed')
    })

    it('throws error when response has no body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      })

      await expect(
        streamChat([{ role: 'user', content: 'Hi' }], () => {})
      ).rejects.toThrow('No response body')
    })

    it('throws on SSE error events', async () => {
      // The implementation now properly throws errors received from the server
      // while still handling malformed JSON gracefully
      const sseData = 'data: {"error":"Service unavailable"}\n\n'
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData))
          controller.close()
        },
      })

      mockFetch.mockResolvedValue({ ok: true, body: stream })

      // The function should throw the error from the SSE event
      await expect(
        streamChat([{ role: 'user', content: 'Hi' }], () => {})
      ).rejects.toThrow('Service unavailable')
    })

    it('handles chunked SSE data correctly', async () => {
      // Simulate data arriving in multiple chunks
      const encoder = new TextEncoder()
      let chunkIndex = 0
      const chunks = [
        'data: {"te',
        'xt":"Hel',
        'lo"}\n\ndata: {"text":" wor',
        'ld"}\n\ndata: [DONE]\n\n',
      ]

      const stream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < chunks.length) {
            controller.enqueue(encoder.encode(chunks[chunkIndex]))
            chunkIndex++
          } else {
            controller.close()
          }
        },
      })

      mockFetch.mockResolvedValue({ ok: true, body: stream })

      const receivedChunks: string[] = []
      await streamChat([{ role: 'user', content: 'Hi' }], (chunk) => {
        receivedChunks.push(chunk)
      })

      expect(receivedChunks).toEqual(['Hello', ' world'])
    })

    it('ignores malformed JSON in SSE', async () => {
      const sseData = [
        'data: not valid json\n\n',
        'data: {"text":"Valid"}\n\n',
        'data: [DONE]\n\n',
      ].join('')

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData))
          controller.close()
        },
      })

      mockFetch.mockResolvedValue({ ok: true, body: stream })

      const chunks: string[] = []
      await streamChat([{ role: 'user', content: 'Hi' }], (chunk) => {
        chunks.push(chunk)
      })

      expect(chunks).toEqual(['Valid'])
    })

    it('respects abort signal', async () => {
      const controller = new AbortController()

      mockFetch.mockImplementation(() => {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      })

      controller.abort()

      await expect(
        streamChat([{ role: 'user', content: 'Hi' }], () => {}, controller.signal)
      ).rejects.toThrow()
    })
  })

  describe('speechToText', () => {
    it('returns transcript from API response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { text: 'Hello world' } }),
      })

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })
      const result = await speechToText(audioBlob)

      expect(result).toBe('Hello world')
    })

    it('calls API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { text: '' } }),
      })

      const audioBlob = new Blob(['audio'], { type: 'audio/webm' })
      await speechToText(audioBlob)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/chat/stt',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'audio/webm' },
          body: audioBlob,
          credentials: 'include',
        })
      )
    })

    it('uses default MIME type when blob type is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { text: '' } }),
      })

      const audioBlob = new Blob(['audio'])
      await speechToText(audioBlob)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'audio/webm' },
        })
      )
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
      })

      const audioBlob = new Blob(['audio'], { type: 'audio/webm' })

      await expect(speechToText(audioBlob)).rejects.toThrow(
        'Speech-to-text request failed'
      )
    })

    it('returns empty string when no text in response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      })

      const audioBlob = new Blob(['silence'], { type: 'audio/webm' })
      const result = await speechToText(audioBlob)

      expect(result).toBe('')
    })

    it('respects abort signal', async () => {
      const controller = new AbortController()

      mockFetch.mockImplementation(() => {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      })

      controller.abort()

      await expect(
        speechToText(new Blob(['audio'], { type: 'audio/webm' }), controller.signal)
      ).rejects.toThrow()
    })
  })

  describe('textToSpeech', () => {
    it('returns audio blob from API response', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4])
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' })

      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(audioBlob),
      })

      const result = await textToSpeech('Hello world')

      expect(result).toBeInstanceOf(Blob)
    })

    it('calls API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      })

      await textToSpeech('Test text')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/chat/tts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Test text' }),
          credentials: 'include',
        })
      )
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(textToSpeech('Hello')).rejects.toThrow(
        'Text-to-speech request failed'
      )
    })

    it('respects abort signal', async () => {
      const controller = new AbortController()

      mockFetch.mockImplementation(() => {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      })

      controller.abort()

      await expect(textToSpeech('Hello', controller.signal)).rejects.toThrow()
    })
  })

  describe('timeout behavior', () => {
    it('creates timeout signal for chat requests', async () => {
      // Verify that fetch is called with a signal that can be aborted
      mockFetch.mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          },
        }),
      })

      await streamChat([{ role: 'user', content: 'Hi' }], () => {})

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('creates timeout signal for STT requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { text: '' } }),
      })

      await speechToText(new Blob(['audio'], { type: 'audio/webm' }))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('creates timeout signal for TTS requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      })

      await textToSpeech('Hello')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })
  })
})
