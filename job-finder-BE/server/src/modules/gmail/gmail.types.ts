export type GmailIngestConfig = {
  enabled: boolean
  label?: string
  query?: string
  maxMessages?: number
  allowedSenders?: string[]
  allowedDomains?: string[]
  remoteSourceDefault?: boolean
  aiFallbackEnabled?: boolean
  defaultLabelOwner?: string | null
}

export function isGmailIngestConfig(value: unknown): value is GmailIngestConfig {
  if (!value || typeof value !== 'object') return false
  const v = value as GmailIngestConfig
  return typeof v.enabled === 'boolean'
}
