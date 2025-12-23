import { z } from 'zod'
import { CHAT_CONSTRAINTS, ALLOWED_AUDIO_TYPES } from '../api/chat.types'

/**
 * Schema for a single chat message
 */
export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(CHAT_CONSTRAINTS.MAX_MESSAGE_LENGTH),
})

/**
 * Schema for chat message request body
 */
export const chatMessageRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(CHAT_CONSTRAINTS.MAX_MESSAGES),
})

/**
 * Schema for text-to-speech request body
 */
export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_CONSTRAINTS.MAX_TTS_LENGTH),
})

/**
 * Schema for SSE stream event
 */
export const chatStreamEventSchema = z.object({
  text: z.string().optional(),
  error: z.string().optional(),
})

/**
 * Schema for speech-to-text response
 */
export const sttResponseSchema = z.object({
  text: z.string(),
})

/**
 * Schema for allowed audio MIME types
 * z.union requires at least 2 elements, so we destructure first two explicitly
 */
const [firstAudioType, secondAudioType, ...restAudioTypes] = ALLOWED_AUDIO_TYPES
export const audioMimeTypeSchema = z.union([
  z.literal(firstAudioType),
  z.literal(secondAudioType),
  ...restAudioTypes.map((type) => z.literal(type)),
] as [z.ZodLiteral<string>, z.ZodLiteral<string>, ...z.ZodLiteral<string>[]])

// Export inferred types for runtime validation
export type ChatMessageSchema = z.infer<typeof chatMessageSchema>
export type ChatMessageRequestSchema = z.infer<typeof chatMessageRequestSchema>
export type TtsRequestSchema = z.infer<typeof ttsRequestSchema>
export type ChatStreamEventSchema = z.infer<typeof chatStreamEventSchema>
export type SttResponseSchema = z.infer<typeof sttResponseSchema>
