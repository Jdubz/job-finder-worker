import { describe, it, expect } from 'vitest'
import type { PersonalInfo, ContentItem } from '@shared/types'
import {
  normalizeRole,
  computeContentHash,
  computeJobFingerprint,
} from '../workflow/services/content-hash.util'

// ── Fixtures ────────────────────────────────────────────────────────────────

const basePersonalInfo: PersonalInfo = {
  name: 'Alice Smith',
  email: 'alice@example.com',
  title: 'Software Engineer',
  phone: '555-0100',
  location: 'Portland, OR',
  website: 'https://alice.dev',
  github: 'alice',
  linkedin: 'alice-smith',
  summary: 'Experienced engineer',
  applicationInfo: 'Authorized to work in the US',
}

const baseContentItems: ContentItem[] = [
  {
    id: 'ci-1',
    parentId: null,
    order: 0,
    title: 'Acme Corp',
    role: 'Engineer',
    description: 'Built things',
    skills: ['TypeScript', 'React'],
    startDate: '2020-01',
    endDate: '2023-06',
    location: 'Remote',
    website: null,
    aiContext: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
    updatedBy: 'test',
  },
]

const basePrompts = {
  resumeGeneration: 'Generate a resume for {{name}}',
  coverLetterGeneration: 'Write a cover letter for {{company}}',
}

// ── normalizeRole ───────────────────────────────────────────────────────────

describe('normalizeRole', () => {
  it('lowercases the role', () => {
    expect(normalizeRole('Frontend Engineer')).toBe('frontend engineer')
  })

  it('strips "Senior" prefix', () => {
    expect(normalizeRole('Senior Frontend Engineer')).toBe('frontend engineer')
  })

  it('strips "Jr." prefix', () => {
    expect(normalizeRole('Jr. Software Developer')).toBe('software developer')
  })

  it('strips "Lead" prefix', () => {
    expect(normalizeRole('Lead Backend Engineer')).toBe('backend engineer')
  })

  it('strips "Staff" prefix', () => {
    expect(normalizeRole('Staff Engineer')).toBe('engineer')
  })

  it('strips "Principal" prefix', () => {
    expect(normalizeRole('Principal Architect')).toBe('architect')
  })

  it('strips "Sr." prefix', () => {
    expect(normalizeRole('Sr. Data Scientist')).toBe('data scientist')
  })

  it('trims whitespace', () => {
    expect(normalizeRole('  Senior  Frontend Engineer  ')).toBe('frontend engineer')
  })

  it('returns unchanged role when no seniority prefix', () => {
    expect(normalizeRole('software engineer')).toBe('software engineer')
  })
})

// ── computeContentHash ──────────────────────────────────────────────────────

describe('computeContentHash', () => {
  it('returns deterministic hash for same input', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const hash2 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
  })

  it('changes when personalInfo.name changes', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const hash2 = computeContentHash(
      { ...basePersonalInfo, name: 'Bob Jones' },
      baseContentItems,
      basePrompts
    )
    expect(hash1).not.toBe(hash2)
  })

  it('changes when personalInfo.summary changes', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const hash2 = computeContentHash(
      { ...basePersonalInfo, summary: 'Different summary text' },
      baseContentItems,
      basePrompts
    )
    expect(hash1).not.toBe(hash2)
  })

  it('changes when personalInfo.title changes', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const hash2 = computeContentHash(
      { ...basePersonalInfo, title: 'Senior Staff Engineer' },
      baseContentItems,
      basePrompts
    )
    expect(hash1).not.toBe(hash2)
  })

  it('changes when personalInfo.applicationInfo changes', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const hash2 = computeContentHash(
      { ...basePersonalInfo, applicationInfo: 'Updated EEO info' },
      baseContentItems,
      basePrompts
    )
    expect(hash1).not.toBe(hash2)
  })

  it('changes when contentItems change', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const modifiedItems = [
      { ...baseContentItems[0], description: 'Different description' },
    ]
    const hash2 = computeContentHash(basePersonalInfo, modifiedItems, basePrompts)
    expect(hash1).not.toBe(hash2)
  })

  it('changes when prompt templates change', () => {
    const hash1 = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)
    const hash2 = computeContentHash(basePersonalInfo, baseContentItems, {
      ...basePrompts,
      resumeGeneration: 'Different resume prompt',
    })
    expect(hash1).not.toBe(hash2)
  })

  it('is order-independent for content items (sorted by id)', () => {
    const item2: ContentItem = {
      ...baseContentItems[0],
      id: 'ci-2',
      title: 'Second Corp',
    }
    const hash1 = computeContentHash(basePersonalInfo, [baseContentItems[0], item2], basePrompts)
    const hash2 = computeContentHash(basePersonalInfo, [item2, baseContentItems[0]], basePrompts)
    expect(hash1).toBe(hash2)
  })
})

// ── computeJobFingerprint ───────────────────────────────────────────────────

describe('computeJobFingerprint', () => {
  const contentHash = computeContentHash(basePersonalInfo, baseContentItems, basePrompts)

  it('returns deterministic hash for same input', () => {
    const fp1 = computeJobFingerprint('frontend engineer', ['react', 'typescript'], contentHash, 'Acme')
    const fp2 = computeJobFingerprint('frontend engineer', ['react', 'typescript'], contentHash, 'Acme')
    expect(fp1).toBe(fp2)
    expect(fp1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes when role changes', () => {
    const fp1 = computeJobFingerprint('frontend engineer', ['react'], contentHash, 'Acme')
    const fp2 = computeJobFingerprint('backend engineer', ['react'], contentHash, 'Acme')
    expect(fp1).not.toBe(fp2)
  })

  it('changes when tech stack changes', () => {
    const fp1 = computeJobFingerprint('engineer', ['react'], contentHash, 'Acme')
    const fp2 = computeJobFingerprint('engineer', ['vue'], contentHash, 'Acme')
    expect(fp1).not.toBe(fp2)
  })

  it('changes when content hash changes', () => {
    const fp1 = computeJobFingerprint('engineer', ['react'], 'hash-a', 'Acme')
    const fp2 = computeJobFingerprint('engineer', ['react'], 'hash-b', 'Acme')
    expect(fp1).not.toBe(fp2)
  })

  it('is order-independent for tech stack', () => {
    const fp1 = computeJobFingerprint('engineer', ['react', 'typescript'], contentHash, 'Acme')
    const fp2 = computeJobFingerprint('engineer', ['typescript', 'react'], contentHash, 'Acme')
    expect(fp1).toBe(fp2)
  })

  it('changes when company changes (prevents cross-company collisions)', () => {
    const fp1 = computeJobFingerprint('engineer', [], contentHash, 'Acme Corp')
    const fp2 = computeJobFingerprint('engineer', [], contentHash, 'Other Inc')
    expect(fp1).not.toBe(fp2)
  })

  it('is case-insensitive for company name', () => {
    const fp1 = computeJobFingerprint('engineer', [], contentHash, 'Acme Corp')
    const fp2 = computeJobFingerprint('engineer', [], contentHash, 'acme corp')
    expect(fp1).toBe(fp2)
  })
})
