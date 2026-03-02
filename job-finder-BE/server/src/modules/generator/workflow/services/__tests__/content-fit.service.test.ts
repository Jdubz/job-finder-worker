import { describe, it, expect } from 'vitest'
import { estimateContentFit, getContentBudget } from '../content-fit.service'
import type { ResumeContent } from '@shared/types'

function makeResume(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    personalInfo: {
      name: 'Test User',
      title: 'Engineer',
      summary: 'Test summary',
      contact: { email: 'test@example.com' }
    },
    professionalSummary: 'A skilled engineer.',
    experience: [
      {
        company: 'Acme',
        role: 'Dev',
        startDate: '2020',
        endDate: '2023',
        highlights: ['Built features', 'Led team'],
        technologies: ['TS']
      }
    ],
    skills: [{ category: 'Languages', items: ['TypeScript'] }],
    education: [{ institution: 'MIT', degree: 'BS CS' }],
    ...overrides
  }
}

describe('estimateContentFit', () => {
  it('fits a minimal resume on one page', () => {
    const result = estimateContentFit(makeResume())
    expect(result.fits).toBe(true)
    expect(result.overflow).toBeLessThanOrEqual(0)
  })

  it('detects overflow with many experience entries', () => {
    const manyExperiences = Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      role: 'Engineer',
      startDate: '2020',
      endDate: '2023',
      highlights: ['Bullet 1', 'Bullet 2', 'Bullet 3', 'Bullet 4', 'Bullet 5'],
      technologies: ['TS', 'React']
    }))

    const result = estimateContentFit(makeResume({ experience: manyExperiences }))
    expect(result.fits).toBe(false)
    expect(result.overflow).toBeGreaterThan(0)
  })

  it('accounts for projects section in line estimate', () => {
    const withoutProjects = estimateContentFit(makeResume({ projects: [] }))
    const withProjects = estimateContentFit(makeResume({
      projects: [
        { name: 'Project A', description: 'Desc', highlights: ['H1', 'H2'], technologies: ['TS'] },
        { name: 'Project B', description: 'Desc', highlights: ['H1'], technologies: ['Python'] }
      ]
    }))

    expect(withProjects.mainColumnLines).toBeGreaterThan(withoutProjects.mainColumnLines)
  })

  it('returns suggestions when overflowing', () => {
    // 6 entries triggers "Reduce experience entries from 6 to 4"
    const manyEntries = Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      role: 'Engineer',
      startDate: '2020',
      endDate: '2023',
      highlights: ['B1', 'B2', 'B3', 'B4', 'B5'],
      technologies: ['TS']
    }))

    const result = estimateContentFit(makeResume({ experience: manyEntries }))
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s) => s.includes('experience'))).toBe(true)
  })

  it('detects underflow with a minimal resume (negative overflow = spare room)', () => {
    const result = estimateContentFit(makeResume())
    // A minimal resume (1 experience, 2 bullets) should have lots of spare room
    expect(result.overflow).toBeLessThan(-5)
    expect(result.fits).toBe(true)
  })
})

describe('getContentBudget', () => {
  it('returns sensible budget constraints', () => {
    const budget = getContentBudget()
    expect(budget.maxExperiences).toBeGreaterThanOrEqual(3)
    expect(budget.maxBulletsPerExperience).toBe(5)
    expect(budget.maxSummaryWords).toBeGreaterThan(20)
    expect(budget.maxSkillCategories).toBeGreaterThanOrEqual(4)
  })
})
