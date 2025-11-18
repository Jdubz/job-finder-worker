/**
 * Minimal Firestore timestamp representation used across shared types.
 *
 * We avoid importing firebase-admin or firebase SDK directly so the
 * shared package can compile in isolation (CI) and consumers are not
 * forced to install server-only dependencies. Firebase timestamps from
 * either SDK satisfy this structural type.
 */
export interface FirestoreTimestamp {
  seconds: number
  nanoseconds: number
  toDate(): Date
  toMillis(): number
}

/**
 * Represents any value that behaves like a Firestore timestamp or a
 * native Date instance. Firebase admin/client timestamps implement the
 * above interface, so they automatically satisfy this union.
 */
export type TimestampLike = Date | FirestoreTimestamp