import { describe, it, expect } from 'vitest'
import { atsResumeHtml } from '../html-ats.service'
import type { ResumeContent, PersonalInfo } from '@shared/types'

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

describe('atsResumeHtml – contact row', () => {
  const personalInfo: PersonalInfo = {
    name: 'Josh Wentworth',
    email: 'contact@joshwentworth.com',
    title: 'Full-Stack Engineer',
    location: 'Portland, OR',
    phone: '(510)898-8892',
    linkedin: 'https://www.linkedin.com/in/josh',
    github: 'https://github.com/josh',
    website: 'https://joshwentworth.com/',
    applicationInfo: ''
  }

  function renderContact(overrides: Partial<PersonalInfo> = {}): string {
    return atsResumeHtml(makeResume(), { ...personalInfo, ...overrides })
  }

  it('does not render label prefixes', () => {
    const html = renderContact()
    expect(html).not.toContain('Email:')
    expect(html).not.toContain('LinkedIn:')
    expect(html).not.toContain('GitHub:')
    expect(html).not.toContain('Phone:')
  })

  it('strips protocol and www from LinkedIn display', () => {
    const html = renderContact()
    expect(html).toContain('>linkedin.com/in/josh<')
  })

  it('strips protocol from GitHub display', () => {
    const html = renderContact()
    expect(html).toContain('>github.com/josh<')
  })

  it('strips protocol and trailing slash from website display', () => {
    const html = renderContact()
    expect(html).toContain('>joshwentworth.com<')
  })

  it('handles bare domain input without protocol', () => {
    const html = renderContact({ linkedin: 'linkedin.com/in/josh', github: 'github.com/josh' })
    expect(html).toContain('>linkedin.com/in/josh<')
    expect(html).toContain('>github.com/josh<')
  })

  it('handles www-prefixed input without protocol', () => {
    const html = renderContact({ linkedin: 'www.linkedin.com/in/josh' })
    expect(html).toContain('>linkedin.com/in/josh<')
  })

  it('renders email as plain text (no label)', () => {
    const html = renderContact()
    expect(html).toContain('>contact@joshwentworth.com<')
    expect(html).toContain('mailto:contact@joshwentworth.com')
  })

  it('renders phone as plain text', () => {
    const html = renderContact()
    expect(html).toContain('(510)898-8892')
  })
})

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
