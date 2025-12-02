export type StatusTone = "success" | "warning" | "info" | "muted" | "danger" | "neutral"

const STATUS_MAP: Record<string, StatusTone> = {
  active: "success",
  analyzed: "success",
  matched: "success",
  success: "success",

  paused: "warning",
  filtered: "warning",
  skipped: "warning",
  disabled: "warning",

  analyzing: "info",
  processing: "info",
  pending: "info",
  discovery: "info",

  error: "danger",
  failed: "danger",

  company: "neutral",
  scrape: "neutral",
  job: "neutral",
  "scrape sweep": "neutral",
  queue: "neutral",
}

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-800",
  warning: "bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800",
  info: "bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800",
  danger: "bg-destructive/10 text-destructive border border-destructive/30",
  muted: "bg-muted text-muted-foreground border border-border",
  neutral: "bg-secondary text-secondary-foreground border border-border/70",
}

export function statusBadgeClass(status: string): string {
  const tone = STATUS_MAP[status?.toLowerCase?.()] ?? "neutral"
  return TONE_CLASSES[tone]
}
