const TITLE_PATTERNS = [
  /Title:\s*(.+)/i,
  /Position:\s*(.+)/i,
  /^(.+)\s+\|\s+[^|]*location/i
]

const COMPANY_PATTERNS = [
  /Company:\s*(.+)/i,
  /at\s+([A-Za-z0-9 .,&'-]{2,60})/i
]

export type ParsedEmailJob = {
  url: string
  title?: string
  company?: string
  location?: string
  description?: string
}

export function parseEmailBody(body: string, urls: string[]): ParsedEmailJob[] {
  return urls.map((url) => {
    return {
      url,
      title: extractFirst(body, TITLE_PATTERNS),
      company: extractFirst(body, COMPANY_PATTERNS),
      description: truncate(body, 6000)
    }
  })
}

function extractFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re)
    if (m && m[1]) {
      return sanitize(m[1])
    }
  }
  return undefined
}

function sanitize(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(text: string, max: number): string {
  if (!text) return ""
  return text.length <= max ? text : text.slice(0, max)
}
