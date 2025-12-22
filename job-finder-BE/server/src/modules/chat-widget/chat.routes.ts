import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { rateLimit } from '../../middleware/rate-limit'
import { getChatService } from './chat.service'
import { ApiErrorCode } from '@shared/types'

// Allowed MIME types for audio upload
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/wav',
  'audio/mpeg',
]

// Validation schemas with input sanitization
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
})

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
})

const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(5000),
})

export function buildChatWidgetRouter() {
  const router = Router()

  // Rate limit: 30 requests per minute per IP
  const chatRateLimit = rateLimit({ windowMs: 60_000, max: 30 })

  /**
   * POST /api/chat/message
   * Stream a chat response from Claude
   * Body: { messages: [{ role: 'user' | 'assistant', content: string }...] }
   * Returns: SSE stream of text chunks
   */
  router.post(
    '/message',
    chatRateLimit,
    asyncHandler(async (req, res) => {
      const parseResult = chatRequestSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json(
          failure(ApiErrorCode.INVALID_REQUEST, 'Invalid request', {
            errors: parseResult.error.flatten().fieldErrors,
          })
        )
        return
      }

      const { messages } = parseResult.data

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders?.()

      // Track client disconnect
      let clientDisconnected = false
      req.on('close', () => {
        clientDisconnected = true
      })

      try {
        const service = getChatService()

        for await (const chunk of service.streamChat(messages)) {
          if (clientDisconnected) break
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
        }

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n')
        }
        res.end()
      } catch (error) {
        if (!clientDisconnected) {
          // Send error as SSE event
          res.write(
            `data: ${JSON.stringify({ error: 'Chat service temporarily unavailable' })}\n\n`
          )
        }
        res.end()
      }
    })
  )

  /**
   * POST /api/chat/stt
   * Convert speech to text using Deepgram
   * Body: raw audio data (audio/webm or audio/wav)
   * Returns: { success: true, data: { text: string } }
   */
  router.post(
    '/stt',
    chatRateLimit,
    asyncHandler(async (req, res) => {
      // Validate Content-Type
      const contentType = req.headers['content-type']?.split(';')[0]?.trim()
      if (!contentType || !ALLOWED_AUDIO_TYPES.some((t) => t.startsWith(contentType))) {
        res
          .status(400)
          .json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid audio format'))
        return
      }

      // Collect raw audio data from request body
      const chunks: Buffer[] = []

      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => resolve())
        req.on('error', reject)
      })

      const audioBuffer = Buffer.concat(chunks)

      if (audioBuffer.length === 0) {
        res
          .status(400)
          .json(failure(ApiErrorCode.INVALID_REQUEST, 'No audio data provided'))
        return
      }

      // Limit audio size to 10MB
      if (audioBuffer.length > 10 * 1024 * 1024) {
        res
          .status(400)
          .json(failure(ApiErrorCode.INVALID_REQUEST, 'Audio file too large'))
        return
      }

      try {
        const service = getChatService()
        const text = await service.speechToText(audioBuffer)
        res.json(success({ text }))
      } catch (error) {
        res
          .status(500)
          .json(
            failure(
              ApiErrorCode.INTERNAL_ERROR,
              'Speech transcription temporarily unavailable'
            )
          )
      }
    })
  )

  /**
   * POST /api/chat/tts
   * Convert text to speech using Deepgram
   * Body: { text: string }
   * Returns: audio/mpeg stream
   */
  router.post(
    '/tts',
    chatRateLimit,
    asyncHandler(async (req, res) => {
      const parseResult = ttsRequestSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json(
          failure(ApiErrorCode.INVALID_REQUEST, 'Invalid request', {
            errors: parseResult.error.flatten().fieldErrors,
          })
        )
        return
      }

      const { text } = parseResult.data

      try {
        const service = getChatService()
        const audioStream = await service.textToSpeech(text)

        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Transfer-Encoding', 'chunked')

        audioStream.pipe(res)
      } catch (error) {
        res
          .status(500)
          .json(
            failure(
              ApiErrorCode.INTERNAL_ERROR,
              'Text-to-speech temporarily unavailable'
            )
          )
      }
    })
  )

  return router
}
