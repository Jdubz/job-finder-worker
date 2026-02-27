/**
 * Normalize job description text before embedding.
 * Strips boilerplate sections (About Us, Benefits, EEO, How to Apply)
 * so the embedding focuses on role-relevant signal.
 */

/**
 * Boilerplate section header patterns (case-insensitive).
 * Each matches the header text that introduces a boilerplate section.
 */
const BOILERPLATE_PATTERNS = [
  /about\s+(?:us|the\s+company|our\s+company)/i,
  /(?:our\s+)?benefits/i,
  /perks/i,
  /what\s+we\s+offer/i,
  /compensation\s+(?:and|&)\s+benefits/i,
  /equal\s+(?:opportunity|employment)/i,
  /eeo\b/i,
  /diversity\s+(?:and|&)\s+inclusion/i,
  /ada\s+statement/i,
  /how\s+to\s+apply/i,
  /application\s+(?:process|instructions)/i,
]

/**
 * Check if a line is a section header (starts with a capitalized word or markdown heading,
 * optionally followed by a colon).
 */
function isSectionHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  // Markdown heading: ## Something
  if (/^#{1,4}\s+\S/.test(trimmed)) return true
  // Plain section header: "Word Word:" or "Word Word Word:"
  if (/^[A-Z][A-Za-z0-9''\s/&,-]{1,60}[:：]\s*$/.test(trimmed)) return true
  return false
}

/**
 * Check if a line's header text matches any boilerplate pattern.
 */
function isBoilerplateHeader(line: string): boolean {
  // Strip markdown heading prefix and trailing colon
  const cleaned = line.trim().replace(/^#+\s*/, '').replace(/[:：]\s*$/, '').trim()
  return BOILERPLATE_PATTERNS.some((p) => p.test(cleaned))
}

/**
 * Normalize job description text for embedding by stripping boilerplate sections.
 *
 * Safety guard: if >70% of the text is stripped, returns the original
 * (unusual formatting — better to embed everything than lose role signal).
 *
 * Returns original for short/empty inputs (< 100 chars).
 */
export function normalizeForEmbedding(text: string): string {
  if (!text || text.length < 100) return text

  const lines = text.split('\n')
  const kept: string[] = []
  let skipping = false

  for (const line of lines) {
    if (isSectionHeader(line) || (line.trim().startsWith('#') && line.trim().length > 2)) {
      if (isBoilerplateHeader(line)) {
        skipping = true
        continue
      } else {
        skipping = false
      }
    }

    if (!skipping) {
      kept.push(line)
    }
  }

  const result = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  // Safety guard: if we stripped too much, the JD has unusual formatting
  if (result.length < text.length * 0.3) {
    return text
  }

  return result
}
