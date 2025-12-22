import Anthropic from '@anthropic-ai/sdk'
import { createClient, type DeepgramClient } from '@deepgram/sdk'
import { Readable } from 'node:stream'
import { logger } from '../../logger'
import { getChatContext, buildSystemPrompt } from './chat.prompts'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export class ChatService {
  private anthropic: Anthropic
  private deepgram: DeepgramClient
  private log = logger.child({ module: 'ChatService' })

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const deepgramKey = process.env.DEEPGRAM_API_KEY

    if (!anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
    if (!deepgramKey) {
      throw new Error('DEEPGRAM_API_KEY environment variable is required')
    }

    this.anthropic = new Anthropic({ apiKey: anthropicKey })
    this.deepgram = createClient(deepgramKey)
  }

  /**
   * Stream a chat response from Claude
   * Yields text chunks as they arrive
   */
  async *streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
    try {
      // Get context for system prompt
      const context = await getChatContext()
      const systemPrompt = buildSystemPrompt(context)

      // Create streaming request
      const stream = this.anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      })

      // Yield text chunks
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text
        }
      }
    } catch (error) {
      this.log.error({ err: error }, 'Claude API error')
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
          model: 'nova-2',
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
          model: 'aura-asteria-en',
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
