/**
 * Config API Client
 *
 * Handles job-finder configuration management.
 * Manages stop lists, queue settings, and AI settings in Firestore.
 */

import { firestoreService } from "@/services/firestore"
import { createUpdateMetadata } from "@/services/firestore/utils"
import type { StopList, QueueSettings, AISettings } from "@shared/types"

export class ConfigClient {
  private collectionName = "job-finder-config" as const

  /**
   * Get stop list configuration
   */
  async getStopList(): Promise<StopList | null> {
    return (await firestoreService.getDocument(this.collectionName, "stop-list")) as StopList | null
  }

  /**
   * Update stop list configuration
   */
  async updateStopList(stopList: Partial<StopList>, userEmail: string): Promise<void> {
    const existing = await this.getStopList()

    const data = {
      // Default values if creating new
      excludedCompanies: [],
      excludedKeywords: [],
      excludedDomains: [],
      // Merge with existing
      ...existing,
      // Apply updates
      ...stopList,
      // Add metadata
      ...createUpdateMetadata(userEmail),
    }

    await firestoreService.setDocument(this.collectionName, "stop-list", data)
  }

  /**
   * Add company to stop list
   */
  async addExcludedCompany(companyName: string, userEmail: string): Promise<void> {
    const stopList = await this.getStopList()
    const excludedCompanies = stopList?.excludedCompanies || []

    if (!excludedCompanies.includes(companyName)) {
      await this.updateStopList(
        {
          excludedCompanies: [...excludedCompanies, companyName],
        },
        userEmail
      )
    }
  }

  /**
   * Remove company from stop list
   */
  async removeExcludedCompany(companyName: string, userEmail: string): Promise<void> {
    const stopList = await this.getStopList()
    const excludedCompanies = stopList?.excludedCompanies || []

    await this.updateStopList(
      {
        excludedCompanies: excludedCompanies.filter((c) => c !== companyName),
      },
      userEmail
    )
  }

  /**
   * Add keyword to stop list
   */
  async addExcludedKeyword(keyword: string, userEmail: string): Promise<void> {
    const stopList = await this.getStopList()
    const excludedKeywords = stopList?.excludedKeywords || []

    if (!excludedKeywords.includes(keyword)) {
      await this.updateStopList(
        {
          excludedKeywords: [...excludedKeywords, keyword],
        },
        userEmail
      )
    }
  }

  /**
   * Remove keyword from stop list
   */
  async removeExcludedKeyword(keyword: string, userEmail: string): Promise<void> {
    const stopList = await this.getStopList()
    const excludedKeywords = stopList?.excludedKeywords || []

    await this.updateStopList(
      {
        excludedKeywords: excludedKeywords.filter((k) => k !== keyword),
      },
      userEmail
    )
  }

  /**
   * Add domain to stop list
   */
  async addExcludedDomain(domain: string, userEmail: string): Promise<void> {
    const stopList = await this.getStopList()
    const excludedDomains = stopList?.excludedDomains || []

    if (!excludedDomains.includes(domain)) {
      await this.updateStopList(
        {
          excludedDomains: [...excludedDomains, domain],
        },
        userEmail
      )
    }
  }

  /**
   * Remove domain from stop list
   */
  async removeExcludedDomain(domain: string, userEmail: string): Promise<void> {
    const stopList = await this.getStopList()
    const excludedDomains = stopList?.excludedDomains || []

    await this.updateStopList(
      {
        excludedDomains: excludedDomains.filter((d) => d !== domain),
      },
      userEmail
    )
  }

  /**
   * Get queue settings
   */
  async getQueueSettings(): Promise<QueueSettings | null> {
    return (await firestoreService.getDocument(
      this.collectionName,
      "queue-settings"
    )) as QueueSettings | null
  }

  /**
   * Update queue settings
   */
  async updateQueueSettings(settings: Partial<QueueSettings>, userEmail: string): Promise<void> {
    const existing = await this.getQueueSettings()

    const data = {
      // Default values if creating new
      maxRetries: 3,
      retryDelaySeconds: 300,
      processingTimeout: 600,
      // Merge with existing
      ...existing,
      // Apply updates
      ...settings,
      // Add metadata
      ...createUpdateMetadata(userEmail),
    }

    await firestoreService.setDocument(this.collectionName, "queue-settings", data)
  }

  /**
   * Get AI settings
   */
  async getAISettings(): Promise<AISettings | null> {
    return (await firestoreService.getDocument(
      this.collectionName,
      "ai-settings"
    )) as AISettings | null
  }

  /**
   * Update AI settings
   */
  async updateAISettings(settings: Partial<AISettings>, userEmail: string): Promise<void> {
    const existing = await this.getAISettings()

    const data = {
      // Default values if creating new
      provider: "claude",
      model: "claude-sonnet-4",
      minMatchScore: 70,
      costBudgetDaily: 10.0,
      // Merge with existing
      ...existing,
      // Apply updates
      ...settings,
      // Add metadata
      ...createUpdateMetadata(userEmail),
    }

    await firestoreService.setDocument(this.collectionName, "ai-settings", data)
  }
}

// Export singleton instance
export const configClient = new ConfigClient()
