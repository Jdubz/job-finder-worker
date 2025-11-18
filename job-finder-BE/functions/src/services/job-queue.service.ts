import { createFirestoreInstance } from "../config/firestore";
import { createDefaultLogger } from "../utils/logger";
import type { SimpleLogger } from "../types/logger.types";
import type {
  QueueItem,
  QueueStats,
  StopList,
  AISettings,
  QueueSettings,
  StopListCheckResult,
  ScrapeConfig,
  QueueSource,
  CompanySubTask,
} from "../types/job-queue.types";

/**
 * Job Queue Service
 *
 * Manages job queue operations, stop list validation, and queue statistics.
 * Integrates with Firestore for persistent storage and real-time updates.
 */
export class JobQueueService {
  private db: FirebaseFirestore.Firestore;
  private logger: SimpleLogger;
  private readonly queueCollection = "job-queue";
  private readonly configCollection = "job-finder-config";

  constructor(logger?: SimpleLogger) {
    this.db = createFirestoreInstance();
    this.logger = logger || createDefaultLogger();
  }

  /**
   * Submit a job to the queue
   *
   * If generationId is provided, the job will be marked as having documents already generated
   * userId can be null for anonymous submissions
   */
  async submitJob(
    url: string,
    companyName: string | undefined,
    userId: string | null,
    generationId?: string
  ): Promise<QueueItem & { id: string }> {
    try {
      // Get queue settings for max retries
      const settings = await this.getQueueSettings();
      const now = new Date();

      const queueItem: QueueItem = {
        type: "job",
        status: generationId ? "success" : "pending",
        url,
        company_name: companyName || "",
        company_id: null,
        source: "user_submission" as QueueSource,
        submitted_by: userId,
        retry_count: 0,
        max_retries: settings.maxRetries,
        created_at: now,
        updated_at: now,
        ...(generationId && {
          result_message: "Documents already generated via Document Builder",
          completed_at: now,
          metadata: {
            generationId,
            documentsPreGenerated: true,
          },
        }),
      };

      const docRef = await this.db.collection(this.queueCollection).add(queueItem);

      this.logger.info("Job submitted to queue", {
        queueItemId: docRef.id,
        url,
        userId,
        hasPreGeneratedDocs: !!generationId,
      });

      return {
        id: docRef.id,
        ...queueItem,
      };
    } catch (error) {
      this.logger.error("Failed to submit job to queue", {
        error,
        url,
        userId,
      });
      throw error;
    }
  }

  /**
   * Submit a company to the queue
   *
   * Creates a queue item with type "company" for company analysis pipeline
   */
  async submitCompany(
    companyName: string,
    websiteUrl: string,
    source: QueueSource,
    userId: string | null
  ): Promise<QueueItem & { id: string }> {
    try {
      // Get queue settings for max retries
      const settings = await this.getQueueSettings();
      const now = new Date();

      const queueItem: QueueItem = {
        type: "company",
        status: "pending",
        url: websiteUrl,
        company_name: companyName,
        company_id: null,
        source,
        submitted_by: userId,
        retry_count: 0,
        max_retries: settings.maxRetries,
        created_at: now,
        updated_at: now,
        company_sub_task: "fetch" as CompanySubTask,
      };

      const docRef = await this.db.collection(this.queueCollection).add(queueItem);

      this.logger.info("Company submitted to queue", {
        queueItemId: docRef.id,
        companyName,
        websiteUrl,
        source,
        userId,
      });

      return {
        id: docRef.id,
        ...queueItem,
      };
    } catch (error) {
      this.logger.error("Failed to submit company to queue", {
        error,
        companyName,
        websiteUrl,
        source,
        userId,
      });
      throw error;
    }
  }

  /**
   * Submit a scrape request to the queue
   *
   * Creates a queue item with type "scrape" and the provided configuration
   */
  async submitScrape(
    userId: string | null,
    scrapeConfig?: ScrapeConfig
  ): Promise<QueueItem & { id: string }> {
    try {
      // Get queue settings for max retries
      const settings = await this.getQueueSettings();
      const now = new Date();

      const queueItem: QueueItem = {
        type: "scrape",
        status: "pending",
        url: "",
        company_name: "",
        company_id: null,
        source: "user_submission" as QueueSource,
        submitted_by: userId,
        retry_count: 0,
        max_retries: settings.maxRetries,
        created_at: now,
        updated_at: now,
        scrape_config: scrapeConfig || {
          target_matches: 5,
          max_sources: 20,
        },
      };

      const docRef = await this.db.collection(this.queueCollection).add(queueItem);

      this.logger.info("Scrape request submitted to queue", {
        queueItemId: docRef.id,
        userId,
        config: scrapeConfig,
      });

      return {
        id: docRef.id,
        ...queueItem,
      };
    } catch (error) {
      this.logger.error("Failed to submit scrape request to queue", {
        error,
        userId,
        config: scrapeConfig,
      });
      throw error;
    }
  }

  /**
   * Get queue item status by ID
   */
  async getQueueStatus(queueItemId: string): Promise<(QueueItem & { id: string }) | null> {
    try {
      const docRef = this.db.collection(this.queueCollection).doc(queueItemId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data() as QueueItem,
      };
    } catch (error) {
      this.logger.error("Failed to get queue status", { error, queueItemId });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const snapshot = await this.db.collection(this.queueCollection).get();

      const stats: QueueStats = {
        total: snapshot.size,
        pending: 0,
        processing: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        filtered: 0,
      };

      snapshot.forEach((doc) => {
        const item = doc.data() as QueueItem;

        // Count by status
        if (item.status === "pending") stats.pending++;
        else if (item.status === "processing") stats.processing++;
        else if (item.status === "success") stats.success++;
        else if (item.status === "failed") stats.failed++;
        else if (item.status === "skipped") stats.skipped++;
        else if (item.status === "filtered") stats.filtered++;
      });

      return stats;
    } catch (error) {
      this.logger.error("Failed to get queue stats", { error });
      throw error;
    }
  }

  /**
   * Retry a failed queue item
   */
  async retryQueueItem(queueItemId: string): Promise<void> {
    try {
      const docRef = this.db.collection(this.queueCollection).doc(queueItemId);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error("Queue item not found");
      }

      const item = doc.data() as QueueItem;

      if (item.status !== "failed") {
        throw new Error("Can only retry failed queue items");
      }

      if (item.retry_count >= item.max_retries) {
        throw new Error("Maximum retry count exceeded");
      }

      await docRef.update({
        status: "pending",
        retry_count: item.retry_count + 1,
        updated_at: new Date(),
        error_message: null,
      });

      this.logger.info("Queue item retry initiated", {
        queueItemId,
        retryCount: item.retry_count + 1,
      });
    } catch (error) {
      this.logger.error("Failed to retry queue item", { error, queueItemId });
      throw error;
    }
  }

  /**
   * Delete a queue item
   */
  async deleteQueueItem(queueItemId: string): Promise<void> {
    try {
      await this.db.collection(this.queueCollection).doc(queueItemId).delete();

      this.logger.info("Queue item deleted", { queueItemId });
    } catch (error) {
      this.logger.error("Failed to delete queue item", { error, queueItemId });
      throw error;
    }
  }

  /**
   * Get stop list configuration
   */
  async getStopList(): Promise<StopList> {
    try {
      const docRef = this.db.collection(this.configCollection).doc("stopList");
      const doc = await docRef.get();

      if (!doc.exists) {
        // Return default empty stop list
        return {
          excludedCompanies: [],
          excludedKeywords: [],
          excludedDomains: [],
        };
      }

      return doc.data() as StopList;
    } catch (error) {
      this.logger.error("Failed to get stop list", { error });
      throw error;
    }
  }

  /**
   * Update stop list configuration
   */
  async updateStopList(stopList: StopList): Promise<void> {
    try {
      await this.db
        .collection(this.configCollection)
        .doc("stopList")
        .set(stopList, { merge: true });

      this.logger.info("Stop list updated", {
        companiesCount: stopList.excludedCompanies.length,
        keywordsCount: stopList.excludedKeywords.length,
        domainsCount: stopList.excludedDomains.length,
      });
    } catch (error) {
      this.logger.error("Failed to update stop list", { error });
      throw error;
    }
  }

  /**
   * Get AI settings configuration
   */
  async getAISettings(): Promise<AISettings> {
    try {
      const docRef = this.db.collection(this.configCollection).doc("aiSettings");
      const doc = await docRef.get();

      if (!doc.exists) {
        // Return default AI settings
        return {
          provider: "claude",
          model: "claude-3-5-sonnet-20241022",
          minMatchScore: 70,
          costBudgetDaily: 10.0,
        };
      }

      return doc.data() as AISettings;
    } catch (error) {
      this.logger.error("Failed to get AI settings", { error });
      throw error;
    }
  }

  /**
   * Update AI settings configuration
   */
  async updateAISettings(settings: AISettings): Promise<void> {
    try {
      await this.db
        .collection(this.configCollection)
        .doc("aiSettings")
        .set(settings, { merge: true });

      this.logger.info("AI settings updated", settings);
    } catch (error) {
      this.logger.error("Failed to update AI settings", { error });
      throw error;
    }
  }

  /**
   * Get queue settings configuration
   */
  async getQueueSettings(): Promise<QueueSettings> {
    try {
      const docRef = this.db.collection(this.configCollection).doc("queueSettings");
      const doc = await docRef.get();

      if (!doc.exists) {
        // Return default queue settings
        return {
          maxRetries: 3,
          retryDelaySeconds: 300,
          processingTimeout: 3600,
        };
      }

      return doc.data() as QueueSettings;
    } catch (error) {
      this.logger.error("Failed to get queue settings", { error });
      throw error;
    }
  }

  /**
   * Update queue settings configuration
   */
  async updateQueueSettings(settings: QueueSettings): Promise<void> {
    try {
      await this.db
        .collection(this.configCollection)
        .doc("queueSettings")
        .set(settings, { merge: true });

      this.logger.info("Queue settings updated", settings);
    } catch (error) {
      this.logger.error("Failed to update queue settings", { error });
      throw error;
    }
  }

  /**
   * Check if a job should be filtered by stop list
   */
  async checkStopList(
    companyName: string,
    url: string
  ): Promise<StopListCheckResult> {
    try {
      const stopList = await this.getStopList();
      const result: StopListCheckResult = {
        allowed: true,
      };

      // Extract domain from URL
      const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");

      // Check excluded domains
      if (stopList.excludedDomains.some((d: string) => domain.includes(d.toLowerCase()))) {
        result.allowed = false;
        result.reason = "domain";
        return result;
      }

      // Check excluded companies
      const lowerCompanyName = companyName.toLowerCase();
      if (
        stopList.excludedCompanies.some((company: string) =>
          lowerCompanyName.includes(company.toLowerCase())
        )
      ) {
        result.allowed = false;
        result.reason = "company";
        return result;
      }

      // Check excluded keywords
      if (
        stopList.excludedKeywords.some((keyword: string) =>
          lowerCompanyName.includes(keyword.toLowerCase())
        )
      ) {
        result.allowed = false;
        result.reason = "keyword";
        return result;
      }

      return result;
    } catch (error) {
      this.logger.error("Failed to check stop list", { error, companyName, url });
      // Return allowed on error (fail open)
      return {
        allowed: true,
      };
    }
  }
}
