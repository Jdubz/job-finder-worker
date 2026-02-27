import { createHash } from 'node:crypto'
import type { PersonalInfo, ContentItem } from '@shared/types'

/**
 * Normalize a role title for fingerprinting.
 * Strips seniority prefixes so "Senior Frontend Engineer" and "Frontend Engineer"
 * share the same normalized role.
 */
export function normalizeRole(role: string): string {
  return role
    .toLowerCase()
    .trim()
    .replace(/^(sr\.?|jr\.?|senior|junior|lead|staff|principal)\s+/i, '')
    .trim()
}

/**
 * Compute a SHA-256 hash of the user's profile content that feeds into prompts.
 * Changes to any included field will produce a different hash, invalidating cached generations.
 *
 * Includes: personal info fields, all content items (sorted by id), and the
 * resume/coverLetter prompt template strings.
 */
export function computeContentHash(
  personalInfo: PersonalInfo,
  contentItems: ContentItem[],
  promptTemplates: { resumeGeneration: string; coverLetterGeneration: string }
): string {
  // Normalize personal info — only fields that affect prompt output
  const normalizedPersonal = {
    name: (personalInfo.name ?? '').trim(),
    email: (personalInfo.email ?? '').trim(),
    title: (personalInfo.title ?? '').trim(),
    location: (personalInfo.location ?? '').trim(),
    phone: (personalInfo.phone ?? '').trim(),
    website: (personalInfo.website ?? '').trim(),
    linkedin: (personalInfo.linkedin ?? '').trim(),
    github: (personalInfo.github ?? '').trim(),
    summary: (personalInfo.summary ?? '').trim(),
    applicationInfo: (personalInfo.applicationInfo ?? '').trim(),
  }

  // Normalize content items — sort by parentId + order + id to reflect prompt ordering,
  // include only prompt-relevant fields. Order is included because prompt generation
  // preserves item ordering, so reordering items changes the prompt output.
  // Id is used as tiebreaker for determinism when parentId and order are equal.
  const normalizedItems = [...contentItems]
    .sort((a, b) => {
      const parentCmp = (a.parentId ?? '').localeCompare(b.parentId ?? '')
      if (parentCmp !== 0) return parentCmp
      const orderCmp = (a.order ?? 0) - (b.order ?? 0)
      if (orderCmp !== 0) return orderCmp
      return (a.id ?? '').localeCompare(b.id ?? '')
    })
    .map((item) => ({
      id: item.id,
      aiContext: item.aiContext ?? null,
      title: (item.title ?? '').trim(),
      role: (item.role ?? '').trim(),
      description: (item.description ?? '').trim(),
      skills: (item.skills ?? []).map((s) => s.toLowerCase().trim()).sort(),
      startDate: (item.startDate ?? '').trim(),
      endDate: (item.endDate ?? '').trim(),
      location: (item.location ?? '').trim(),
      website: (item.website ?? '').trim(),
      parentId: item.parentId ?? null,
      order: item.order ?? 0,
    }))

  const payload = JSON.stringify([
    normalizedPersonal,
    ...normalizedItems,
    {
      resumeGeneration: promptTemplates.resumeGeneration,
      coverLetterGeneration: promptTemplates.coverLetterGeneration,
    },
  ])

  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Compute a fingerprint hash for a specific job + profile combination.
 * Two jobs with the same normalized role, company, tech stack, and profile hash
 * will produce identical fingerprints (Tier 1 exact match).
 *
 * Company is included to prevent cross-company collisions when tech stack is
 * empty (e.g. when jobMatch is null) — without it, the fingerprint collapses
 * to just role + profileHash, which is too broad.
 */
export function computeJobFingerprint(
  roleNormalized: string,
  techStack: string[],
  contentItemsHash: string,
  company: string = ''
): string {
  const payload = JSON.stringify([
    roleNormalized,
    company.toLowerCase().trim(),
    [...techStack].map((s) => s.toLowerCase().trim()).sort(),
    contentItemsHash,
  ])

  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Compute a role-only fingerprint (no company).
 * Used for resume Tier 1.5 lookup — same role + tech stack at different companies
 * should reuse cached resumes because resumes are role/tech-driven, not company-specific.
 */
export function computeRoleFingerprint(
  roleNormalized: string,
  techStack: string[],
  contentItemsHash: string
): string {
  const payload = JSON.stringify([
    roleNormalized,
    [...techStack].map((s) => s.toLowerCase().trim()).sort(),
    contentItemsHash,
  ])

  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Compute Jaccard similarity index between two tech stacks.
 * Returns |A ∩ B| / |A ∪ B|, or 0 if either set is empty.
 * Comparison is case-insensitive.
 */
export function computeTechStackJaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0

  const setA = new Set(a.map((s) => s.toLowerCase().trim()))
  const setB = new Set(b.map((s) => s.toLowerCase().trim()))

  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }

  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}
