/**
 * Timestamp utilities (storage-agnostic)
 *
 * Many shared types need to express "a thing that behaves like a timestamp".
 * We no longer depend on any specific backend SDK, but we keep structural support for
 * objects that expose seconds/nanoseconds plus helpers, as well as native Date.
 */

export interface StructuredTimestamp {
  seconds: number
  nanoseconds: number
  toDate(): Date
  toMillis(): number
}

/**
 * Represents any value that can act like a timestamp for our purposes.
 */
export type TimestampLike = Date | StructuredTimestamp
