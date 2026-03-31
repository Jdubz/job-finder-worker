export type GmailTrackerConfig = {
  enabled: boolean
  maxAgeDays?: number
  maxMessages?: number
  label?: string
  confidenceThreshold?: number
}

export function isGmailTrackerConfig(value: unknown): value is GmailTrackerConfig {
  if (!value || typeof value !== "object") return false
  const v = value as GmailTrackerConfig
  return typeof v.enabled === "boolean"
}
