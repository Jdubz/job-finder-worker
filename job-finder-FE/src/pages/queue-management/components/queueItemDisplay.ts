import type { QueueItem } from "@shared/types"

const titleMap: Record<string, string> = {
  scrape: "Scrape",
  source_discovery: "Discovery",
  job: "Job",
  company: "Company",
  scrape_source: "Scrape Source",
}

export function getTaskTypeLabel(item: QueueItem): string {
  return titleMap[item.type] ?? item.type
}

export function getStageLabel(item: QueueItem): string | null {
  const pipelineState = coercePipelineState(item.pipeline_state)
  const { type } = item

  // Use explicit pipeline_stage if available (set by worker)
  if (pipelineState?.pipeline_stage && typeof pipelineState.pipeline_stage === "string") {
    const stage = pipelineState.pipeline_stage
    // Capitalize first letter
    return stage.charAt(0).toUpperCase() + stage.slice(1)
  }

  // Fall back to deriving stage from pipeline_state keys (legacy)
  if (pipelineState) {
    if ("match_result" in pipelineState) return "Save"
    if ("filter_result" in pipelineState) return "Analyze"
    if ("job_data" in pipelineState) return "Filter"
  }

  if (type === "company") return "Company"
  if (type === "job") return "Scrape"
  if (type === "scrape") return "Scrape sweep"
  if (type === "source_discovery") return "Discovery"
  return null
}

function coercePipelineState(value: unknown): Record<string, unknown> | null {
  if (!value) return null

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Ignore malformed JSON; treat as absent to avoid UI crashes
      return null
    }
  }

  return null
}

export function getJobTitle(item: QueueItem): string | undefined {
  const state = coercePipelineState(item.pipeline_state) ?? {}
  const metadata = item.metadata ?? {}
  const scraped = item.scraped_data ?? {}

  return (
    getNestedString(state, ["job_data", "title"]) ||
    getNestedString(state, ["scraped_job", "title"]) ||
    getString(scraped, "title") ||
    getString(metadata, "job_title") ||
    getString(metadata, "title") ||
    undefined
  )
}

/**
 * Get a descriptive title for scrape items based on their scrape_config.
 * Falls back to result_message if available.
 */
export function getScrapeTitle(item: QueueItem): string | undefined {
  if (item.type !== "scrape") return undefined

  const config = item.scrape_config
  if (config) {
    const parts: string[] = []

    // Target matches info
    if (typeof config.target_matches === "number" && config.target_matches > 0) {
      parts.push(`target: ${config.target_matches} jobs`)
    }

    // Max sources info
    if (typeof config.max_sources === "number" && config.max_sources > 0) {
      parts.push(`max ${config.max_sources} sources`)
    }

    // Specific sources
    if (Array.isArray(config.source_ids) && config.source_ids.length > 0) {
      parts.push(`${config.source_ids.length} source${config.source_ids.length > 1 ? "s" : ""}`)
    }

    if (parts.length > 0) {
      return parts.join(", ")
    }
  }

  // Fall back to result_message if available (e.g., "50 jobs enqueued")
  if (item.result_message) {
    return item.result_message
  }

  return undefined
}

export function getCompanyName(item: QueueItem): string | undefined {
  const state = coercePipelineState(item.pipeline_state) ?? {}
  const metadata = item.metadata ?? {}
  const scraped = item.scraped_data ?? {}

  return (
    item.company_name ||
    getNestedString(state, ["job_data", "company"]) ||
    getString(metadata, "company_name") ||
    getString(scraped, "company") ||
    undefined
  )
}

export function getSourceLabel(item: QueueItem): string | null {
  if (item.source_type) return capitalize(item.source_type.replaceAll("_", " "))
  if (item.source) return capitalize(item.source.replaceAll("_", " "))
  return null
}

export function getDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

function capitalize(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function getString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined
  const value = (obj as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

function getNestedString(obj: unknown, path: string[]): string | undefined {
  let current: unknown = obj
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === "string" ? current : undefined
}
