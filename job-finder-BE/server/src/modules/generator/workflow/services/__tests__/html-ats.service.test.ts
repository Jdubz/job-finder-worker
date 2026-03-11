import { describe, it, expect } from 'vitest'
import { atsResumeHtml } from '../html-ats.service'
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
    experience: [],
    skills: [],
    education: [],
    ...overrides
  }
}

describe('atsResumeHtml – project rendering', () => {
  it('renders description as summary paragraph when highlights are present', () => {
    const html = atsResumeHtml(
      makeResume({
        projects: [
          { name: 'My Project', description: 'A cool platform', highlights: ['Built the thing'] }
        ]
      })
    )
    expect(html).toContain('<p class="project-desc">A cool platform</p>')
    expect(html).toContain('Built the thing')
  })

  it('renders description as bullet fallback when no highlights', () => {
    const html = atsResumeHtml(
      makeResume({
        projects: [
          { name: 'My Project', description: 'A cool platform', highlights: [] }
        ]
      })
    )
    expect(html).not.toContain('<p class="project-desc">')
    expect(html).toContain('<li>A cool platform</li>')
  })

  it('omits description when not provided', () => {
    const html = atsResumeHtml(
      makeResume({
        projects: [
          { name: 'My Project', description: '', highlights: ['Built the thing'] }
        ]
      })
    )
    expect(html).not.toContain('<p class="project-desc">')
    expect(html).toContain('Built the thing')
  })
})

describe('atsResumeHtml – education rendering', () => {
  it('combines degree and field with "in" when degree has no "in"', () => {
    const html = atsResumeHtml(
      makeResume({
        education: [{ institution: 'MIT', degree: 'Bachelor of Science', field: 'Computer Science' }]
      })
    )
    expect(html).toContain('Bachelor of Science in Computer Science')
    expect(html).not.toContain('<p class="edu-notes">')
  })

  it('does not duplicate "in" when degree already contains it', () => {
    const html = atsResumeHtml(
      makeResume({
        education: [{ institution: 'UC Santa Cruz', degree: 'B.A. in Music', field: 'Regents Scholar' }]
      })
    )
    expect(html).toContain('B.A. in Music')
    expect(html).not.toContain('B.A. in Music in')
    expect(html).toContain('<p class="edu-notes">Regents Scholar</p>')
  })

  it('renders just the field when degree is empty', () => {
    const html = atsResumeHtml(
      makeResume({
        education: [{ institution: 'Online', degree: '', field: 'Computer Science' }]
      })
    )
    expect(html).toContain('Computer Science')
    expect(html).not.toContain(' in Computer Science')
  })

  it('renders just the degree when field is absent', () => {
    const html = atsResumeHtml(
      makeResume({
        education: [{ institution: 'Google Cloud', degree: 'Professional Cloud Developer Certificate' }]
      })
    )
    expect(html).toContain('Professional Cloud Developer Certificate')
    expect(html).not.toContain(' in ')
  })
})
