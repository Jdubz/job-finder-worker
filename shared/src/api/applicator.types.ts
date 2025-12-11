/**
 * Applicator API Types
 *
 * Type definitions for the job applicator endpoint that provides
 * pre-formatted profile data optimized for AI prompt injection.
 */

/**
 * GET /api/applicator/profile response
 *
 * Returns complete user profile formatted as plain text for AI consumption.
 * This reduces token usage compared to sending raw JSON structures.
 */
export interface GetApplicatorProfileResponse {
  /**
   * Pre-formatted profile text including:
   * - Personal contact information
   * - EEO demographic data (if provided)
   * - Complete work history with highlights
   * - Education history
   * - Aggregated skills summary
   *
   * Formatted in markdown-style sections for readability and
   * efficient parsing by AI models.
   */
  profileText: string
}
