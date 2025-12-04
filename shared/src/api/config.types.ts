import type { JobFinderConfigEntry } from "../config.types"

export interface ListConfigEntriesResponse {
  configs: JobFinderConfigEntry[]
}

export interface GetConfigEntryResponse {
  config: JobFinderConfigEntry
}

export interface UpsertConfigEntryRequest {
  id: string
  payload: Record<string, unknown>
}

export interface UpsertConfigEntryResponse {
  config: JobFinderConfigEntry
}
