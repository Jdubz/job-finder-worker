/**
 * Simple Frontend Logger
 *
 * Sends structured error logs to the backend for storage in log files.
 */

interface LogEntry {
  level: 'debug' | 'info' | 'warning' | 'error'
  category: string
  action: string
  message: string
  error?: {
    type: string
    message: string
    stack?: string
  }
  details?: Record<string, unknown>
  sessionId?: string
  timestamp?: string
}

class FrontendLogger {
  private sessionId: string
  private logBuffer: LogEntry[] = []
  private flushTimer?: number

  constructor() {
    this.sessionId = this.generateSessionId()

    // Flush logs every 5 seconds or when buffer reaches 10 items
    this.flushTimer = window.setInterval(() => this.flush(), 5000)

    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush())
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  async log(
    level: LogEntry['level'],
    category: string,
    action: string,
    message: string,
    options?: {
      error?: LogEntry['error']
      details?: LogEntry['details']
    }
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category,
      action,
      message,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...options
    }

    // Console log in development
    if (import.meta.env.MODE === 'development') {
      console.log(`[${level}] [${category}] ${message}`, options)
    }

    // Add to buffer
    this.logBuffer.push(entry)

    // Flush immediately for errors or if buffer is full
    if (level === 'error' || this.logBuffer.length >= 10) {
      await this.flush()
    }
  }

  async error(category: string, action: string, message: string, options?: {
    error?: LogEntry['error']
    details?: LogEntry['details']
  }): Promise<void> {
    return this.log('error', category, action, message, options)
  }

  async info(category: string, action: string, message: string, options?: {
    details?: LogEntry['details']
  }): Promise<void> {
    return this.log('info', category, action, message, options)
  }

  async warning(category: string, action: string, message: string, options?: {
    details?: LogEntry['details']
  }): Promise<void> {
    return this.log('warning', category, action, message, options)
  }

  async debug(category: string, action: string, message: string, options?: {
    details?: LogEntry['details']
  }): Promise<void> {
    return this.log('debug', category, action, message, options)
  }

  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return

    const logs = [...this.logBuffer]
    this.logBuffer = []

    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs,
          sessionId: this.sessionId,
          service: 'frontend',
          timestamp: new Date().toISOString()
        })
      })
    } catch (error) {
      // Failed to send logs, put them back in the buffer for retry
      this.logBuffer = [...logs, ...this.logBuffer]
      console.error('Failed to send logs:', error)
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    this.flush()
  }
}

// Export singleton instance
export const logger = new FrontendLogger()

// React hook for using the logger
export function useLogger() {
  return logger
}