import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Mic, MicOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { streamChat, speechToText, textToSpeech } from '@/api/chat-client'
import type { ChatMessage } from '@/api/chat-client'

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * Get supported audio MIME type for MediaRecorder
 * Falls back through preferred formats for cross-browser support
 */
function getSupportedMimeType(): string | undefined {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return undefined
}

/**
 * Check if voice recording is supported in this browser
 */
function isVoiceSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    getSupportedMimeType() !== undefined
  )
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [voiceEnabled] = useState(isVoiceSupported)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      // Abort any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      // Stop any playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current)
        currentAudioUrlRef.current = null
      }

      // Stop any active recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
    }
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText || isLoading) return

      // Abort any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmedText,
      }

      setMessages((prev) => [...prev, userMessage])
      setInputValue('')
      setIsLoading(true)

      // Create assistant message placeholder
      const assistantId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '' },
      ])

      try {
        // Prepare message history for API
        const history: ChatMessage[] = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }))

        abortControllerRef.current = new AbortController()

        const fullResponse = await streamChat(
          history,
          (chunk) => {
            if (!mountedRef.current) return
            // Update assistant message with streaming content
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m
              )
            )
          },
          abortControllerRef.current.signal
        )

        // Play TTS for response (only if still mounted)
        if (fullResponse && mountedRef.current) {
          try {
            // Stop any previously playing audio
            if (currentAudioRef.current) {
              currentAudioRef.current.pause()
            }
            if (currentAudioUrlRef.current) {
              URL.revokeObjectURL(currentAudioUrlRef.current)
            }

            const audioBlob = await textToSpeech(fullResponse)
            if (!mountedRef.current) return

            const audioUrl = URL.createObjectURL(audioBlob)
            currentAudioUrlRef.current = audioUrl

            const audio = new Audio(audioUrl)
            currentAudioRef.current = audio

            audio.onended = () => {
              if (currentAudioUrlRef.current === audioUrl) {
                URL.revokeObjectURL(audioUrl)
                currentAudioUrlRef.current = null
                currentAudioRef.current = null
              }
            }

            audio.onerror = () => {
              if (currentAudioUrlRef.current === audioUrl) {
                URL.revokeObjectURL(audioUrl)
                currentAudioUrlRef.current = null
                currentAudioRef.current = null
              }
            }

            audio.play().catch(() => {
              // Autoplay blocked - clean up
              URL.revokeObjectURL(audioUrl)
              currentAudioUrlRef.current = null
              currentAudioRef.current = null
            })
          } catch (err) {
            // TTS failed - log error for debugging
            console.error('TTS failed:', err)
          }
        }
      } catch (error) {
        if (!mountedRef.current) return

        // Don't show error if request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }

        // Update assistant message with error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Sorry, I'm having trouble responding right now. Please try again.",
                }
              : m
          )
        )
        console.error('Chat error:', error)
      } finally {
        if (mountedRef.current) {
          setIsLoading(false)
        }
        abortControllerRef.current = null
      }
    },
    [messages, isLoading]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  const startRecording = async () => {
    if (!voiceEnabled) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const mimeType = getSupportedMimeType()
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      // Use a local variable to capture chunks for this recording session
      // This prevents race conditions if multiple recordings happen quickly
      const currentChunks: Blob[] = []
      audioChunksRef.current = currentChunks

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          currentChunks.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Clear event handlers to prevent stale callbacks
        mediaRecorder.ondataavailable = null
        mediaRecorder.onstop = null
        // Clean up stream
        stream.getTracks().forEach((track) => track.stop())
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null
        }

        if (currentChunks.length === 0) return
        if (!mountedRef.current) return

        const audioBlob = new Blob(currentChunks, {
          type: mimeType || 'audio/webm',
        })
        setIsProcessingAudio(true)

        try {
          const text = await speechToText(audioBlob)
          if (mountedRef.current && text.trim()) {
            sendMessage(text)
          }
        } catch (err) {
          console.error('STT failed:', err)
        } finally {
          if (mountedRef.current) {
            setIsProcessingAudio(false)
          }
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const togglePanel = () => setIsOpen((prev) => !prev)

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        // Chat Panel
        <div className="w-[380px] h-[600px] max-h-[80vh] bg-background border rounded-lg shadow-xl flex flex-col animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div>
              <h3 className="font-semibold">Career Assistant</h3>
              <p className="text-xs text-muted-foreground">Ask me anything</p>
            </div>
            <Button variant="ghost" size="icon" onClick={togglePanel}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">
                  Hi! I can answer questions about my experience and skills.
                </p>
                <p className="text-xs mt-2">
                  {voiceEnabled
                    ? 'Try asking about my background or hold the mic to speak.'
                    : 'Try asking about my background.'}
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-2',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t shrink-0">
            <div className="flex items-end gap-2">
              {/* Voice Button - only show if voice is supported */}
              {voiceEnabled && (
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="icon"
                  disabled={isLoading || isProcessingAudio}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={isRecording ? stopRecording : undefined}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={cn(
                    'shrink-0 transition-all',
                    isRecording && 'animate-pulse'
                  )}
                  aria-label={isRecording ? 'Stop recording' : 'Hold to speak'}
                >
                  {isProcessingAudio ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>
              )}

              {/* Text Input */}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                rows={1}
                disabled={isLoading}
              />

              {/* Send Button */}
              <Button
                type="submit"
                size="icon"
                disabled={!inputValue.trim() || isLoading}
                className="shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        // Floating Bubble
        <button
          onClick={togglePanel}
          className={cn(
            'w-14 h-14 rounded-full bg-primary text-primary-foreground',
            'shadow-lg hover:shadow-xl transition-all duration-200',
            'flex items-center justify-center',
            'hover:scale-105 active:scale-95'
          )}
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>,
    document.body
  )
}
