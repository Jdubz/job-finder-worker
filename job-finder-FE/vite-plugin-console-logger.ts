/**
 * Vite Plugin: Browser Console Logger
 *
 * Captures browser console.log/warn/error/debug calls and sends them to the
 * dev-monitor backend for centralized logging.
 *
 * Features:
 * - Injects client-side console intercept code
 * - Sends logs via WebSocket to dev-monitor backend
 * - Structured JSON format matching our logging standard
 * - Only active in development mode
 */

import type { Plugin, ResolvedConfig } from "vite"

export interface ConsoleLoggerOptions {
  /**
   * Dev-monitor backend URL for sending logs
   * @default 'http://localhost:5000'
   */
  backendUrl?: string

  /**
   * Enable/disable the plugin
   * @default true (only in development)
   */
  enabled?: boolean
}

export function consoleLogger(options: ConsoleLoggerOptions = {}): Plugin {
  const { backendUrl = "http://localhost:5000", enabled = true } = options

  let config: ResolvedConfig

  return {
    name: "vite-plugin-console-logger",

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    transformIndexHtml() {
      // Only inject in development mode
      if (config.mode !== "development" || !enabled) {
        return
      }

      return [
        {
          tag: "script",
          injectTo: "head-prepend",
          children: `
(function() {
  // Intercept console methods and send to backend via HTTP
  const backendUrl = '${backendUrl}';
  const logQueue = [];
  let isSending = false;

  function sendLog(severity, args) {
    const logEntry = {
      severity: severity,
      timestamp: new Date().toISOString(),
      environment: 'development',
      service: 'frontend-browser',
      category: 'client',
      action: 'console_log',
      message: args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' '),
      details: {
        url: window.location.href,
        userAgent: navigator.userAgent,
      }
    };

    // Add to queue
    logQueue.push(logEntry);

    // Process queue
    if (!isSending) {
      processQueue();
    }
  }

  async function processQueue() {
    if (logQueue.length === 0 || isSending) {
      return;
    }

    isSending = true;
    const log = logQueue.shift();

    try {
      await fetch(backendUrl + '/api/logs/frontend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(log),
      });
    } catch (error) {
      // Silently fail - don't pollute console with logging errors
    } finally {
      isSending = false;
      // Process next log in queue
      if (logQueue.length > 0) {
        setTimeout(processQueue, 50);
      }
    }
  }

  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  // Override console methods
  console.log = function(...args) {
    sendLog('INFO', args);
    originalLog.apply(console, args);
  };

  console.warn = function(...args) {
    sendLog('WARNING', args);
    originalWarn.apply(console, args);
  };

  console.error = function(...args) {
    sendLog('ERROR', args);
    originalError.apply(console, args);
  };

  console.debug = function(...args) {
    sendLog('DEBUG', args);
    originalDebug.apply(console, args);
  };
})();
          `,
        },
      ]
    },
  }
}
