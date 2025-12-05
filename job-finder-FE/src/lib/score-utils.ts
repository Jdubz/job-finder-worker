import type { JobListingRecord } from "@shared/types"

/**
 * Score thresholds for categorizing job matches.
 * These are used consistently across the frontend for:
 * - Color coding scores
 * - Filtering matches by category
 * - Computing statistics
 */
export const SCORE_THRESHOLDS = {
  /** Minimum score for "High" category (green) */
  HIGH: 85,
  /** Minimum score for "Medium" category (yellow). Below this is "Low" (orange) */
  MEDIUM: 70,
} as const

/**
 * Returns the appropriate CSS classes for displaying a match score.
 * Uses consistent thresholds across the application.
 */
export function getScoreColor(score: number): string {
  if (score >= SCORE_THRESHOLDS.HIGH) return "text-green-600 font-bold"
  if (score >= SCORE_THRESHOLDS.MEDIUM) return "text-yellow-600 font-semibold"
  return "text-orange-600"
}

/**
 * Extracts the match score from a job listing record.
 *
 * Checks in order:
 * 1. Direct matchScore column (populated by worker from deterministic scoring)
 * 2. Fallback: filterResult.scoring.finalScore
 *
 * @returns The match score (0-100) or null if not available
 */
export function extractMatchScore(listing: JobListingRecord): number | null {
  // Use direct matchScore column first (populated by worker from deterministic scoring)
  if (typeof listing.matchScore === "number") return listing.matchScore

  // Fallback: extract from filterResult.scoring.finalScore
  if (listing.filterResult?.scoring?.finalScore != null) {
    return listing.filterResult.scoring.finalScore
  }

  return null
}
