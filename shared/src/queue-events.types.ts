/**
 * Queue Event Types
 *
 * Shared type definitions for SSE events (BE → FE) and WebSocket messages (Worker ↔ BE).
 * These types ensure type safety across the entire event pipeline.
 *
 * Event Flow:
 * 1. Worker sends events via WebSocket/HTTP to BE
 * 2. BE broadcasts events via SSE to FE
 * 3. FE handles events and updates UI
 *
 * Used by:
 * - job-finder-BE: queue-events.ts, worker-socket.ts, job-queue.routes.ts
 * - job-finder-FE: useQueueItems.ts
 * - job-finder-worker: notifier.py, manager.py
 */

import type { QueueItem } from "./queue.types"

// ============================================================================
// Event Names
// ============================================================================

/**
 * SSE event names sent from BE to FE
 */
export type QueueSseEventName =
  | "snapshot"
  | "item.created"
  | "item.updated"
  | "item.deleted"
  | "item.cancelled"
  | "progress"
  | "heartbeat"
  | "command.ack"
  | "command.error"

/**
 * Event names sent from Worker to BE
 */
export type WorkerEventName =
  | "item.created"
  | "item.updated"
  | "item.deleted"
  | "heartbeat"

/**
 * Command event names sent from BE to Worker
 */
export type WorkerCommandName = "command.cancel"

// ============================================================================
// Event Data Payloads
// ============================================================================

/**
 * Payload for 'snapshot' event - initial queue state sent on SSE connection
 */
export interface SnapshotEventData {
  items: QueueItem[]
}

/**
 * Payload for 'item.created' event - new queue item added
 */
export interface ItemCreatedEventData {
  queueItem: QueueItem
  workerId?: string
}

/**
 * Payload for 'item.updated' event - queue item status/data changed
 */
export interface ItemUpdatedEventData {
  queueItem: QueueItem
  workerId?: string
}

/**
 * Payload for 'item.deleted' event - queue item removed
 */
export interface ItemDeletedEventData {
  queueItemId: string
  workerId?: string
}

/**
 * Payload for 'item.cancelled' event - queue item cancelled by user
 */
export interface ItemCancelledEventData {
  queueItemId: string
  reason?: string
  workerId?: string
}

/**
 * Payload for 'progress' event - processing progress update
 */
export interface ProgressEventData {
  itemId: string
  stage: string
  status: "started" | "completed" | "failed"
  message?: string
  workerId?: string
}

/**
 * Payload for 'heartbeat' event - worker health signal
 */
export interface HeartbeatEventData {
  iteration: number
  workerId?: string
}

/**
 * Payload for 'command.ack' event - command acknowledgement
 */
export interface CommandAckEventData {
  commandId: string
  command: string
  success: boolean
  workerId?: string
}

/**
 * Payload for 'command.error' event - command execution error
 */
export interface CommandErrorEventData {
  commandId?: string
  command: string
  error: string
  workerId?: string
}

// ============================================================================
// Worker Command Payloads
// ============================================================================

/**
 * Cancel command sent from BE to Worker
 */
export interface CancelCommand {
  command: "cancel"
  itemId: string
  workerId: string
  ts: string
}

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Maps SSE event names to their data payload types
 */
export interface QueueEventDataMap {
  snapshot: SnapshotEventData
  "item.created": ItemCreatedEventData
  "item.updated": ItemUpdatedEventData
  "item.deleted": ItemDeletedEventData
  "item.cancelled": ItemCancelledEventData
  progress: ProgressEventData
  heartbeat: HeartbeatEventData
  "command.ack": CommandAckEventData
  "command.error": CommandErrorEventData
}

// ============================================================================
// Wire Formats
// ============================================================================

/**
 * SSE event payload structure (BE → FE)
 */
export interface QueueSsePayload<E extends QueueSseEventName = QueueSseEventName> {
  id: string
  event: E
  data: E extends keyof QueueEventDataMap ? QueueEventDataMap[E] : Record<string, unknown>
  ts: string
}

/**
 * Worker message structure (Worker → BE via WebSocket/HTTP)
 */
export interface WorkerMessage<E extends WorkerEventName = WorkerEventName> {
  event: E
  data: E extends keyof QueueEventDataMap ? QueueEventDataMap[E] : Record<string, unknown>
}

/**
 * A discriminated union of all possible messages sent from the worker.
 * This allows for type-safe handling of messages based on the `event` property.
 */
export type AnyWorkerMessage = {
  [E in WorkerEventName]: WorkerMessage<E>
}[WorkerEventName]

/**
 * Worker command structure (BE → Worker via WebSocket)
 */
export interface WorkerCommandMessage {
  event: WorkerCommandName
  itemId: string
  workerId: string
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if event data has a queueItem property
 */
export function hasQueueItem(
  data: unknown
): data is ItemCreatedEventData | ItemUpdatedEventData {
  return (
    typeof data === "object" &&
    data !== null &&
    "queueItem" in data &&
    typeof (data as Record<string, unknown>).queueItem === "object"
  )
}

/**
 * Check if event data has a queueItemId property
 */
export function hasQueueItemId(data: unknown): data is ItemDeletedEventData {
  return (
    typeof data === "object" &&
    data !== null &&
    "queueItemId" in data &&
    typeof (data as Record<string, unknown>).queueItemId === "string"
  )
}

/**
 * Check if event data is a snapshot
 */
export function isSnapshotData(data: unknown): data is SnapshotEventData {
  return (
    typeof data === "object" &&
    data !== null &&
    "items" in data &&
    Array.isArray((data as Record<string, unknown>).items)
  )
}

/**
 * Check if event data is a heartbeat
 */
export function isHeartbeatData(data: unknown): data is HeartbeatEventData {
  return (
    typeof data === "object" &&
    data !== null &&
    "iteration" in data &&
    typeof (data as Record<string, unknown>).iteration === "number"
  )
}

/**
 * Validates that an SSE event name is known
 */
export function isQueueSseEventName(name: string): name is QueueSseEventName {
  return [
    "snapshot",
    "item.created",
    "item.updated",
    "item.deleted",
    "item.cancelled",
    "progress",
    "heartbeat",
    "command.ack",
    "command.error",
  ].includes(name)
}

/**
 * Validates that a worker event name is known
 */
export function isWorkerEventName(name: string): name is WorkerEventName {
  return ["item.created", "item.updated", "item.deleted", "heartbeat"].includes(name)
}
