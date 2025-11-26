import type { QueueItem } from "@shared/types"

const titleMap: Record<string, string> = {
  scrape: "Scrape",
  source_discovery: "Discovery",
  job: "Job",
  company: "Company",
  scrape_source: "Scrape Source",
}

const subTaskMap: Record<string, string> = {
  scrape: "Scrape",
  filter: "Filter",
  analyze: "Analyze",
  save: "Save",
  fetch: "Fetch",
  extract: "Extract",
}

export function getTaskTypeLabel(item: QueueItem): string {
  return titleMap[item.type] ?? item.type
}

export function getStageLabel(item: QueueItem): string | null {
  const { sub_task, company_sub_task, pipeline_stage, type } = item

  if (sub_task) return `Job · ${subTaskMap[sub_task] ?? capitalize(sub_task)}`
  if (company_sub_task)
    return `Company · ${subTaskMap[company_sub_task] ?? capitalize(company_sub_task)}`
  if (pipeline_stage) return capitalize(pipeline_stage.replaceAll("_", " "))

  if (type === "scrape") return "Scrape sweep"
  if (type === "source_discovery") return "Discovery"
  return null
}

export function getJobTitle(item: QueueItem): string | undefined {
  const state = item.pipeline_state ?? {}
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

export function getCompanyName(item: QueueItem): string | undefined {
  const state = item.pipeline_state ?? {}
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
