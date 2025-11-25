/**
 * @shared/types
 *
 * Shared TypeScript types for job-finder integration (BE + FE)
 */

// Core types
export * from "./queue.types"
export * from "./job.types"
export * from "./logging.types"
export * from "./generator.types"
export * from "./content-item.types"
export * from "./time.types"
export * from "./config.types"
export * from "./contact.types"

// API types
export * from "./api.types"
export * from "./api/generator.types"
export * from "./api/content.types"
export * from "./api/queue.types"
export * from "./api/job-match.types"
export * from "./api/contact.types"
export * from "./api/config.types"
export * from "./api/prompts.types"

// Type guards and utilities
export * from "./guards"
