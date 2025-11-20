/**
 * Dev Monitor Types
 *
 * Extended types for the dev-monitor tool that manages local development services
 * and cloud environment logs.
 */

import { CloudLogEntry } from './logging.types';

/**
 * Dev monitor log levels (uppercase)
 * Different from shared logging types which use lowercase
 */
export type DevMonitorLogLevel =
  | 'DEBUG'
  | 'INFO'
  | 'WARN'
  | 'ERROR';

/**
 * Local development service names
 */
export type LocalService =
  | 'firebase-emulators'  // Firebase Auth, Firestore, Functions, Storage
  | 'frontend-dev'        // React/Vite dev server
  | 'python-worker'       // Job queue worker (Docker)
  | 'dev-monitor-backend' // Dev monitor backend server
  | 'all'                 // All local services

/**
 * Cloud environment names
 */
export type CloudEnvironment = 'production' | 'development'

/**
 * Log source for panel filtering
 */
export type LogSource =
  // Local services
  | 'local-all'           // All local services
  | 'local-frontend'      // Frontend dev server only
  | 'local-backend'       // Firebase emulators only
  | 'local-worker'        // Python worker only
  | 'local-dev-monitor'   // Dev monitor backend only
  // Cloud environments
  | 'production-all'      // All production logs

/**
 * Dev monitor log line (local services)
 *
 * This represents a log line from local development services.
 */
export interface DevMonitorLogLine {
  id: string                    // Unique log line ID
  service: LocalService         // Source service
  timestamp: number             // Unix timestamp in milliseconds
  level: DevMonitorLogLevel     // Log severity level
  message: string               // Cleaned message (ANSI codes stripped)
  raw: string                   // Original message with ANSI codes
}

/**
 * Log history response from backend
 */
export interface LogHistory {
  serviceName: string
  logs: DevMonitorLogLine[]
}

/**
 * Service status info
 */
export interface ServiceStatus {
  name: string
  displayName: string
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error'
  pid?: number
  ports?: number[]
  uptime?: number
  error?: string
  startedAt?: number
}

/**
 * Panel configuration for multi-panel log viewing
 */
export interface PanelConfig {
  id: string                           // Unique panel ID
  source: LogSource                    // What logs to show
  paused: boolean                      // Whether log streaming is paused
  showMetadata: boolean                // Whether to show timestamp/service metadata
  searchText: string                   // Search filter text
  selectedServices: LocalService[]     // Service filter (empty = all)
  selectedLevels: DevMonitorLogLevel[] // Level filter
}

/**
 * Panel layout types
 */
export type PanelLayoutType =
  | 'single'        // 1 panel full width
  | 'horizontal'    // 2 panels side-by-side
  | 'vertical'      // 2 panels stacked
  | 'main-sidebar'  // 3 panels: 1 large + 2 stacked sidebar
  | 'quad'          // 4 panels in a 2x2 grid

/**
 * Saved panel layout
 */
export interface SavedPanelLayout {
  panels: PanelConfig[]
  layoutType: PanelLayoutType
}

/**
 * Script execution status
 */
export interface ScriptExecution {
  id: string
  scriptId: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  exitCode?: number
  startTime: number
  endTime?: number
  output: string[]
}

/**
 * Cloud log query for remote environments
 */
export interface CloudLogQuery {
  environment: CloudEnvironment
  service: string
  severity?: string
  limit?: number
  timeRange?: {
    start: Date
    end: Date
  }
}

/**
 * Unified log entry (local or cloud)
 *
 * This combines local dev logs and cloud logs into a single format
 * for display in the UI.
 */
export type UnifiedLogEntry = DevMonitorLogLine | CloudLogEntry;

/**
 * Socket.IO event types for dev-monitor
 */
export interface DevMonitorSocketEvents {
  // Client -> Server
  subscribe_logs: (serviceName: string) => void
  unsubscribe_logs: (serviceName: string) => void
  get_history: (data: { serviceName: string; lines?: number }) => void
  get_service_status: (serviceName: string) => void
  get_all_statuses: () => void

  // Server -> Client
  log_line: (log: DevMonitorLogLine) => void
  log_history: (data: LogHistory) => void
  service_status: (status: ServiceStatus) => void
  all_statuses: (statuses: ServiceStatus[]) => void
  initial_statuses: (statuses: ServiceStatus[]) => void
  status_change: (data: { serviceName: string; status: string; error?: string }) => void
  error: (data: { message: string }) => void
}
