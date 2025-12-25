import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Mic, Square, Loader2, AlertCircle, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { streamChat, speechToText, textToSpeech } from '@/api/chat-client'
import type { ChatMessage } from '@/api/chat-client'

type ErrorType = 'mic_permission' | 'mic_unavailable' | 'stt_failed' | null

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
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [voiceEnabled] = useState(isVoiceSupported)
  const [readBackEnabled, setReadBackEnabled] = useState(false)
  const [error, setError] = useState<ErrorType>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
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

      // Clear recording timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
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

  // Stop audio playback when read-back is disabled
  useEffect(() => {
    if (!readBackEnabled) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current)
        currentAudioUrlRef.current = null
      }
    }
  }, [readBackEnabled])

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

        // Play TTS for response (only if enabled and still mounted)
        if (fullResponse && readBackEnabled && mountedRef.current) {
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
    [messages, isLoading, readBackEnabled]
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

    // Clear any previous errors when attempting to record
    setError(null)

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

        // Clear recording timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setRecordingDuration(0)

        if (currentChunks.length === 0) return
        if (!mountedRef.current) return

        const audioBlob = new Blob(currentChunks, {
          type: mimeType || 'audio/webm',
        })
        setIsProcessingAudio(true)

        try {
          const text = await speechToText(audioBlob)
          if (mountedRef.current) {
            if (text.trim()) {
              // Put transcript in input for review instead of sending directly
              setInputValue(text.trim())
              // Focus input so user can review/edit
              inputRef.current?.focus()
            } else {
              // Empty transcript - show feedback
              setError('stt_failed')
            }
          }
        } catch (err) {
          console.error('STT failed:', err)
          if (mountedRef.current) {
            setError('stt_failed')
          }
        } finally {
          if (mountedRef.current) {
            setIsProcessingAudio(false)
          }
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Microphone error:', err)
      // Determine error type for user-facing message
      if (
        err instanceof Error &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        setError('mic_permission')
      } else {
        setError('mic_unavailable')
      }
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      // Timer is cleared in onstop handler
    }
  }

  // Toggle recording on click (click-to-start, click-to-stop)
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Format seconds as mm:ss
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const togglePanel = useCallback(() => setIsOpen((prev) => !prev), [])
  const toggleReadBack = useCallback(() => setReadBackEnabled((prev) => !prev), [])

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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleReadBack}
                aria-label={readBackEnabled ? 'Disable voice read-back' : 'Enable voice read-back'}
                title={readBackEnabled ? 'Voice read-back on' : 'Voice read-back off'}
              >
                {readBackEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={togglePanel}>
                <X className="w-4 h-4" />
              </Button>
            </div>
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
                    ? 'Try asking about my background, or click the mic to speak.'
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

          {/* Error Banner */}
          {error && (
            <div className="mx-4 mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-destructive">
                  {{
                    mic_permission:
                      'Microphone access denied. Please allow microphone access in your browser settings and try again.',
                    mic_unavailable:
                      'No microphone found. Please connect a microphone and try again.',
                    stt_failed:
                      "I didn't catch that. Please try speaking again or type your message.",
                  }[error]}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => setError(null)}
                aria-label="Dismiss error message"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Recording/Transcribing Indicator */}
          {(isRecording || isProcessingAudio) && (
            <div className="mx-4 mb-2 p-3 bg-muted border rounded-md flex items-center gap-3">
              {isRecording ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-medium">
                    Recording... {formatDuration(recordingDuration)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Click mic to stop
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Transcribing...
                  </span>
                </>
              )}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t shrink-0">
            <div className="flex items-end gap-2">
              {/* Voice Button - click to toggle recording */}
              {voiceEnabled && (
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="icon"
                  disabled={isLoading || isProcessingAudio}
                  onClick={toggleRecording}
                  className={cn(
                    'shrink-0 transition-all',
                    isRecording && 'animate-pulse'
                  )}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                >
                  {isProcessingAudio ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isRecording ? (
                    <Square className="w-4 h-4 fill-current" />
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
