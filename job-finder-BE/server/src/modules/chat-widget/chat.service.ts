import { createClient, type DeepgramClient } from '@deepgram/sdk'
import { Readable } from 'node:stream'
import { logger } from '../../logger'
import { getChatContext, buildSystemPrompt } from './chat.prompts'
import { InferenceClient } from '../generator/ai/inference-client'
import type { ChatMessage } from '@shared/types'

export type { ChatMessage }

// Model configuration constants
const DEEPGRAM_STT_MODEL = 'nova-2'
const DEEPGRAM_TTS_MODEL = 'aura-asteria-en'

export class ChatService {
  private inferenceClient: InferenceClient
  private deepgram: DeepgramClient
  private log = logger.child({ module: 'ChatService' })

  constructor() {
    const deepgramKey = process.env.DEEPGRAM_API_KEY

    if (!deepgramKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is required')
    }

    this.inferenceClient = new InferenceClient(this.log)
    this.deepgram = createClient(deepgramKey)
  }

  /**
   * Stream a chat response via LiteLLM proxy.
   * Yields text chunks as they arrive.
   */
  async *streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
    try {
      // Get context for system prompt
      const context = await getChatContext()
      const systemPrompt = buildSystemPrompt(context)

      yield* this.inferenceClient.streamChat(
        messages.map((m) => ({ role: m.role, content: m.content })),
        systemPrompt
      )
    } catch (error) {
      this.log.error({ err: error }, 'LiteLLM chat stream error')
      throw new Error('Chat service temporarily unavailable')
    }
  }

  /**
   * Convert speech audio to text using Deepgram
   */
  async speechToText(audioBuffer: Buffer): Promise<string> {
    try {
      const { result } = await this.deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: DEEPGRAM_STT_MODEL,
          smart_format: true,
          language: 'en',
        }
      )

      const transcript =
        result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''

      this.log.debug({ transcriptLength: transcript.length }, 'STT completed')
      return transcript
    } catch (error) {
      this.log.error({ err: error }, 'Deepgram STT error')
      throw new Error('Speech transcription temporarily unavailable')
    }
  }

  /**
   * Convert text to speech audio using Deepgram
   * Returns a readable stream of audio data
   */
  async textToSpeech(text: string): Promise<Readable> {
    try {
      const response = await this.deepgram.speak.request(
        { text },
        {
          model: DEEPGRAM_TTS_MODEL,
          encoding: 'mp3',
        }
      )

      const stream = await response.getStream()
      if (!stream) {
        throw new Error('No audio stream returned')
      }

      this.log.debug({ textLength: text.length }, 'TTS completed')
      return Readable.from(stream)
    } catch (error) {
      this.log.error({ err: error }, 'Deepgram TTS error')
      throw new Error('Text-to-speech temporarily unavailable')
    }
  }
}

// Singleton instance
let chatServiceInstance: ChatService | null = null

export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService()
  }
  return chatServiceInstance
}
