import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatWidget } from '../ChatWidget'

// Mock chat-client API functions
const mockStreamChat = vi.fn()
const mockSpeechToText = vi.fn()
const mockTextToSpeech = vi.fn()

vi.mock('@/api/chat-client', () => ({
  streamChat: (...args: any[]) => mockStreamChat(...args),
  speechToText: (...args: any[]) => mockSpeechToText(...args),
  textToSpeech: (...args: any[]) => mockTextToSpeech(...args),
}))

// Mock createPortal to render inline for testing
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  }
})

// Mock MediaRecorder
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  state: 'inactive',
}

describe('ChatWidget', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup MediaRecorder mock
    global.MediaRecorder = vi.fn().mockImplementation(() => mockMediaRecorder) as any
    ;(global.MediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true)

    // Setup getUserMedia mock
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      writable: true,
      configurable: true,
    })

    // Setup Audio mock
    global.Audio = vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      onended: null,
      onerror: null,
    })) as any

    // Setup URL mock
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test')
    global.URL.revokeObjectURL = vi.fn()

    // Setup crypto mock
    global.crypto.randomUUID = vi.fn().mockReturnValue('test-uuid')

    // Default mock implementations
    mockStreamChat.mockImplementation(async (_messages, onChunk) => {
      onChunk('Test response')
      return 'Test response'
    })
    mockTextToSpeech.mockResolvedValue(new Blob())
  })

  describe('Initial State', () => {
    it('renders floating bubble button when closed', () => {
      render(<ChatWidget />)
      expect(screen.getByRole('button', { name: /open chat assistant/i })).toBeInTheDocument()
    })

    it('does not show chat panel when closed', () => {
      render(<ChatWidget />)
      expect(screen.queryByText('Career Assistant')).not.toBeInTheDocument()
    })
  })

  describe('Opening/Closing', () => {
    it('opens chat panel when bubble is clicked', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(screen.getByText('Career Assistant')).toBeInTheDocument()
    })

    it('shows welcome message when chat is opened', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(
        screen.getByText(/I can answer questions about my experience and skills/i)
      ).toBeInTheDocument()
    })
  })

  describe('Message Input', () => {
    it('allows typing in the message input', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Hello there')

      expect(input).toHaveValue('Hello there')
    })

    it('has disabled send button when input is empty', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      // Find the submit button by type attribute
      const submitButton = document.querySelector('button[type="submit"]')
      expect(submitButton).toBeDisabled()
    })
  })

  describe('Sending Messages', () => {
    it('calls streamChat when message is submitted', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Hello')
      fireEvent.submit(input.closest('form')!)

      await waitFor(() => {
        expect(mockStreamChat).toHaveBeenCalled()
      })
    })

    it('sends message on Enter key', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Hello{Enter}')

      await waitFor(() => {
        expect(mockStreamChat).toHaveBeenCalled()
      })
    })

    it('passes messages array to streamChat', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Test message{Enter}')

      await waitFor(() => {
        expect(mockStreamChat).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Test message' }),
          ]),
          expect.any(Function),
          expect.any(Object)
        )
      })
    })

    it('clears input after submission', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Hello{Enter}')

      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })

    it('calls textToSpeech after receiving response when read-back is enabled', async () => {
      mockStreamChat.mockImplementation(async (_messages, onChunk) => {
        onChunk('Response text')
        return 'Response text'
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      // Enable read-back (off by default)
      await user.click(screen.getByRole('button', { name: /enable voice read-back/i }))

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Hello{Enter}')

      await waitFor(() => {
        expect(mockTextToSpeech).toHaveBeenCalledWith('Response text')
      })
    })

    it('does not call textToSpeech when read-back is disabled', async () => {
      mockStreamChat.mockImplementation(async (_messages, onChunk) => {
        onChunk('Response text')
        return 'Response text'
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      // Read-back is off by default, don't toggle it

      const input = screen.getByPlaceholderText('Type a message...')
      await user.type(input, 'Hello{Enter}')

      await waitFor(() => {
        expect(mockStreamChat).toHaveBeenCalled()
      })

      // TTS should not be called since read-back is disabled
      expect(mockTextToSpeech).not.toHaveBeenCalled()
    })

    it('shows read-back toggle button in header', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(
        screen.getByRole('button', { name: /enable voice read-back/i })
      ).toBeInTheDocument()
    })

    it('toggles read-back state when button is clicked', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      // Initially disabled
      const toggleButton = screen.getByRole('button', { name: /enable voice read-back/i })
      expect(toggleButton).toBeInTheDocument()

      // Enable read-back
      await user.click(toggleButton)

      // Now should show disable option
      expect(
        screen.getByRole('button', { name: /disable voice read-back/i })
      ).toBeInTheDocument()
    })
  })

  describe('Voice Support Detection', () => {
    it('shows mic button when voice is supported', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    })

    it('hides mic button when MediaRecorder is not supported', async () => {
      ;(global.MediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(false)

      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(screen.queryByRole('button', { name: /start recording/i })).not.toBeInTheDocument()
    })

    it('hides mic button when getUserMedia is not available', async () => {
      delete (global.navigator as any).mediaDevices

      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(screen.queryByRole('button', { name: /start recording/i })).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has accessible name for floating button', () => {
      render(<ChatWidget />)
      expect(screen.getByRole('button', { name: /open chat assistant/i })).toBeInTheDocument()
    })

    it('has accessible label for mic button', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
    })

    it('focuses input when chat opens', async () => {
      render(<ChatWidget />)

      await user.click(screen.getByRole('button', { name: /open chat assistant/i }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Type a message...')).toHaveFocus()
      })
    })
  })

  describe('Cleanup', () => {
    it('cleans up without errors on unmount', () => {
      const { unmount } = render(<ChatWidget />)
      expect(() => unmount()).not.toThrow()
    })
  })
})
