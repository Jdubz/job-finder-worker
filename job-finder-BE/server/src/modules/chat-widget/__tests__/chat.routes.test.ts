import express from 'express'
import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import { buildChatWidgetRouter } from '../chat.routes'

// Mock the chat service
const mockStreamChat = vi.fn()
const mockSpeechToText = vi.fn()
const mockTextToSpeech = vi.fn()

vi.mock('../chat.service', () => ({
  getChatService: vi.fn().mockImplementation(() => ({
    streamChat: mockStreamChat,
    speechToText: mockSpeechToText,
    textToSpeech: mockTextToSpeech,
  })),
}))

// Mock rate limiting to avoid test interference
vi.mock('../../../middleware/rate-limit', () => ({
  rateLimit: vi.fn().mockImplementation(() => (_req: any, _res: any, next: any) => next()),
}))

vi.mock('../../../utils/async-handler', () => ({
  asyncHandler: vi.fn().mockImplementation((handler: any) => handler),
}))

vi.mock('../../../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/chat', buildChatWidgetRouter())
  return app
}

describe('Chat Widget Routes', () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  describe('POST /chat/message', () => {
    it('returns 400 for empty messages array', async () => {
      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [] })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe('INVALID_REQUEST')
    })

    it('returns 400 for invalid message role', async () => {
      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'system', content: 'Hello' }] })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for message content exceeding max length', async () => {
      const longContent = 'a'.repeat(2001)
      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: longContent }] })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for empty message content after trim', async () => {
      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: '   ' }] })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 when exceeding max messages count', async () => {
      const messages = Array.from({ length: 51 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }))

      const res = await request(app)
        .post('/chat/message')
        .send({ messages })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('sets SSE headers for valid request', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Hello'
      })

      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })

      expect(res.headers['content-type']).toContain('text/event-stream')
      expect(res.headers['cache-control']).toBe('no-cache, no-transform')
      expect(res.headers['connection']).toBe('keep-alive')
    })

    it('calls streamChat with valid messages', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Response'
      })

      await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: 'Hello' }] })

      expect(mockStreamChat).toHaveBeenCalledWith([
        { role: 'user', content: 'Hello' },
      ])
    })

    it('trims message content', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Response'
      })

      await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: '  Hello  ' }] })

      expect(mockStreamChat).toHaveBeenCalledWith([
        { role: 'user', content: 'Hello' },
      ])
    })

    it('handles service errors gracefully', async () => {
      // When the generator throws, the route should catch it
      mockStreamChat.mockImplementation(async function* () {
        throw new Error('Service error')
      })

      // Just verify no 500 error is thrown - error is sent as SSE event
      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })

      // The endpoint should still return 200 (errors are sent as SSE events)
      expect(res.status).toBe(200)
    })

    it('streams multiple chunks to client', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Hello'
        yield ' world'
        yield '!'
      })

      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })

      expect(res.status).toBe(200)
      // Response should contain all chunks
      expect(res.text).toContain('data: {"text":"Hello"}')
      expect(res.text).toContain('data: {"text":" world"}')
      expect(res.text).toContain('data: {"text":"!"}')
      expect(res.text).toContain('data: [DONE]')
    })

    it('sends initial SSE comment for Cloudflare compatibility', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Test'
      })

      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })

      // Should start with :ok comment
      expect(res.text).toMatch(/^:ok\n\n/)
    })

    it('completes normally when socket closes after response ends', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Response'
      })

      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [{ role: 'user', content: 'Hi' }] })

      // Normal completion should include DONE
      expect(res.status).toBe(200)
      expect(res.text).toContain('data: [DONE]')
    })
  })

  describe('POST /chat/stt', () => {
    it('returns 400 for missing Content-Type header', async () => {
      const res = await request(app)
        .post('/chat/stt')
        .send(Buffer.from('audio data'))

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe('Invalid audio format')
    })

    it('returns 400 for invalid audio format', async () => {
      const res = await request(app)
        .post('/chat/stt')
        .set('Content-Type', 'text/plain')
        .send(Buffer.from('not audio'))

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe('Invalid audio format')
    })

    it('returns 400 for empty audio data', async () => {
      const res = await request(app)
        .post('/chat/stt')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from(''))

      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe('No audio data provided')
    })

    it('returns transcript for valid audio', async () => {
      mockSpeechToText.mockResolvedValue('Hello world')

      const res = await request(app)
        .post('/chat/stt')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from('fake audio data'))

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.text).toBe('Hello world')
    })

    it('accepts various audio MIME types', async () => {
      mockSpeechToText.mockResolvedValue('Test')

      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']

      for (const mimeType of mimeTypes) {
        const res = await request(app)
          .post('/chat/stt')
          .set('Content-Type', mimeType)
          .send(Buffer.from('audio'))

        expect(res.status).toBe(200)
      }
    })

    it('returns 500 on service failure', async () => {
      mockSpeechToText.mockRejectedValue(new Error('Deepgram error'))

      const res = await request(app)
        .post('/chat/stt')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from('audio data'))

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe('Speech transcription temporarily unavailable')
    })
  })

  describe('POST /chat/tts', () => {
    it('returns 400 for missing text', async () => {
      const res = await request(app)
        .post('/chat/tts')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for empty text after trim', async () => {
      const res = await request(app)
        .post('/chat/tts')
        .send({ text: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for text exceeding max length', async () => {
      const longText = 'a'.repeat(5001)
      const res = await request(app)
        .post('/chat/tts')
        .send({ text: longText })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it('returns audio stream for valid text', async () => {
      const audioData = Buffer.from([1, 2, 3, 4])
      const stream = Readable.from(audioData)
      mockTextToSpeech.mockResolvedValue(stream)

      const res = await request(app)
        .post('/chat/tts')
        .send({ text: 'Hello world' })

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('audio/mpeg')
      expect(res.headers['transfer-encoding']).toBe('chunked')
    })

    it('trims text input', async () => {
      const stream = Readable.from(Buffer.from([1]))
      mockTextToSpeech.mockResolvedValue(stream)

      await request(app)
        .post('/chat/tts')
        .send({ text: '  Hello world  ' })

      expect(mockTextToSpeech).toHaveBeenCalledWith('Hello world')
    })

    it('returns 500 on service failure', async () => {
      mockTextToSpeech.mockRejectedValue(new Error('TTS error'))

      const res = await request(app)
        .post('/chat/tts')
        .send({ text: 'Hello' })

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe('Text-to-speech temporarily unavailable')
    })
  })
})
