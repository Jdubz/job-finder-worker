/**
 * AI Output Schema Validation and Recovery
 *
 * Provides Zod schemas for validating AI-generated content and recovery
 * functions to fix common malformations before they cause runtime errors.
 */

import { z } from 'zod'
import type { Logger } from 'pino'
import type { ResumeContent, CoverLetterContent } from '@shared/types'

// =============================================================================
// Zod Schemas (lenient - coerce and provide defaults where possible)
// =============================================================================

/**
 * Resume personal info contact schema
 */
const resumeContactSchema = z.object({
  email: z.string().default(''),
  location: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional()
}).passthrough()

/**
 * Resume personal info schema
 */
const resumePersonalInfoSchema = z.object({
  name: z.string().optional(),
  title: z.string().default(''),
  summary: z.string().optional().default(''),
  contact: resumeContactSchema.optional().default({})
}).passthrough()

/**
 * Resume experience entry schema
 */
const resumeExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().optional().default(''),
  startDate: z.string().default(''),
  endDate: z.union([z.string(), z.null()]).default(null),
  highlights: z.array(z.string()).default([]),
  technologies: z.array(z.string()).optional().default([])
}).passthrough()

/**
 * Resume skills category schema
 */
const resumeSkillsCategorySchema = z.object({
  category: z.string().default('Skills'),
  items: z.array(z.string()).default([])
}).passthrough()

/**
 * Resume education entry schema
 */
const resumeEducationSchema = z.object({
  institution: z.string(),
  degree: z.string().default(''),
  field: z.string().optional().default(''),
  startDate: z.string().optional().default(''),
  endDate: z.string().optional().default('')
}).passthrough()

/**
 * Full resume content schema - lenient with recovery
 */
export const resumeContentSchema = z.object({
  personalInfo: resumePersonalInfoSchema.optional().default({}),
  professionalSummary: z.string().optional().default(''),
  experience: z.array(resumeExperienceSchema).default([]),
  skills: z.array(resumeSkillsCategorySchema).optional().default([]),
  education: z.array(resumeEducationSchema).optional().default([])
}).passthrough()

/**
 * Cover letter content schema - lenient with recovery
 */
export const coverLetterContentSchema = z.object({
  greeting: z.string().default('Hello,'),
  openingParagraph: z.string().default(''),
  bodyParagraphs: z.array(z.string()).default([]),
  closingParagraph: z.string().default(''),
  signature: z.string().default('Best,')
}).passthrough()

// =============================================================================
// Type exports
// =============================================================================

export type ValidatedResumeContent = z.infer<typeof resumeContentSchema>
export type ValidatedCoverLetterContent = z.infer<typeof coverLetterContentSchema>

// =============================================================================
// Recovery Functions
// =============================================================================

/**
 * Attempts to extract JSON from a string that may have markdown code blocks
 * or other text surrounding the JSON.
 */
function extractJsonFromText(text: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find JSON object boundaries
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }

  return text
}

/**
 * Normalizes skills that may come in various formats:
 * - string[] -> [{category: 'Skills', items: [...]}]
 * - single object -> [object]
 * - already array -> passthrough
 */
function normalizeSkills(skills: unknown): Array<{ category: string; items: string[] }> {
  if (!skills) return []

  // If it's a string array, wrap it
  if (Array.isArray(skills) && skills.length > 0 && typeof skills[0] === 'string') {
    return [{ category: 'Skills', items: skills as string[] }]
  }

  // If it's a single object with items
  if (skills && typeof skills === 'object' && !Array.isArray(skills) && 'items' in skills) {
    const obj = skills as { category?: string; items?: unknown[] }
    return [{
      category: obj.category || 'Skills',
      items: Array.isArray(obj.items) ? obj.items.filter((i): i is string => typeof i === 'string') : []
    }]
  }

  // If it's already an array, normalize each entry
  if (Array.isArray(skills)) {
    return skills
      .filter((s): s is object => s !== null && typeof s === 'object')
      .map((s) => {
        const obj = s as { category?: string; items?: unknown[] }
        return {
          category: obj.category || 'Skills',
          items: Array.isArray(obj.items) ? obj.items.filter((i): i is string => typeof i === 'string') : []
        }
      })
      .filter((s) => s.items.length > 0)
  }

  return []
}

/**
 * Normalizes bodyParagraphs which AI may return as:
 * - undefined/null -> []
 * - string -> [string]
 * - object with text -> [object.text]
 * - array with mixed types -> filtered to strings only
 */
function normalizeBodyParagraphs(body: unknown): string[] {
  if (!body) return []

  // Single string
  if (typeof body === 'string') {
    return body.trim() ? [body.trim()] : []
  }

  // Object with text property
  if (typeof body === 'object' && !Array.isArray(body) && body !== null) {
    const obj = body as Record<string, unknown>
    if (typeof obj.text === 'string') return [obj.text]
    if (typeof obj.content === 'string') return [obj.content]
    if (typeof obj.paragraph === 'string') return [obj.paragraph]
  }

  // Array - filter to valid strings
  if (Array.isArray(body)) {
    return body
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          if (typeof obj.text === 'string') return obj.text.trim()
          if (typeof obj.content === 'string') return obj.content.trim()
        }
        return ''
      })
      .filter((s) => s.length > 0)
  }

  return []
}

/**
 * Normalizes experience entries which may have various field name variations
 */
function normalizeExperience(exp: unknown): Array<{
  company: string
  role: string
  location: string
  startDate: string
  endDate: string | null
  highlights: string[]
  technologies: string[]
}> {
  if (!Array.isArray(exp)) return []

  return exp
    .filter((e): e is object => e !== null && typeof e === 'object')
    .map((e) => {
      const obj = e as Record<string, unknown>
      return {
        company: String(obj.company || obj.companyName || obj.employer || ''),
        role: String(obj.role || obj.title || obj.position || obj.jobTitle || ''),
        location: String(obj.location || obj.city || ''),
        startDate: String(obj.startDate || obj.start || obj.from || ''),
        endDate: obj.endDate === null || obj.endDate === 'Present' || obj.endDate === 'present'
          ? null
          : String(obj.endDate || obj.end || obj.to || ''),
        highlights: Array.isArray(obj.highlights)
          ? obj.highlights.filter((h): h is string => typeof h === 'string')
          : Array.isArray(obj.bullets)
            ? (obj.bullets as unknown[]).filter((h): h is string => typeof h === 'string')
            : Array.isArray(obj.achievements)
              ? (obj.achievements as unknown[]).filter((h): h is string => typeof h === 'string')
              : [],
        technologies: Array.isArray(obj.technologies)
          ? obj.technologies.filter((t): t is string => typeof t === 'string')
          : Array.isArray(obj.tech)
            ? (obj.tech as unknown[]).filter((t): t is string => typeof t === 'string')
            : Array.isArray(obj.skills)
              ? (obj.skills as unknown[]).filter((t): t is string => typeof t === 'string')
              : []
      }
    })
    .filter((e) => e.company || e.role) // Must have at least company or role
}

// =============================================================================
// Main Validation & Recovery Functions
// =============================================================================

export interface ValidationResult<T> {
  success: boolean
  data?: T
  errors?: string[]
  recovered?: boolean
  recoveryActions?: string[]
}

/**
 * Validates and recovers resume content from AI output.
 * Attempts to fix common issues before failing.
 */
export function validateResumeContent(
  rawOutput: string,
  log?: Logger
): ValidationResult<ResumeContent> {
  const recoveryActions: string[] = []

  // Step 1: Extract JSON from potentially wrapped text
  let jsonStr = rawOutput
  if (!rawOutput.trim().startsWith('{')) {
    jsonStr = extractJsonFromText(rawOutput)
    if (jsonStr !== rawOutput) {
      recoveryActions.push('Extracted JSON from markdown code block or surrounding text')
    }
  }

  // Step 2: Parse JSON
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonStr)
  } catch (parseError) {
    log?.warn({ rawOutput: rawOutput.slice(0, 500) }, 'Failed to parse resume JSON')
    return {
      success: false,
      errors: [`JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`]
    }
  }

  // Step 3: Apply field-level recovery
  if (parsed.skills) {
    const originalSkills = parsed.skills
    parsed.skills = normalizeSkills(parsed.skills)
    if (JSON.stringify(originalSkills) !== JSON.stringify(parsed.skills)) {
      recoveryActions.push('Normalized skills format')
    }
  }

  if (parsed.experience) {
    const originalExp = parsed.experience
    parsed.experience = normalizeExperience(parsed.experience)
    if (JSON.stringify(originalExp) !== JSON.stringify(parsed.experience)) {
      recoveryActions.push('Normalized experience entries')
    }
  }

  // Handle alternative field names
  if (!parsed.professionalSummary && parsed.summary) {
    parsed.professionalSummary = parsed.summary
    recoveryActions.push('Mapped "summary" to "professionalSummary"')
  }

  // Step 4: Validate with Zod schema
  const result = resumeContentSchema.safeParse(parsed)

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    log?.warn({ errors, parsed }, 'Resume content validation failed after recovery')
    return {
      success: false,
      errors,
      recoveryActions: recoveryActions.length > 0 ? recoveryActions : undefined
    }
  }

  if (recoveryActions.length > 0) {
    log?.info({ recoveryActions }, 'Resume content recovered successfully')
  }

  return {
    success: true,
    data: result.data as ResumeContent,
    recovered: recoveryActions.length > 0,
    recoveryActions: recoveryActions.length > 0 ? recoveryActions : undefined
  }
}

/**
 * Validates and recovers cover letter content from AI output.
 * Attempts to fix common issues before failing.
 */
export function validateCoverLetterContent(
  rawOutput: string,
  log?: Logger
): ValidationResult<CoverLetterContent> {
  const recoveryActions: string[] = []

  // Step 1: Extract JSON from potentially wrapped text
  let jsonStr = rawOutput
  if (!rawOutput.trim().startsWith('{')) {
    jsonStr = extractJsonFromText(rawOutput)
    if (jsonStr !== rawOutput) {
      recoveryActions.push('Extracted JSON from markdown code block or surrounding text')
    }
  }

  // Step 2: Parse JSON
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonStr)
  } catch (parseError) {
    log?.warn({ rawOutput: rawOutput.slice(0, 500) }, 'Failed to parse cover letter JSON')
    return {
      success: false,
      errors: [`JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`]
    }
  }

  // Step 3: Apply field-level recovery
  const originalBody = parsed.bodyParagraphs
  parsed.bodyParagraphs = normalizeBodyParagraphs(parsed.bodyParagraphs)
  if (JSON.stringify(originalBody) !== JSON.stringify(parsed.bodyParagraphs)) {
    recoveryActions.push('Normalized bodyParagraphs format')
  }

  // Handle alternative field names
  if (!parsed.openingParagraph && parsed.opening) {
    parsed.openingParagraph = parsed.opening
    recoveryActions.push('Mapped "opening" to "openingParagraph"')
  }
  if (!parsed.closingParagraph && parsed.closing) {
    parsed.closingParagraph = parsed.closing
    recoveryActions.push('Mapped "closing" to "closingParagraph"')
  }
  if (!parsed.signature && parsed.signOff) {
    parsed.signature = parsed.signOff
    recoveryActions.push('Mapped "signOff" to "signature"')
  }

  // If bodyParagraphs still empty but we have body/content, try those
  if ((parsed.bodyParagraphs as string[]).length === 0) {
    if (parsed.body) {
      parsed.bodyParagraphs = normalizeBodyParagraphs(parsed.body)
      if ((parsed.bodyParagraphs as string[]).length > 0) {
        recoveryActions.push('Extracted bodyParagraphs from "body" field')
      }
    } else if (parsed.content) {
      parsed.bodyParagraphs = normalizeBodyParagraphs(parsed.content)
      if ((parsed.bodyParagraphs as string[]).length > 0) {
        recoveryActions.push('Extracted bodyParagraphs from "content" field')
      }
    } else if (parsed.paragraphs) {
      parsed.bodyParagraphs = normalizeBodyParagraphs(parsed.paragraphs)
      if ((parsed.bodyParagraphs as string[]).length > 0) {
        recoveryActions.push('Extracted bodyParagraphs from "paragraphs" field')
      }
    }
  }

  // Step 4: Validate with Zod schema
  const result = coverLetterContentSchema.safeParse(parsed)

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    log?.warn({ errors, parsed }, 'Cover letter content validation failed after recovery')
    return {
      success: false,
      errors,
      recoveryActions: recoveryActions.length > 0 ? recoveryActions : undefined
    }
  }

  if (recoveryActions.length > 0) {
    log?.info({ recoveryActions }, 'Cover letter content recovered successfully')
  }

  return {
    success: true,
    data: result.data as CoverLetterContent,
    recovered: recoveryActions.length > 0,
    recoveryActions: recoveryActions.length > 0 ? recoveryActions : undefined
  }
}
