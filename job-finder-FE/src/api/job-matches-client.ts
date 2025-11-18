/**
 * Job Matches API Client
 *
 * Handles querying job matches from Firestore.
 * Uses FirestoreService for consistent data access.
 */

import { firestoreService } from "@/services/firestore"
import type { QueryConstraints, UnsubscribeFn } from "@/services/firestore/types"
import type { JobMatch } from "@shared/types"

export interface JobMatchFilters {
  minScore?: number
  maxScore?: number
  companyName?: string
  limit?: number
}

export class JobMatchesClient {
  private collectionName = "job-matches" as const

  /**
   * Build query constraints from filters
   */
  private buildConstraints(filters?: JobMatchFilters): QueryConstraints {
    const whereConstraints: QueryConstraints["where"] = []

    // Apply score filters
    if (filters?.minScore !== undefined) {
      whereConstraints.push({
        field: "matchScore",
        operator: ">=",
        value: filters.minScore,
      })
    }
    if (filters?.maxScore !== undefined) {
      whereConstraints.push({
        field: "matchScore",
        operator: "<=",
        value: filters.maxScore,
      })
    }

    // Apply company filter
    if (filters?.companyName) {
      whereConstraints.push({
        field: "companyName",
        operator: "==",
        value: filters.companyName,
      })
    }

    const constraints: QueryConstraints = {
      where: whereConstraints.length > 0 ? whereConstraints : undefined,
      orderBy: [],
    }

    // Apply limit
    if (filters?.limit) {
      constraints.limit = filters.limit
    }

    return constraints
  }

  /**
   * Get all job matches
   * Single-owner system - all matches are visible
   */
  async getMatches(filters?: JobMatchFilters): Promise<JobMatch[]> {
    const constraints = this.buildConstraints(filters)

    // Order by match score (highest first) for getMatches
    constraints.orderBy = [{ field: "matchScore", direction: "desc" }]

    return (await firestoreService.getDocuments(
      this.collectionName,
      constraints
    )) as unknown as JobMatch[]
  }

  /**
   * Get a specific job match by ID
   */
  async getMatch(matchId: string): Promise<JobMatch | null> {
    return (await firestoreService.getDocument(this.collectionName, matchId)) as JobMatch | null
  }

  /**
   * Subscribe to real-time updates for job matches
   * Single-owner system - all matches are visible
   */
  subscribeToMatches(
    callback: (matches: JobMatch[]) => void,
    filters?: JobMatchFilters,
    onError?: (error: Error) => void
  ): UnsubscribeFn {
    const constraints = this.buildConstraints(filters)

    // Order by creation time (newest first) for subscriptions
    constraints.orderBy = [{ field: "createdAt", direction: "desc" }]

    return firestoreService.subscribeToCollection(
      this.collectionName,
      (matches) => callback(matches as unknown as JobMatch[]),
      onError || ((error) => console.error("Error fetching job matches:", error)),
      constraints
    )
  }

  /**
   * Get match statistics
   * Single-owner system - gets stats for all matches
   */
  async getMatchStats(): Promise<{
    total: number
    highPriority: number
    mediumPriority: number
    lowPriority: number
    averageScore: number
  }> {
    const matches = await this.getMatches()

    const stats = {
      total: matches.length,
      highPriority: matches.filter((m) => m.applicationPriority === "High").length,
      mediumPriority: matches.filter((m) => m.applicationPriority === "Medium").length,
      lowPriority: matches.filter((m) => m.applicationPriority === "Low").length,
      averageScore: 0,
    }

    if (matches.length > 0) {
      stats.averageScore = matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length
    }

    return stats
  }
}

// Export singleton instance
export const jobMatchesClient = new JobMatchesClient()
