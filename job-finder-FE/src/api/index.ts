/**
 * API Clients Export
 *
 * Central export point for all API clients
 */

export { BaseApiClient, ApiError } from "./base-client"
export { jobMatchesClient, JobMatchesClient } from "./job-matches-client"
export { generatorClient, GeneratorClient } from "./generator-client"
export { configClient, ConfigClient } from "./config-client"
export { promptsClient, PromptsClient } from "./prompts-client"
export { contentItemsClient, ContentItemsClient } from "./content-items-client"
export { queueClient, QueueClient } from "./queue-client"
export { generatorDocumentsClient, GeneratorDocumentsClient } from "./generator-documents-client"

export type { RequestOptions } from "./base-client"
export type { JobMatchFilters } from "./job-matches-client"
export type { PromptConfig } from "@shared/types"
export { DEFAULT_PROMPTS } from "@shared/types"
export type {
  GenerateDocumentRequest,
  GenerateDocumentResponse,
  DocumentHistoryItem,
  UserDefaults,
} from "./generator-client"
