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
  summary: z.string().default(''),
  contact: resumeContactSchema.default({})
}).passthrough()

/**
 * Resume experience entry schema
 */
const resumeExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.union([z.string(), z.null()]).default(null),
  highlights: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([])
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
  field: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default('')
}).passthrough()

/**
 * Full resume content schema - lenient with recovery
 */
export const resumeContentSchema = z.object({
  personalInfo: resumePersonalInfoSchema.default({}),
  professionalSummary: z.string().default(''),
  experience: z.array(resumeExperienceSchema).default([]),
  skills: z.array(resumeSkillsCategorySchema).default([]),
  education: z.array(resumeEducationSchema).default([])
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
// JSON Schemas for Claude CLI --json-schema flag
// These enforce structured output during generation (not just validation after)
// =============================================================================

/**
 * JSON Schema for cover letter generation.
 * Used with Claude CLI's --json-schema flag to enforce structured output.
 */
export const coverLetterJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    greeting: { type: 'string', description: 'Opening greeting (e.g., "Hello," or "Dear Hiring Manager,")' },
    openingParagraph: { type: 'string', description: 'Opening paragraph introducing yourself and interest' },
    bodyParagraphs: {
      type: 'array',
      items: { type: 'string' },
      description: 'Main body paragraphs highlighting relevant experience'
    },
    closingParagraph: { type: 'string', description: 'Closing paragraph with call to action' },
    signature: { type: 'string', description: 'Sign-off phrase only (e.g., "Best," or "Sincerely,"). Candidate name is added programmatically.' }
  },
  required: ['greeting', 'openingParagraph', 'bodyParagraphs', 'closingParagraph', 'signature'],
  additionalProperties: false
}

/**
 * JSON Schema for resume generation.
 * Used with Claude CLI's --json-schema flag to enforce structured output.
 */
export const resumeJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    personalInfo: {
      type: 'object',
      description: 'Basic personal and contact information for the resume header',
      properties: {
        name: { type: 'string', description: 'Full name of the candidate' },
        title: { type: 'string', description: 'Professional title or headline (e.g., "Senior Software Engineer")' },
        summary: { type: 'string', description: 'Brief professional summary for the header section (optional, professionalSummary is primary)' },
        contact: {
          type: 'object',
          description: 'Contact information',
          properties: {
            email: { type: 'string', description: 'Email address' },
            location: { type: 'string', description: 'City and state/country (e.g., "San Francisco, CA")' },
            website: { type: 'string', description: 'Personal website URL' },
            linkedin: { type: 'string', description: 'LinkedIn profile URL' },
            github: { type: 'string', description: 'GitHub profile URL' }
          },
          required: ['email'],
          additionalProperties: false
        }
      },
      required: ['title', 'contact'],
      additionalProperties: false
    },
    professionalSummary: { type: 'string', description: 'Professional summary paragraph tailored to the job (2-4 sentences)' },
    experience: {
      type: 'array',
      description: 'Work experience entries, most recent first',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company or organization name' },
          role: { type: 'string', description: 'Job title or role' },
          location: { type: 'string', description: 'Work location (city, state/country or "Remote")' },
          startDate: { type: 'string', description: 'Start date (e.g., "Jan 2020" or "2020")' },
          endDate: { type: ['string', 'null'], description: 'End date or null if current position' },
          highlights: { type: 'array', items: { type: 'string' }, description: 'Key achievements and responsibilities as bullet points' },
          technologies: { type: 'array', items: { type: 'string' }, description: 'Technologies and tools used in this role' }
        },
        required: ['company', 'role', 'startDate', 'highlights'],
        additionalProperties: false
      }
    },
    skills: {
      type: 'array',
      description: 'Skills organized by category',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Skill category name (e.g., "Programming Languages", "Cloud & DevOps")' },
          items: { type: 'array', items: { type: 'string' }, description: 'List of skills in this category' }
        },
        required: ['category', 'items'],
        additionalProperties: false
      }
    },
    education: {
      type: 'array',
      description: 'Education entries, most recent first',
      items: {
        type: 'object',
        properties: {
          institution: { type: 'string', description: 'School or university name' },
          degree: { type: 'string', description: 'Degree type (e.g., "Bachelor of Science", "Master of Engineering")' },
          field: { type: 'string', description: 'Field of study or major' },
          startDate: { type: 'string', description: 'Start date or year' },
          endDate: { type: 'string', description: 'End date, graduation year, or "Expected [date]"' }
        },
        required: ['institution', 'degree'],
        additionalProperties: false
      }
    }
  },
  required: ['personalInfo', 'professionalSummary', 'experience', 'skills', 'education'],
  additionalProperties: false
}

// =============================================================================
// Recovery Functions
// =============================================================================

/**
 * Unwrap CLI JSON output format if present.
 * Claude CLI with --output-format json returns: {"type":"result","result":"<actual content>"}
 * Gemini CLI with --output json returns similar wrapper.
 * This extracts the inner result content for further processing.
 */
function unwrapCliOutput(text: string): string {
  try {
    const parsed = JSON.parse(text)
    // Check for CLI wrapper format: {type: "result", result: "..."}
    if (parsed && typeof parsed === 'object' && 'type' in parsed && 'result' in parsed) {
      // The result field contains the actual AI response
      return typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result)
    }
  } catch {
    // Not valid JSON or not a wrapper - continue with original text
  }
  return text
}

/**
 * Attempts to extract JSON from a string that may have markdown code blocks
 * or other text surrounding the JSON.
 *
 * Note: The brace-matching algorithm doesn't handle braces inside JSON string
 * values (e.g., {"text": "Example: {value}"}). This is acceptable because:
 * 1. AI outputs rarely contain literal braces in string values
 * 2. The markdown code block extraction runs first and handles most cases
 * 3. Even if extraction is imperfect, JSON.parse will fail and we'll get
 *    a clear error rather than silent corruption
 */
function extractJsonFromText(text: string): string {
  // Note: CLI output unwrapping is handled by callers (validateResumeContent, validateCoverLetterContent)
  // before this function is called, so we don't need to unwrap here.

  // Try to extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find the first balanced JSON object using brace matching
  const firstBrace = text.indexOf('{')
  if (firstBrace === -1) {
    return text
  }

  let braceCount = 0
  let end = -1
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === '{') {
      braceCount++
    } else if (text[i] === '}') {
      braceCount--
      if (braceCount === 0) {
        end = i
        break
      }
    }
  }

  if (end !== -1) {
    return text.slice(firstBrace, end + 1)
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

  // If it's a string array (check ALL elements, not just first), wrap it
  if (Array.isArray(skills) && skills.length > 0 && skills.every((item) => typeof item === 'string')) {
    return [{ category: 'Skills', items: skills as string[] }]
  }

  // If it's a single object with items
  if (typeof skills === 'object' && !Array.isArray(skills) && 'items' in skills) {
    const obj = skills as { category?: string; items?: unknown[] }
    return [{
      category: obj.category || 'Skills',
      items: Array.isArray(obj.items) ? obj.items.filter((i): i is string => typeof i === 'string') : []
    }]
  }

  // If it's already an array, normalize each entry (handles mixed arrays)
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

  // Object with text property (trim for consistency with array handling)
  if (typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>
    if (typeof obj.text === 'string') return [obj.text.trim()].filter(Boolean)
    if (typeof obj.content === 'string') return [obj.content.trim()].filter(Boolean)
    if (typeof obj.paragraph === 'string') return [obj.paragraph.trim()].filter(Boolean)
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
      .filter(Boolean)
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

  // Step 1: Unwrap CLI output format if present (e.g., Claude CLI's {"type":"result","result":"..."})
  let unwrapped = unwrapCliOutput(rawOutput)
  if (unwrapped !== rawOutput) {
    recoveryActions.push('Unwrapped CLI JSON output format')
  }

  // Step 2: Extract JSON from potentially wrapped text (markdown code blocks, surrounding text)
  let jsonStr = unwrapped
  if (!unwrapped.trim().startsWith('{')) {
    jsonStr = extractJsonFromText(unwrapped)
    if (jsonStr !== unwrapped) {
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
  // Track if skills needed normalization (not already in [{category, items}] format)
  if (parsed.skills) {
    const wasAlreadyNormalized = Array.isArray(parsed.skills) &&
      parsed.skills.length > 0 &&
      typeof parsed.skills[0] === 'object' &&
      parsed.skills[0] !== null &&
      'category' in parsed.skills[0] &&
      'items' in parsed.skills[0]
    parsed.skills = normalizeSkills(parsed.skills)
    if (!wasAlreadyNormalized && (parsed.skills as unknown[]).length > 0) {
      recoveryActions.push('Normalized skills format')
    }
  }

  // Track if experience needed normalization (check for alternative field names)
  if (parsed.experience && Array.isArray(parsed.experience)) {
    const hadAlternativeFields = parsed.experience.some((e: Record<string, unknown>) =>
      e && typeof e === 'object' && ('companyName' in e || 'title' in e || 'from' in e || 'bullets' in e)
    )
    parsed.experience = normalizeExperience(parsed.experience)
    if (hadAlternativeFields) {
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

  // Step 1: Unwrap CLI output format if present (e.g., Claude CLI's {"type":"result","result":"..."})
  let unwrapped = unwrapCliOutput(rawOutput)
  if (unwrapped !== rawOutput) {
    recoveryActions.push('Unwrapped CLI JSON output format')
  }

  // Step 2: Extract JSON from potentially wrapped text (markdown code blocks, surrounding text)
  let jsonStr = unwrapped
  if (!unwrapped.trim().startsWith('{')) {
    jsonStr = extractJsonFromText(unwrapped)
    if (jsonStr !== unwrapped) {
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
  // Track if bodyParagraphs needed normalization (not already a string array)
  const wasAlreadyStringArray = Array.isArray(parsed.bodyParagraphs) &&
    parsed.bodyParagraphs.every((p: unknown) => typeof p === 'string')
  parsed.bodyParagraphs = normalizeBodyParagraphs(parsed.bodyParagraphs)
  if (!wasAlreadyStringArray && (parsed.bodyParagraphs as string[]).length > 0) {
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
