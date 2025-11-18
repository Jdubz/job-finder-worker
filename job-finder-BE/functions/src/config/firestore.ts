/**
 * Firestore Configuration
 *
 * Centralized Firestore initialization factory.
 * Provides consistent configuration across all services while remaining test-friendly.
 */

import { Firestore } from "@google-cloud/firestore"
import { DATABASE_ID } from "./database"

/**
 * Create a new Firestore instance with consistent configuration
 *
 * Note: This creates a new instance each time for test compatibility.
 * In production, Firestore client library handles connection pooling internally.
 *
 * @returns Firestore instance configured for the current environment
 */
export const createFirestoreInstance = (): Firestore => {
  return new Firestore({
    databaseId: DATABASE_ID,
  })
}
