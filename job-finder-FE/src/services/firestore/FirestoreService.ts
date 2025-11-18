/**
 * Firestore Service
 *
 * Type-safe service layer for Firestore operations with caching and real-time subscriptions
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  startAt,
  onSnapshot,
  Timestamp,
  type Firestore,
  type QueryConstraint,
  type DocumentData,
  type WhereFilterOp,
  type OrderByDirection,
} from "firebase/firestore"
import { db } from "@/config/firebase"
import type {
  CollectionTypeMap,
  DocumentWithId,
  QueryConstraints,
  SubscriptionCallback,
  DocumentSubscriptionCallback,
  ErrorCallback,
  UnsubscribeFn,
  ClientSideDocument,
} from "./types"

/**
 * Convert Firestore Timestamp to Date
 */
function convertTimestamps<T extends DocumentData>(data: T): ClientSideDocument<T> {
  const result: Record<string, unknown> = { ...data }

  for (const key in result) {
    const value = result[key]

    if (value instanceof Timestamp) {
      result[key] = value.toDate()
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = convertTimestamps(value as DocumentData)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object" ? convertTimestamps(item as DocumentData) : item
      )
    }
  }

  return result as ClientSideDocument<T>
}

/**
 * Build query constraints from our simplified format
 */
function buildQueryConstraints(constraints?: QueryConstraints): QueryConstraint[] {
  const queryConstraints: QueryConstraint[] = []

  if (constraints?.where) {
    for (const w of constraints.where) {
      queryConstraints.push(where(w.field, w.operator as WhereFilterOp, w.value))
    }
  }

  if (constraints?.orderBy) {
    for (const o of constraints.orderBy) {
      queryConstraints.push(orderBy(o.field, o.direction as OrderByDirection))
    }
  }

  if (constraints?.limit) {
    queryConstraints.push(limit(constraints.limit))
  }

  if (constraints?.startAfter) {
    queryConstraints.push(startAfter(constraints.startAfter))
  }

  if (constraints?.startAt) {
    queryConstraints.push(startAt(constraints.startAt))
  }

  return queryConstraints
}

/**
 * Firestore Service Class
 *
 * Provides type-safe CRUD operations for all Firestore collections
 */
export class FirestoreService {
  private db: Firestore

  constructor(firestore: Firestore = db) {
    this.db = firestore
  }

  /**
   * Get a single document by ID
   * Returns null if document doesn't exist or on error
   */
  async getDocument<K extends keyof CollectionTypeMap>(
    collectionName: K,
    documentId: string
  ): Promise<DocumentWithId<CollectionTypeMap[K]> | null> {
    try {
      const docRef = doc(this.db, collectionName, documentId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      const data = convertTimestamps(docSnap.data())
      return {
        id: docSnap.id,
        ...data,
      } as DocumentWithId<CollectionTypeMap[K]>
    } catch (error) {
      console.error(`Error getting document from ${String(collectionName)}/${documentId}:`, error)
      // Return null instead of throwing to prevent UI crashes
      return null
    }
  }

  /**
   * Get multiple documents with optional query constraints
   * Returns empty array on error to prevent UI crashes
   */
  async getDocuments<K extends keyof CollectionTypeMap>(
    collectionName: K,
    constraints?: QueryConstraints
  ): Promise<DocumentWithId<CollectionTypeMap[K]>[]> {
    try {
      const collectionRef = collection(this.db, collectionName)
      const queryConstraints = buildQueryConstraints(constraints)

      const q =
        queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : collectionRef

      const querySnapshot = await getDocs(q)

      return querySnapshot.docs.map((doc) => {
        const data = convertTimestamps(doc.data())
        return {
          id: doc.id,
          ...data,
        } as DocumentWithId<CollectionTypeMap[K]>
      })
    } catch (error) {
      console.error(`Error getting documents from ${String(collectionName)}:`, error)
      // Return empty array instead of throwing to prevent UI crashes
      return []
    }
  }

  /**
   * Create a new document with auto-generated ID
   */
  async createDocument<K extends keyof CollectionTypeMap>(
    collectionName: K,
    data: Omit<CollectionTypeMap[K], "id" | "createdAt" | "updatedAt"> & {
      createdAt?: Timestamp | Date
      updatedAt?: Timestamp | Date
    }
  ): Promise<string> {
    const collectionRef = collection(this.db, collectionName)
    const now = Timestamp.now()

    const docData = {
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    }

    const docRef = await addDoc(collectionRef, docData)
    return docRef.id
  }

  /**
   * Create or update a document with a specific ID
   */
  async setDocument<K extends keyof CollectionTypeMap>(
    collectionName: K,
    documentId: string,
    data: Omit<CollectionTypeMap[K], "id" | "createdAt" | "updatedAt"> & {
      createdAt?: Timestamp | Date
      updatedAt?: Timestamp | Date
    },
    merge = true
  ): Promise<void> {
    const docRef = doc(this.db, collectionName, documentId)
    const now = Timestamp.now()

    const docData: Record<string, unknown> = {
      ...data,
      updatedAt: now,
    }

    // Only set createdAt if it's a new document (not merging)
    if (!merge) {
      docData.createdAt = data.createdAt || now
    }

    await setDoc(docRef, docData, { merge })
  }

  /**
   * Update an existing document
   */
  async updateDocument<K extends keyof CollectionTypeMap>(
    collectionName: K,
    documentId: string,
    data: Partial<CollectionTypeMap[K]>
  ): Promise<void> {
    const docRef = doc(this.db, collectionName, documentId)
    const now = Timestamp.now()

    await updateDoc(docRef, {
      ...data,
      updatedAt: now,
    })
  }

  /**
   * Delete a document
   */
  async deleteDocument<K extends keyof CollectionTypeMap>(
    collectionName: K,
    documentId: string
  ): Promise<void> {
    const docRef = doc(this.db, collectionName, documentId)
    await deleteDoc(docRef)
  }

  /**
   * Subscribe to a collection with real-time updates
   */
  subscribeToCollection<K extends keyof CollectionTypeMap>(
    collectionName: K,
    onData: SubscriptionCallback<CollectionTypeMap[K]>,
    onError: ErrorCallback,
    constraints?: QueryConstraints
  ): UnsubscribeFn {
    const collectionRef = collection(this.db, collectionName)
    const queryConstraints = buildQueryConstraints(constraints)

    const q =
      queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : collectionRef

    let hasError = false
    let unsubscribed = false

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (unsubscribed) return
        hasError = false // Reset error flag on successful snapshot
        const documents = snapshot.docs.map((doc) => {
          const data = convertTimestamps(doc.data())
          return {
            id: doc.id,
            ...data,
          } as DocumentWithId<CollectionTypeMap[K]>
        })

        onData(documents)
      },
      (error) => {
        if (unsubscribed || hasError) return
        
        hasError = true
        console.error(`Firestore subscription error in ${collectionName}:`, error)

        // Do not unsubscribe here; let the returned unsubscribe function handle it
        onError(error as Error)
      }
    )

    // Return wrapped unsubscribe to prevent callbacks after unsubscribe
    return () => {
      unsubscribed = true
      unsubscribe()
    }
  }

  /**
   * Subscribe to a single document with real-time updates
   */
  subscribeToDocument<K extends keyof CollectionTypeMap>(
    collectionName: K,
    documentId: string,
    onData: DocumentSubscriptionCallback<CollectionTypeMap[K]>,
    onError: ErrorCallback
  ): UnsubscribeFn {
    const docRef = doc(this.db, collectionName, documentId)

    let hasError = false
    let unsubscribed = false

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (unsubscribed) return
        hasError = false // Reset error flag on successful snapshot
        if (!docSnap.exists()) {
          onData(null)
          return
        }

        const data = convertTimestamps(docSnap.data())
        onData({
          id: docSnap.id,
          ...data,
        } as DocumentWithId<CollectionTypeMap[K]>)
      },
      (error) => {
        if (unsubscribed || hasError) return
        
        hasError = true
        console.error(
          `Firestore document subscription error for ${collectionName}/${documentId}:`,
          error
        )

        // Do not unsubscribe here; let the returned unsubscribe function handle it
        onError(error as Error)
      }
    )

    // Return wrapped unsubscribe to prevent callbacks after unsubscribe
    return () => {
      unsubscribed = true
      unsubscribe()
    }
  }
}

// Export singleton instance
export const firestoreService = new FirestoreService()
