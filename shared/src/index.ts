/**
 * @shared/types
 *
 * Shared TypeScript types for job-finder integration (BE + FE)
 */

// Core types
export * from "./queue.types"
export * from "./queue-events.types"
export * from "./job.types"
export * from "./logging.types"
export * from "./generator.types"
export * from "./content-item.types"
export * from "./time.types"
export * from "./config.types"
export * from "./contact.types"
export * from "./agent-cli.types"
export * from "./form-fill-safety"

// API types
export * from "./api.types"
export * from "./api/auth.types"
export * from "./api/generator.types"
// generator.docs types removed (deprecated)
export * from "./api/content.types"
export * from "./api/queue.types"
export * from "./api/job-match.types"
export * from "./api/job-listing.types"
export * from "./api/contact.types"
export * from "./api/config.types"
export * from "./api/prompts.types"
export * from "./api/company.types"
export * from "./api/job-source.types"
export * from "./api/applicator.types"
export * from "./api/chat.types"

// Type guards and utilities
export * from "./guards"

// Runtime schemas (Zod)
export * from "./schemas"
