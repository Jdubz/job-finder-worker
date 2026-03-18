import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InferenceClient, InferenceError, _resetResolvedModel } from '../inference-client'

// Suppress pino logs during tests
vi.mock('../../../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}))

describe('InferenceClient', () => {
  let client: InferenceClient
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.stubEnv('LITELLM_BASE_URL', 'http://localhost:4000')
    vi.stubEnv('LITELLM_MASTER_KEY', 'test-key')
    vi.stubEnv('LITELLM_TIMEOUT', '10')
    client = new InferenceClient()
  })

  afterEach(() => {
    _resetResolvedModel()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('task routing', () => {
    const successResponse = (model: string) => ({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'result' } }],
        model,
        usage: { total_tokens: 100 }
      })
    })

    it('routes extraction tasks to local-extract', async () => {
      mockFetch.mockResolvedValue(successResponse('local-extract'))

      await client.execute('extraction', 'extract this')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('local-extract')
    })

    it('routes analysis tasks to local-extract', async () => {
      mockFetch.mockResolvedValue(successResponse('local-extract'))

      await client.execute('analysis', 'analyze this')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('local-extract')
    })

    it('routes document tasks to claude-document', async () => {
      mockFetch.mockResolvedValue(successResponse('claude-document'))

      await client.execute('document', 'write this')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('claude-document')
    })

    it('routes chat tasks to claude-document', async () => {
      mockFetch.mockResolvedValue(successResponse('claude-document'))

      await client.execute('chat', 'hello')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('claude-document')
    })

    it('routes unknown tasks to gemini-general', async () => {
      mockFetch.mockResolvedValue(successResponse('gemini-general'))

      await client.execute('unknown_task', 'do something')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('gemini-general')
    })

    it('falls back to default when useLocalModels is false', async () => {
      client.useLocalModels = false
      mockFetch.mockResolvedValue(successResponse('gemini-general'))

      await client.execute('extraction', 'extract this')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('gemini-general')
    })

    it('uses modelOverride when provided', async () => {
      mockFetch.mockResolvedValue(successResponse('custom-model'))

      await client.execute('extraction', 'extract', 'custom-model')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('custom-model')
    })
  })

  describe('execute', () => {
    it('returns output, agentId, and model on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'hello world' } }],
          model: 'claude-document',
          usage: { total_tokens: 50 }
        })
      })

      const result = await client.execute('chat', 'hi')

      expect(result.output).toBe('hello world')
      expect(result.agentId).toBe('litellm:claude-document')
      expect(result.model).toBe('claude-document')
    })

    it('sends system prompt when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          model: 'test'
        })
      })

      await client.execute('chat', 'hi', undefined, {
        systemPrompt: 'You are a helpful assistant'
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' })
      expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' })
    })

    it('sends Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          model: 'test'
        })
      })

      await client.execute('chat', 'hi')

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer test-key')
    })

    it('throws InferenceError on 429 rate limit', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited')
      })

      await expect(client.execute('chat', 'hi')).rejects.toThrow(InferenceError)
      await expect(client.execute('chat', 'hi')).rejects.toThrow('rate limit')
    })

    it('throws on 502/503 with provider unavailable message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('service unavailable')
      })

      await expect(client.execute('chat', 'hi')).rejects.toThrow('providers unavailable')
    })

    it('throws InferenceError on other HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('internal error')
      })

      await expect(client.execute('chat', 'hi')).rejects.toThrow(InferenceError)
      await expect(client.execute('chat', 'hi')).rejects.toThrow('HTTP 500')
    })

    it('throws InferenceError on timeout (AbortError)', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockFetch.mockRejectedValue(abortError)

      await expect(client.execute('chat', 'hi')).rejects.toThrow(InferenceError)
      await expect(client.execute('chat', 'hi')).rejects.toThrow('timed out')
    })

    it('throws InferenceError on network errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(client.execute('chat', 'hi')).rejects.toThrow(InferenceError)
      await expect(client.execute('chat', 'hi')).rejects.toThrow('ECONNREFUSED')
    })

    it('handles empty choices gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [],
          model: 'test'
        })
      })

      const result = await client.execute('chat', 'hi')
      expect(result.output).toBe('')
    })

    it('strips /v1 suffix from base URL', async () => {
      vi.stubEnv('LITELLM_BASE_URL', 'http://localhost:4000/v1/')
      const c = new InferenceClient()

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
          model: 'test'
        })
      })

      await c.execute('chat', 'hi')

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:4000/v1/chat/completions')
    })
  })

  describe('streamChat', () => {
    it('yields content chunks from SSE stream', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n'
      ].join('')

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        }
      })

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => stream.getReader() }
      })

      const chunks: string[] = []
      for await (const chunk of client.streamChat([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', ' world'])
    })

    it('throws InferenceError on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        body: null,
        text: () => Promise.resolve('error')
      })

      const gen = client.streamChat([{ role: 'user', content: 'hi' }])
      await expect(gen.next()).rejects.toThrow(InferenceError)
    })

    it('skips malformed SSE chunks', async () => {
      const sseData = [
        'data: not-valid-json\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n'
      ].join('')

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        }
      })

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => stream.getReader() }
      })

      const chunks: string[] = []
      for await (const chunk of client.streamChat([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['ok'])
    })
  })

  describe('Claude model auto-resolution', () => {
    const claudeResponse = (model = 'claude-sonnet-4-6') => ({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'result' } }],
        model,
        usage: { total_tokens: 100 }
      })
    })

    const geminiResponse = () => ({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'result' } }],
        model: 'gemini-2.5-flash',
        usage: { total_tokens: 100 }
      })
    })

    // Anthropic API success response (Messages API format)
    const anthropicOk = () => ({
      ok: true,
      json: () => Promise.resolve({ type: 'message', content: [{ text: '.' }] })
    })

    it('detects Claude-to-Gemini fallback and probes Anthropic directly', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
      client = new InferenceClient()

      // First call (LiteLLM): requested claude-document, got gemini back
      mockFetch.mockResolvedValueOnce(geminiResponse())
      // Probe: claude-sonnet-4-7 via Anthropic API — fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve('') })
      // Probe: claude-sonnet-4-6 via Anthropic API — succeeds
      mockFetch.mockResolvedValueOnce(anthropicOk())
      // LiteLLM /model/new registration
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      const result = await client.execute('document', 'write this')

      // Original request still returns the Gemini result
      expect(result.model).toBe('gemini-2.5-flash')

      // Wait for background probe + registration to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(4)
      })

      // Verify probe called Anthropic API directly (not LiteLLM)
      const probeCall = mockFetch.mock.calls[1]
      expect(probeCall[0]).toBe('https://api.anthropic.com/v1/messages')
      expect(probeCall[1].headers['x-api-key']).toBe('sk-ant-test')

      // Verify LiteLLM /model/new was called to register the working model
      const registerCall = mockFetch.mock.calls[3]
      expect(registerCall[0]).toBe('http://localhost:4000/model/new')
      const registerBody = JSON.parse(registerCall[1].body)
      expect(registerBody.model_name).toBe('claude-document')
      expect(registerBody.litellm_params.model).toBe('anthropic/claude-sonnet-4-6')
      expect(registerBody.litellm_params).not.toHaveProperty('api_key')
    })

    it('subsequent calls still use claude-document alias (LiteLLM routes to registered model)', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
      client = new InferenceClient()

      // First call: silent fallback triggers probe
      mockFetch.mockResolvedValueOnce(geminiResponse())
      // Probe succeeds on first candidate
      mockFetch.mockResolvedValueOnce(anthropicOk())
      // LiteLLM registration succeeds
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      await client.execute('document', 'write this')
      await vi.waitFor(() => { expect(mockFetch).toHaveBeenCalledTimes(3) })

      // Second call: should still use claude-document alias (not a direct model name)
      mockFetch.mockResolvedValueOnce(claudeResponse())
      await client.execute('document', 'write again')

      const lastCallBody = JSON.parse(mockFetch.mock.calls[3][1].body)
      expect(lastCallBody.model).toBe('claude-document')
    })

    it('skips probe when ANTHROPIC_API_KEY is not set', async () => {
      // No ANTHROPIC_API_KEY in env (default from beforeEach)
      mockFetch.mockResolvedValue(geminiResponse())

      await client.execute('document', 'write this')

      // Only the original LiteLLM call, no probes
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('does not probe when response model matches requested model family', async () => {
      mockFetch.mockResolvedValue(claudeResponse())

      await client.execute('document', 'write this')

      // Only the original call, no probes
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('does not probe for non-Claude models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'result' } }],
          model: 'gemini-2.5-flash',
          usage: { total_tokens: 100 }
        })
      })

      // extraction routes to local-extract, falls back to gemini — no probe
      await client.execute('extraction', 'extract')

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
