/**
 * Firestore Collection Hook
 *
 * Generic hook for subscribing to Firestore collections with automatic cleanup
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { useFirestore } from "@/contexts/FirestoreContext"
import type {
  CollectionTypeMap,
  DocumentWithId,
  QueryConstraints,
} from "@/services/firestore/types"

interface UseFirestoreCollectionOptions<K extends keyof CollectionTypeMap> {
  collectionName: K
  constraints?: QueryConstraints
  cacheKey?: string
  enabled?: boolean
}

interface UseFirestoreCollectionResult<T> {
  data: DocumentWithId<T>[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to subscribe to a Firestore collection with real-time updates
 */
export function useFirestoreCollection<K extends keyof CollectionTypeMap>({
  collectionName,
  constraints,
  cacheKey,
  enabled = true,
}: UseFirestoreCollectionOptions<K>): UseFirestoreCollectionResult<CollectionTypeMap[K]> {
  const { subscribeToCollection, service } = useFirestore()
  const [data, setData] = useState<DocumentWithId<CollectionTypeMap[K]>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [hasSubscriptionError, setHasSubscriptionError] = useState(false)

  // Memoize the stringified constraints to avoid unnecessary re-renders
  const constraintsKey = useMemo(() => JSON.stringify(constraints), [constraints])

  useEffect(() => {
    if (!enabled || hasSubscriptionError) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = subscribeToCollection(
      collectionName,
      (newData) => {
        setData(newData)
        setLoading(false)
        // setHasSubscriptionError(false) // Removed to prevent duplicate subscriptions
      },
      (err) => {
        setError(err)
        setLoading(false)
        setHasSubscriptionError(true)
      },
      constraints,
      cacheKey
    )

    return () => {
      unsubscribe()
    }
  }, [collectionName, constraintsKey, cacheKey, enabled, subscribeToCollection, constraints])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    setHasSubscriptionError(false)

    try {
      const newData = await service.getDocuments(collectionName, constraints)
      setData(newData)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [service, collectionName, constraints])

  return {
    data,
    loading,
    error,
    refetch,
  }
}
