import type { ResumeContent } from '@shared/types'

export interface AtsKeywordScore {
  score: number           // 0-100
  matchedKeywords: string[]
  missingKeywords: string[]
  coverage: number        // 0-1 ratio
}

/**
 * Flatten resume content into a single searchable text blob.
 */
function flattenResume(content: ResumeContent): string {
  const parts: string[] = []

  parts.push(content.professionalSummary || '')
  parts.push(content.personalInfo?.title || '')

  for (const exp of content.experience || []) {
    parts.push(exp.role || '')
    parts.push(exp.company || '')
    parts.push(...(exp.highlights || []))
    parts.push(...(exp.technologies || []))
  }

  for (const skill of content.skills || []) {
    parts.push(skill.category || '')
    parts.push(...skill.items)
  }

  for (const proj of content.projects || []) {
    parts.push(proj.name || '')
    parts.push(proj.description || '')
    parts.push(...(proj.highlights || []))
    parts.push(...(proj.technologies || []))
  }

  return parts.join(' ').toLowerCase()
}

/**
 * Extract meaningful keywords from job description text.
 * Filters out common stop words and short terms.
 */
function extractJdKeywords(jdText: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was',
    'one', 'our', 'out', 'has', 'have', 'been', 'will', 'with', 'this', 'that', 'from',
    'they', 'were', 'your', 'what', 'when', 'make', 'like', 'time', 'just', 'know',
    'take', 'come', 'more', 'some', 'than', 'them', 'very', 'also', 'into', 'over',
    'such', 'work', 'role', 'team', 'ability', 'experience', 'years', 'strong',
    'about', 'join', 'looking', 'ideal', 'candidate', 'required', 'preferred',
    'responsibilities', 'qualifications', 'requirements', 'including', 'within',
    'must', 'should', 'would', 'could', 'please', 'apply', 'equal', 'opportunity',
  ])

  const words = jdText
    .toLowerCase()
    .replace(/[^a-z0-9\s.#+]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))

  // Also extract multi-word phrases (2-3 words) that look like tech terms
  const phrases: string[] = []
  const rawWords = jdText.toLowerCase().split(/\s+/)
  for (let i = 0; i < rawWords.length - 1; i++) {
    const two = rawWords.slice(i, i + 2).join(' ').replace(/[^a-z0-9\s.#+]/g, '').trim()
    if (two.length >= 5) phrases.push(two)
    if (i < rawWords.length - 2) {
      const three = rawWords.slice(i, i + 3).join(' ').replace(/[^a-z0-9\s.#+]/g, '').trim()
      if (three.length >= 8) phrases.push(three)
    }
  }

  // Deduplicate
  return [...new Set([...words, ...phrases])]
}

/**
 * Score ATS keyword coverage of a resume against a job description.
 */
export function scoreAtsKeywords(
  resumeContent: ResumeContent,
  jdText: string,
  atsKeywords?: string[]
): AtsKeywordScore {
  const resumeText = flattenResume(resumeContent)

  // Combine explicit ATS keywords with JD-extracted keywords
  const explicitKeywords = (atsKeywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean)
  const jdKeywords = jdText ? extractJdKeywords(jdText) : []

  // Explicit keywords get priority — use them as the primary scoring set
  const primaryKeywords = explicitKeywords.length > 0 ? explicitKeywords : jdKeywords.slice(0, 30)

  if (primaryKeywords.length === 0) {
    return { score: 0, matchedKeywords: [], missingKeywords: [], coverage: 0 }
  }

  const matched: string[] = []
  const missing: string[] = []

  for (const keyword of primaryKeywords) {
    if (resumeText.includes(keyword)) {
      matched.push(keyword)
    } else {
      missing.push(keyword)
    }
  }

  const coverage = matched.length / primaryKeywords.length
  const score = Math.round(coverage * 100)

  return {
    score,
    matchedKeywords: matched,
    missingKeywords: missing,
    coverage
  }
}
