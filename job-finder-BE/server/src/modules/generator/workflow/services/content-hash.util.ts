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
    location: (personalInfo.location ?? '').trim(),
    phone: (personalInfo.phone ?? '').trim(),
    website: (personalInfo.website ?? '').trim(),
    linkedin: (personalInfo.linkedin ?? '').trim(),
    github: (personalInfo.github ?? '').trim(),
  }

  // Normalize content items — sort by id, include only prompt-relevant fields
  const normalizedItems = [...contentItems]
    .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
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
 * Two jobs with the same normalized role, tech stack, and profile hash
 * will produce identical fingerprints (Tier 1 exact match).
 */
export function computeJobFingerprint(
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
