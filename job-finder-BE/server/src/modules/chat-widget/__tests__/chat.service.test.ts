import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import type { ChatMessage } from '@shared/types'

// Mock environment variables before importing the service
const originalEnv = process.env

// Mock InferenceClient (replaces Anthropic SDK)
const mockStreamChat = vi.fn()
vi.mock('../../generator/ai/inference-client', () => ({
  InferenceClient: vi.fn().mockImplementation(() => ({
    streamChat: mockStreamChat,
  })),
}))

// Mock Deepgram SDK
const mockTranscribeFile = vi.fn()
const mockSpeakRequest = vi.fn()
vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    listen: {
      prerecorded: {
        transcribeFile: mockTranscribeFile,
      },
    },
    speak: {
      request: mockSpeakRequest,
    },
  })),
}))

// Mock chat prompts
vi.mock('../chat.prompts', () => ({
  getChatContext: vi.fn().mockResolvedValue({
    personalInfo: { name: 'Test User' },
    contentItems: [],
  }),
  buildSystemPrompt: vi.fn().mockReturnValue('Test system prompt'),
}))

describe('ChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set required environment variables (only DEEPGRAM_API_KEY is required now)
    process.env = {
      ...originalEnv,
      DEEPGRAM_API_KEY: 'test-deepgram-key',
    }
    // Reset module cache to allow fresh imports
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('constructor', () => {
    it('throws error when DEEPGRAM_API_KEY is missing', async () => {
      delete process.env.DEEPGRAM_API_KEY
      vi.resetModules()

      await expect(async () => {
        const { ChatService } = await import('../chat.service')
        new ChatService()
      }).rejects.toThrow('DEEPGRAM_API_KEY environment variable is required')
    })

    it('creates instance when all API keys are provided', async () => {
      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      expect(service).toBeInstanceOf(ChatService)
    })
  })

  describe('streamChat', () => {
    it('yields text chunks from LiteLLM stream', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Hello'
        yield ' world'
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }]

      const chunks: string[] = []
      for await (const chunk of service.streamChat(messages)) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', ' world'])
    })

    it('delegates to InferenceClient.streamChat with correct parameters', async () => {
      mockStreamChat.mockImplementation(async function* () {
        yield 'Hi'
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]

      // Consume the generator to trigger the API call
      for await (const _ of service.streamChat(messages)) {
        // consume chunks
      }

      expect(mockStreamChat).toHaveBeenCalledWith(
        [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
        'Test system prompt'
      )
    })

    it('throws user-friendly error on API failure', async () => {
      mockStreamChat.mockImplementation(async function* () {
        throw new Error('API rate limit exceeded')
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }]

      await expect(async () => {
        for await (const _ of service.streamChat(messages)) {
          // consume chunks
        }
      }).rejects.toThrow('Chat service temporarily unavailable')
    })
  })

  describe('speechToText', () => {
    it('returns transcript from Deepgram response', async () => {
      mockTranscribeFile.mockResolvedValue({
        result: {
          results: {
            channels: [
              {
                alternatives: [
                  { transcript: 'Hello, this is a test.' },
                ],
              },
            ],
          },
        },
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const audioBuffer = Buffer.from('fake audio data')

      const transcript = await service.speechToText(audioBuffer)

      expect(transcript).toBe('Hello, this is a test.')
    })

    it('calls Deepgram with correct parameters', async () => {
      mockTranscribeFile.mockResolvedValue({
        result: { results: { channels: [{ alternatives: [{ transcript: '' }] }] } },
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const audioBuffer = Buffer.from('test audio')

      await service.speechToText(audioBuffer)

      expect(mockTranscribeFile).toHaveBeenCalledWith(audioBuffer, {
        model: 'nova-2',
        smart_format: true,
        language: 'en',
      })
    })

    it('returns empty string when no transcript available', async () => {
      mockTranscribeFile.mockResolvedValue({
        result: { results: { channels: [] } },
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const audioBuffer = Buffer.from('audio with no speech')

      const transcript = await service.speechToText(audioBuffer)

      expect(transcript).toBe('')
    })

    it('throws user-friendly error on API failure', async () => {
      mockTranscribeFile.mockRejectedValue(new Error('Deepgram error'))

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()
      const audioBuffer = Buffer.from('audio data')

      await expect(service.speechToText(audioBuffer)).rejects.toThrow(
        'Speech transcription temporarily unavailable'
      )
    })
  })

  describe('textToSpeech', () => {
    it('returns readable stream from Deepgram response', async () => {
      const mockAudioData = new Uint8Array([1, 2, 3, 4])
      mockSpeakRequest.mockResolvedValue({
        getStream: vi.fn().mockResolvedValue(mockAudioData),
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()

      const stream = await service.textToSpeech('Hello world')

      expect(stream).toBeInstanceOf(Readable)
    })

    it('calls Deepgram with correct parameters', async () => {
      mockSpeakRequest.mockResolvedValue({
        getStream: vi.fn().mockResolvedValue(new Uint8Array([1])),
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()

      await service.textToSpeech('Test text')

      expect(mockSpeakRequest).toHaveBeenCalledWith(
        { text: 'Test text' },
        {
          model: 'aura-asteria-en',
          encoding: 'mp3',
        }
      )
    })

    it('throws error when no stream returned', async () => {
      mockSpeakRequest.mockResolvedValue({
        getStream: vi.fn().mockResolvedValue(null),
      })

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()

      await expect(service.textToSpeech('Hello')).rejects.toThrow(
        'Text-to-speech temporarily unavailable'
      )
    })

    it('throws user-friendly error on API failure', async () => {
      mockSpeakRequest.mockRejectedValue(new Error('Deepgram TTS error'))

      const { ChatService } = await import('../chat.service')
      const service = new ChatService()

      await expect(service.textToSpeech('Hello')).rejects.toThrow(
        'Text-to-speech temporarily unavailable'
      )
    })
  })

  describe('getChatService singleton', () => {
    it('returns the same instance on multiple calls', async () => {
      const { getChatService } = await import('../chat.service')

      const instance1 = getChatService()
      const instance2 = getChatService()

      expect(instance1).toBe(instance2)
    })
  })
})
