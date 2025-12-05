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
