/**
 * Chat Widget API Types
 *
 * Types for the voice-enabled AI chat widget endpoints
 */

/**
 * A single message in a chat conversation
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Request body for POST /api/chat/message
 */
export interface ChatMessageRequest {
  messages: ChatMessage[]
}

/**
 * SSE event data for streaming chat response
 */
export interface ChatStreamEvent {
  text?: string
  error?: string
}

/**
 * Request body for POST /api/chat/tts
 */
export interface TextToSpeechRequest {
  text: string
}

/**
 * Response from POST /api/chat/stt
 */
export interface SpeechToTextResponse {
  text: string
}

/**
 * Validation constraints for chat endpoints
 */
export const CHAT_CONSTRAINTS = {
  /** Maximum length of a single message content */
  MAX_MESSAGE_LENGTH: 2000,
  /** Maximum number of messages in a conversation */
  MAX_MESSAGES: 50,
  /** Maximum length of text for TTS */
  MAX_TTS_LENGTH: 5000,
  /** Maximum audio file size in bytes (10MB) */
  MAX_AUDIO_SIZE: 10 * 1024 * 1024,
  /** Rate limit: requests per minute per IP */
  RATE_LIMIT_PER_MINUTE: 30,
} as const

/**
 * Allowed MIME types for audio upload
 */
export const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/wav',
  'audio/mpeg',
] as const

export type AllowedAudioType = (typeof ALLOWED_AUDIO_TYPES)[number]
