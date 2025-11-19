// @ts-nocheck
/**
 * Generator Documents Hook
 *
 * Hook for managing generated documents (resume/cover letter history)
 */

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { generatorDocumentsClient } from "@/api"
import type { GeneratorRequest } from "@shared/types"
import type { GeneratorDocumentRecord } from "@shared/types"

// Simplified document interface for UI display
export interface DocumentHistoryItem {
  id: string
  type: "resume" | "cover_letter" | "both"
  jobTitle: string
  companyName: string
  documentUrl?: string
  createdAt: Date
  status: "pending" | "processing" | "completed" | "failed"
  jobMatchId?: string
}

interface UseGeneratorDocumentsResult {
  documents: DocumentHistoryItem[]
  loading: boolean
  error: Error | null
  deleteDocument: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

function transformDocuments(records: GeneratorDocumentRecord[]): DocumentHistoryItem[] {
  return records
    .map((record) => ({ id: record.id, payload: record.payload as GeneratorRequest, createdAt: record.createdAt }))
    .filter((entry): entry is { id: string; payload: GeneratorRequest; createdAt: string } => entry.payload.type === 'request')
    .map(({ id, payload, createdAt }) => {
      const jobTitle = payload.job.role
      const companyName = payload.job.company

      let documentType: 'resume' | 'cover_letter' | 'both' = 'resume'
      if (payload.generateType === 'coverLetter') {
        documentType = 'cover_letter'
      } else if (payload.generateType === 'both') {
        documentType = 'both'
      }

      let documentUrl: string | undefined
      if (payload.files?.resume?.signedUrl) {
        documentUrl = payload.files.resume.signedUrl
      } else if (payload.files?.coverLetter?.signedUrl) {
        documentUrl = payload.files.coverLetter.signedUrl
      }

      const createdAtValue = payload.createdAt ?? createdAt
      const normalizedCreatedAt = createdAtValue instanceof Date
        ? createdAtValue
        : typeof createdAtValue === 'object' && createdAtValue && 'seconds' in createdAtValue
          ? new Date((createdAtValue as { seconds: number }).seconds * 1000)
          : new Date(createdAtValue as string | number)

      return {
        id,
        type: documentType,
        jobTitle,
        companyName,
        documentUrl,
        createdAt: normalizedCreatedAt,
        status: payload.status,
        jobMatchId: payload.jobMatchId,
      }
    })
}

/**
 * Hook to manage generator documents for all users (editors see everything)
 */
export function useGeneratorDocuments(): UseGeneratorDocumentsResult {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<DocumentHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchDocuments = useCallback(async () => {
    if (!user?.uid) {
      setDocuments([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const records = await generatorDocumentsClient.listDocuments()
      setDocuments(transformDocuments(records))
    } catch (err) {
      console.error('Error loading generator documents:', err)
      setError(err as Error)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }, [user?.uid])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const deleteDocument = useCallback(
    async (id: string) => {
      await generatorDocumentsClient.deleteDocument(id)
      await fetchDocuments()
    },
    [fetchDocuments]
  )

  return {
    documents,
    loading,
    error,
    deleteDocument,
    refetch: fetchDocuments,
  }
}
