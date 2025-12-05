import { runCliProvider } from "../generator/workflow/services/cli-runner"
import { logger } from "../../logger"

const TITLE_PATTERNS = [
  /Title:\s*(.+)/i,
  /Position:\s*(.+)/i,
  /Role:\s*(.+)/i,
  /Job:\s*(.+)/i,
  /^(.+)\s+\|\s+[^|]*location/i,
  /hiring[:\s]+(.+?)(?:\s+at|\s+for|\s*$)/i
]

const COMPANY_PATTERNS = [
  /Company:\s*(.+)/i,
  /Employer:\s*(.+)/i,
  /at\s+([A-Za-z0-9 .,&'-]{2,60})/i,
  /from\s+([A-Za-z0-9 .,&'-]{2,60})/i
]

const LOCATION_PATTERNS = [
  /Location:\s*(.+)/i,
  /(?:Remote|Hybrid|On-?site)\s*[-–]\s*(.+)/i,
  /\b(Remote|Hybrid|On-?site)\b/i
]

export type ParsedEmailJob = {
  url: string
  title?: string
  company?: string
  location?: string
  description?: string
}

export type ParseOptions = {
  aiFallbackEnabled?: boolean
}

export function parseEmailBody(body: string, urls: string[]): ParsedEmailJob[] {
  return urls.map((url) => {
    const title = extractFirst(body, TITLE_PATTERNS)
    const company = extractFirst(body, COMPANY_PATTERNS)
    const location = extractFirst(body, LOCATION_PATTERNS)

    return {
      url,
      title,
      company,
      location,
      description: truncate(body, 6000)
    }
  })
}

export async function parseEmailBodyWithAiFallback(
  body: string,
  urls: string[],
  options?: ParseOptions
): Promise<ParsedEmailJob[]> {
  const results = parseEmailBody(body, urls)

  if (!options?.aiFallbackEnabled) {
    return results
  }

  // Check if any results are missing key fields
  const needsAi = results.some((r) => !r.title && !r.company)

  if (!needsAi) {
    return results
  }

  // Try AI parsing for the whole email body
  try {
    const aiParsed = await parseWithAi(body, urls)
    if (aiParsed) {
      // Merge AI results with regex results, preferring regex when available
      return results.map((regexResult, idx) => {
        const aiResult = aiParsed[idx]
        if (!aiResult) return regexResult

        return {
          url: regexResult.url,
          title: regexResult.title || aiResult.title,
          company: regexResult.company || aiResult.company,
          location: regexResult.location || aiResult.location,
          description: regexResult.description
        }
      })
    }
  } catch (error) {
    logger.warn({ error: String(error) }, "AI fallback parsing failed, using regex results")
  }

  return results
}

async function parseWithAi(body: string, urls: string[]): Promise<ParsedEmailJob[] | null> {
  const truncatedBody = truncate(body, 4000)
  const prompt = `Extract job listing details from this email. Return a JSON array with objects containing: title, company, location (if found).

Email content:
${truncatedBody}

URLs found: ${urls.join(", ")}

Return ONLY valid JSON array, no other text. Example: [{"title": "Software Engineer", "company": "Acme Corp", "location": "Remote"}]`

  try {
    const result = await runCliProvider(prompt)
    if (!result.success || !result.output) {
      return null
    }

    // Try to extract JSON from the output
    const jsonMatch = result.output.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ title?: string; company?: string; location?: string }>

    // Map to ParsedEmailJob format
    return urls.map((url, idx) => ({
      url,
      title: parsed[idx]?.title,
      company: parsed[idx]?.company,
      location: parsed[idx]?.location,
      description: truncate(body, 6000)
    }))
  } catch (error) {
    logger.debug({ error: String(error) }, "Failed to parse AI response as JSON")
    return null
  }
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
