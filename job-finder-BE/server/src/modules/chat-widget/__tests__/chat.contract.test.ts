import express from 'express'
import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import { buildChatWidgetRouter } from '../chat.routes'
import {
  chatMessageRequestSchema,
  ttsRequestSchema,
  sttResponseSchema,
  chatStreamEventSchema,
  CHAT_CONSTRAINTS,
  ALLOWED_AUDIO_TYPES,
} from '@shared/types'

// Mock the chat service with controlled responses
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

vi.mock('../../../middleware/rate-limit', () => ({
  rateLimit: vi.fn().mockImplementation(() => (_req: any, _res: any, next: any) => next()),
}))

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/chat', buildChatWidgetRouter())
  return app
}

describe('Chat Widget API Contract Tests', () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = createApp()
  })

  describe('Request validation contracts', () => {
    describe('POST /chat/message request schema', () => {
      it('accepts valid request matching chatMessageRequestSchema', async () => {
        const validRequest = {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
          ],
        }

        // Verify request matches schema
        const parseResult = chatMessageRequestSchema.safeParse(validRequest)
        expect(parseResult.success).toBe(true)

        mockStreamChat.mockImplementation(async function* () {
          yield 'Response'
        })

        const res = await request(app)
          .post('/chat/message')
          .send(validRequest)

        expect(res.status).toBe(200)
      })

      it('enforces MAX_MESSAGE_LENGTH constraint', () => {
        const maxLength = CHAT_CONSTRAINTS.MAX_MESSAGE_LENGTH
        const validContent = 'a'.repeat(maxLength)
        const invalidContent = 'a'.repeat(maxLength + 1)

        const validParse = chatMessageRequestSchema.safeParse({
          messages: [{ role: 'user', content: validContent }],
        })
        expect(validParse.success).toBe(true)

        const invalidParse = chatMessageRequestSchema.safeParse({
          messages: [{ role: 'user', content: invalidContent }],
        })
        expect(invalidParse.success).toBe(false)
      })

      it('enforces MAX_MESSAGES constraint', () => {
        const maxMessages = CHAT_CONSTRAINTS.MAX_MESSAGES
        const validMessages = Array.from({ length: maxMessages }, (_, i) => ({
          role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
          content: `Message ${i}`,
        }))
        const invalidMessages = Array.from({ length: maxMessages + 1 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
          content: `Message ${i}`,
        }))

        const validParse = chatMessageRequestSchema.safeParse({ messages: validMessages })
        expect(validParse.success).toBe(true)

        const invalidParse = chatMessageRequestSchema.safeParse({ messages: invalidMessages })
        expect(invalidParse.success).toBe(false)
      })

      it('enforces role enum constraint', () => {
        const validParse = chatMessageRequestSchema.safeParse({
          messages: [{ role: 'user', content: 'Hi' }],
        })
        expect(validParse.success).toBe(true)

        const invalidParse = chatMessageRequestSchema.safeParse({
          messages: [{ role: 'system', content: 'Hi' }],
        })
        expect(invalidParse.success).toBe(false)
      })

      it('trims whitespace from content', () => {
        const result = chatMessageRequestSchema.safeParse({
          messages: [{ role: 'user', content: '  Hello  ' }],
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.messages[0].content).toBe('Hello')
        }
      })
    })

    describe('POST /chat/tts request schema', () => {
      it('accepts valid request matching ttsRequestSchema', async () => {
        const validRequest = { text: 'Hello world' }

        const parseResult = ttsRequestSchema.safeParse(validRequest)
        expect(parseResult.success).toBe(true)

        const stream = Readable.from(Buffer.from([1, 2, 3]))
        mockTextToSpeech.mockResolvedValue(stream)

        const res = await request(app)
          .post('/chat/tts')
          .send(validRequest)

        expect(res.status).toBe(200)
      })

      it('enforces MAX_TTS_LENGTH constraint', () => {
        const maxLength = CHAT_CONSTRAINTS.MAX_TTS_LENGTH
        const validText = 'a'.repeat(maxLength)
        const invalidText = 'a'.repeat(maxLength + 1)

        const validParse = ttsRequestSchema.safeParse({ text: validText })
        expect(validParse.success).toBe(true)

        const invalidParse = ttsRequestSchema.safeParse({ text: invalidText })
        expect(invalidParse.success).toBe(false)
      })

      it('trims whitespace from text', () => {
        const result = ttsRequestSchema.safeParse({ text: '  Hello  ' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.text).toBe('Hello')
        }
      })
    })

    describe('POST /chat/stt audio constraints', () => {
      it('accepts all ALLOWED_AUDIO_TYPES', async () => {
        mockSpeechToText.mockResolvedValue('Transcript')

        for (const mimeType of ALLOWED_AUDIO_TYPES) {
          // Split off codec info for Content-Type header
          const contentType = mimeType.split(';')[0]

          const res = await request(app)
            .post('/chat/stt')
            .set('Content-Type', contentType)
            .send(Buffer.from('audio'))

          expect(res.status).toBe(200)
        }
      })

      it('rejects audio types not in ALLOWED_AUDIO_TYPES', async () => {
        const invalidTypes = ['video/mp4', 'image/png', 'text/plain', 'application/json']

        for (const mimeType of invalidTypes) {
          const res = await request(app)
            .post('/chat/stt')
            .set('Content-Type', mimeType)
            .send(Buffer.from('data'))

          expect(res.status).toBe(400)
        }
      })
    })
  })

  describe('Response schema contracts', () => {
    describe('SSE stream events', () => {
      it('validates text event schema structure', () => {
        // Verify the schema correctly validates text events
        const validTextEvent = { text: 'Hello' }
        const parseResult = chatStreamEventSchema.safeParse(validTextEvent)
        expect(parseResult.success).toBe(true)
      })

      it('validates error event schema structure', () => {
        // Verify the schema correctly validates error events
        const validErrorEvent = { error: 'Service unavailable' }
        const parseResult = chatStreamEventSchema.safeParse(validErrorEvent)
        expect(parseResult.success).toBe(true)
      })

      it('allows both text and error fields', () => {
        // Schema allows optional fields
        const emptyEvent = {}
        const parseResult = chatStreamEventSchema.safeParse(emptyEvent)
        expect(parseResult.success).toBe(true)
      })

      it('returns SSE content-type header', async () => {
        mockStreamChat.mockImplementation(async function* () {
          yield 'Hello'
        })

        const res = await request(app)
          .post('/chat/message')
          .send({ messages: [{ role: 'user', content: 'Hi' }] })

        expect(res.headers['content-type']).toContain('text/event-stream')
      })
    })

    describe('STT response', () => {
      it('response matches sttResponseSchema', async () => {
        mockSpeechToText.mockResolvedValue('Hello world')

        const res = await request(app)
          .post('/chat/stt')
          .set('Content-Type', 'audio/webm')
          .send(Buffer.from('audio'))

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)

        // Validate the data portion matches the schema
        const parseResult = sttResponseSchema.safeParse(res.body.data)
        expect(parseResult.success).toBe(true)
      })

      it('handles empty transcript', async () => {
        mockSpeechToText.mockResolvedValue('')

        const res = await request(app)
          .post('/chat/stt')
          .set('Content-Type', 'audio/webm')
          .send(Buffer.from('silence'))

        expect(res.status).toBe(200)
        const parseResult = sttResponseSchema.safeParse(res.body.data)
        expect(parseResult.success).toBe(true)
        expect(res.body.data.text).toBe('')
      })
    })

    describe('TTS response', () => {
      it('returns audio/mpeg content type', async () => {
        const stream = Readable.from(Buffer.from([1, 2, 3, 4]))
        mockTextToSpeech.mockResolvedValue(stream)

        const res = await request(app)
          .post('/chat/tts')
          .send({ text: 'Hello' })

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toBe('audio/mpeg')
      })

      it('uses chunked transfer encoding for streaming', async () => {
        const stream = Readable.from(Buffer.from([1, 2, 3, 4]))
        mockTextToSpeech.mockResolvedValue(stream)

        const res = await request(app)
          .post('/chat/tts')
          .send({ text: 'Hello' })

        expect(res.headers['transfer-encoding']).toBe('chunked')
      })
    })
  })

  describe('API error response contract', () => {
    it('validation errors return consistent error structure', async () => {
      const res = await request(app)
        .post('/chat/message')
        .send({ messages: [] })

      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: expect.any(String),
        },
      })
    })

    it('service errors return consistent error structure', async () => {
      mockSpeechToText.mockRejectedValue(new Error('Service error'))

      const res = await request(app)
        .post('/chat/stt')
        .set('Content-Type', 'audio/webm')
        .send(Buffer.from('audio'))

      expect(res.status).toBe(500)
      expect(res.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: expect.any(String),
        },
      })
    })
  })
})
