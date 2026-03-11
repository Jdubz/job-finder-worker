import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { safeText, escapeAttr } from './text.util'
import { normalizeUrl } from './url.util'
import { formatDate } from './date.util'
import { atsCss } from './html-ats-style'

/**
 * Build ATS-optimized resume HTML.
 * Single-column layout, no grid/sidebar, standard fonts, no icons.
 */
export function atsResumeHtml(content: ResumeContent, personalInfo?: PersonalInfo): string {
  const info = personalInfo ?? (content as any).personalInfo

  // Contact row: pipe-separated, no labels (ATS uses pattern matching, not labels)
  const contactParts: string[] = []
  if (info?.email) {
    contactParts.push(`<a href="mailto:${escapeAttr(info.email)}">${safeText(info.email)}</a>`)
  }
  if (info?.linkedin) {
    const linkedinDisplay = info.linkedin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    contactParts.push(`<a href="${escapeAttr(normalizeUrl(info.linkedin))}">${safeText(linkedinDisplay)}</a>`)
  }
  if (info?.github) {
    const githubDisplay = info.github.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    contactParts.push(`<a href="${escapeAttr(normalizeUrl(info.github))}">${safeText(githubDisplay)}</a>`)
  }
  if (info?.phone) {
    contactParts.push(safeText(info.phone))
  }
  if (info?.location) {
    contactParts.push(safeText(info.location))
  }
  if (info?.website) {
    contactParts.push(`<a href="${escapeAttr(normalizeUrl(info.website))}">${safeText(info.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`)
  }
  const contactRow = contactParts.length
    ? `<div class="contact-row">${contactParts.join('<span class="sep">|</span>')}</div>`
    : ''

  // Experience
  const experiences = (content.experience || [])
    .map((exp) => {
      const dates = `${safeText(formatDate(exp.startDate))} - ${safeText(formatDate(exp.endDate)) || 'Present'}`
      const bullets = (exp.highlights || [])
        .map((b) => `<li>${safeText(b)}</li>`)
        .join('')
      return `
        <div class="exp-entry">
          <h3 class="exp-header">
            <span class="exp-role">${safeText(exp.role)}</span>
            <span class="exp-dates">${dates}</span>
          </h3>
          <p class="exp-company">${safeText(exp.company)}${exp.location ? ' - ' + safeText(exp.location) : ''}</p>
          ${bullets ? `<ul class="exp-bullets">${bullets}</ul>` : ''}
        </div>
      `
    })
    .join('')

  // Skills
  const skillsHtml = (content.skills || [])
    .map((s) => {
      return `<div class="skill-row"><span class="label">${safeText(s.category)}:</span> ${s.items.map((i) => safeText(i)).join(', ')}</div>`
    })
    .join('')

  // Projects
  const projectsHtml = (content.projects || [])
    .map((proj) => {
      const bullets = (proj.highlights || [])
        .map((b) => `<li>${safeText(b)}</li>`)
        .join('')
      const summary = proj.description
        ? `<p class="project-desc">${safeText(proj.description)}</p>`
        : ''
      const fallbackDesc = !bullets && proj.description ? `<li>${safeText(proj.description)}</li>` : ''
      const allBullets = bullets || fallbackDesc
      const link = proj.link
        ? ` <span class="project-link">(<a href="${escapeAttr(normalizeUrl(proj.link))}">${safeText(proj.link.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>)</span>`
        : ''

      return `
        <div class="project-entry">
          <h3 class="project-name">${safeText(proj.name)}${link}</h3>
          ${bullets ? summary : ''}
          ${allBullets ? `<ul class="exp-bullets">${allBullets}</ul>` : ''}
        </div>
      `
    })
    .join('')

  // Education
  const educationHtml = (content.education || [])
    .map((e) => {
      const gradDate = (e as any).graduationDate || e.endDate
      // Build degree text and optional notes line
      const hasFieldInDegree = e.degree?.includes(' in ')
      let degreeText = e.degree || ''
      let notes = ''

      if (hasFieldInDegree) {
        // "B.A. in Music" + field "Regents Scholar…" → show field as separate notes
        if (e.field) notes = e.field
      } else if (e.field) {
        // "Bachelor of Science" + "Computer Science" → "Bachelor of Science in Computer Science"
        degreeText = degreeText ? `${degreeText} in ${e.field}` : e.field
      }
      return `
        <div class="edu-entry">
          <h3 class="edu-header">
            <span class="edu-degree">${safeText(degreeText)}</span>
            ${gradDate ? `<span class="edu-date">${safeText(formatDate(gradDate))}</span>` : ''}
          </h3>
          <p class="edu-school">${safeText(e.institution)}</p>
          ${notes ? `<p class="edu-notes">${safeText(notes)}</p>` : ''}
        </div>
      `
    })
    .join('')

  const avatarHtml = info?.avatar
    ? `<img class="header-avatar" src="${escapeAttr(info.avatar)}" alt="" />`
    : ''
  const logoHtml = info?.logo
    ? `<img class="header-logo" src="${escapeAttr(info.logo)}" alt="" />`
    : ''

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>${atsCss}</style>
  </head>
  <body>
    <div class="page">
      <header class="header">
        <h1 class="name">${safeText(info?.name || '')}</h1>
        <div class="title">${safeText(info?.title || content.personalInfo?.title || '')}</div>
        ${avatarHtml}
        ${logoHtml}
      </header>
      <hr class="header-rule" />
      ${contactRow}

      <h2 class="section-heading">Professional Summary</h2>
      <p class="summary">${safeText(content.professionalSummary || content.personalInfo?.summary || '')}</p>

      <h2 class="section-heading">Work Experience</h2>
      ${experiences}

      ${skillsHtml ? `
      <h2 class="section-heading">Technical Skills</h2>
      <div class="skills-list">${skillsHtml}</div>
      ` : ''}

      ${projectsHtml ? `
      <h2 class="section-heading">Projects</h2>
      ${projectsHtml}
      ` : ''}

      ${educationHtml ? `
      <h2 class="section-heading">Education</h2>
      ${educationHtml}
      ` : ''}
    </div>
  </body>
  </html>
  `
}

/**
 * Build ATS-optimized cover letter HTML.
 * Simple business letter format, no decorative elements.
 */
export function atsCoverLetterHtml(
  content: CoverLetterContent,
  opts: {
    name: string
    email: string
    location?: string
    phone?: string
    date?: string
    title?: string
    website?: string
    linkedin?: string
    github?: string
    logo?: string
    avatar?: string
  }
): string {
  const contactParts: string[] = []
  if (opts.email) contactParts.push(safeText(opts.email))
  if (opts.phone) contactParts.push(safeText(opts.phone))
  if (opts.location) contactParts.push(safeText(opts.location))
  const contactLine = contactParts.join(' | ')

  const avatarHtml = opts.avatar
    ? `<img class="header-avatar" src="${escapeAttr(opts.avatar)}" alt="" />`
    : ''
  const logoHtml = opts.logo
    ? `<img class="header-logo" src="${escapeAttr(opts.logo)}" alt="" />`
    : ''

  const bodyParas = [content.openingParagraph, ...(content.bodyParagraphs || []), content.closingParagraph]
    .filter(Boolean)
    .map((p) => `<p>${safeText(p || '')}</p>`)
    .join('')

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>${atsCss}</style>
  </head>
  <body>
    <div class="letter">
      <div class="letter-header">
        <div class="header-content">
          ${avatarHtml}
          <div class="header-text">
            <div class="name">${safeText(opts.name)}</div>
            ${opts.title ? `<div class="title">${safeText(opts.title)}</div>` : ''}
          </div>
          ${logoHtml}
        </div>
        <div class="letter-contact">${contactLine}</div>
      </div>
      <hr class="header-rule" />

      ${opts.date ? `<div class="letter-date">${safeText(opts.date)}</div>` : ''}

      <div class="letter-greeting">${safeText(content.greeting)}</div>

      <div class="letter-body">
        ${bodyParas}
      </div>

      <div class="letter-signature">
        <div class="closing">${safeText(typeof content.signature === 'string' && content.signature ? content.signature : 'Sincerely,')}</div>
        <div class="signer">${safeText(opts.name)}</div>
      </div>
    </div>
  </body>
  </html>
  `
}
