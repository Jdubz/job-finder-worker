import { Router } from 'express'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { rateLimit } from '../../middleware/rate-limit'
import { getChatService } from './chat.service'
import {
  ApiErrorCode,
  ALLOWED_AUDIO_TYPES,
  CHAT_CONSTRAINTS,
  chatMessageRequestSchema,
  ttsRequestSchema,
} from '@shared/types'

export function buildChatWidgetRouter() {
  const router = Router()

  // Rate limit based on shared constraints
  const chatRateLimit = rateLimit({
    windowMs: 60_000,
    max: CHAT_CONSTRAINTS.RATE_LIMIT_PER_MINUTE,
  })

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
      const parseResult = chatMessageRequestSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json(
          failure(ApiErrorCode.INVALID_REQUEST, 'Invalid request', {
            errors: parseResult.error.flatten().fieldErrors,
          })
        )
        return
      }

      const { messages } = parseResult.data

      // Set up SSE headers with Cloudflare-compatible settings
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no') // For Nginx
      res.flushHeaders?.()

      // Send initial comment to trigger streaming through Cloudflare
      res.write(':ok\n\n')

      // Track client disconnect via socket (not req.close which fires when body stream ends)
      let clientDisconnected = false
      req.socket?.on('close', () => {
        clientDisconnected = true
      })

      // Also track if response is destroyed before completion
      res.on('close', () => {
        if (!res.writableEnded) {
          clientDisconnected = true
        }
      })

      try {
        const service = getChatService()

        for await (const chunk of service.streamChat(messages)) {
          if (clientDisconnected) {
            break
          }
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
        }

        if (!clientDisconnected) {
          res.write('data: [DONE]\n\n')
        }
        res.end()
      } catch (error) {
        console.error('[chat] Stream error:', error)
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
      // Validate Content-Type - use exact matching for security
      const contentType = req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()
      if (
        !contentType ||
        !ALLOWED_AUDIO_TYPES.some((t) => t.toLowerCase().split(';')[0] === contentType)
      ) {
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

      // Limit audio size based on shared constraints
      if (audioBuffer.length > CHAT_CONSTRAINTS.MAX_AUDIO_SIZE) {
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
