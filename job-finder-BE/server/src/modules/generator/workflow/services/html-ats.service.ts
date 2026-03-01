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

  // Contact row: pipe-separated with text labels
  const contactParts: string[] = []
  if (info?.email) {
    contactParts.push(`Email: <a href="mailto:${escapeAttr(info.email)}">${safeText(info.email)}</a>`)
  }
  if (info?.phone) {
    contactParts.push(`Phone: ${safeText(info.phone)}`)
  }
  if (info?.location) {
    contactParts.push(safeText(info.location))
  }
  if (info?.website) {
    contactParts.push(`<a href="${escapeAttr(normalizeUrl(info.website))}">${safeText(info.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`)
  }
  if (info?.linkedin) {
    contactParts.push(`LinkedIn: <a href="${escapeAttr(normalizeUrl(info.linkedin))}">LinkedIn</a>`)
  }
  if (info?.github) {
    contactParts.push(`GitHub: <a href="${escapeAttr(normalizeUrl(info.github))}">GitHub</a>`)
  }
  const contactRow = contactParts.length
    ? `<div class="contact-row">${contactParts.join('<span class="sep">|</span>')}</div>`
    : ''

  // Experience
  const experiences = (content.experience || [])
    .map((exp) => {
      const dates = `${formatDate(exp.startDate)} - ${formatDate(exp.endDate) || 'Present'}`
      const bullets = (exp.highlights || [])
        .map((b) => `<li>${safeText(b)}</li>`)
        .join('')
      const tech = Array.isArray(exp.technologies) && exp.technologies.length
        ? `<div class="exp-tech">${safeText(exp.technologies.join(', '))}</div>`
        : ''

      return `
        <div class="exp-entry">
          <div class="exp-header">
            <span class="exp-role">${safeText(exp.role)}</span>
            <span class="exp-dates">${dates}</span>
          </div>
          <div class="exp-company">${safeText(exp.company)}${exp.location ? ' - ' + safeText(exp.location) : ''}</div>
          ${bullets ? `<ul class="exp-bullets">${bullets}</ul>` : ''}
          ${tech}
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
      const desc = !bullets && proj.description ? `<li>${safeText(proj.description)}</li>` : ''
      const allBullets = bullets || desc
      const tech = proj.technologies?.length
        ? `<div class="exp-tech">${safeText(proj.technologies.join(', '))}</div>`
        : ''
      const link = proj.link
        ? ` <span class="project-link">(<a href="${escapeAttr(normalizeUrl(proj.link))}">${safeText(proj.link.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>)</span>`
        : ''

      return `
        <div class="project-entry">
          <span class="project-name">${safeText(proj.name)}</span>${link}
          ${allBullets ? `<ul class="exp-bullets">${allBullets}</ul>` : ''}
          ${tech}
        </div>
      `
    })
    .join('')

  // Education
  const educationHtml = (content.education || [])
    .map((e) => {
      const gradDate = (e as any).graduationDate || e.endDate
      const degreeField = [e.degree, e.field].filter(Boolean).join(' in ')
      return `
        <div class="edu-entry">
          <div class="edu-header">
            <span class="edu-degree">${safeText(degreeField)}</span>
            ${gradDate ? `<span class="edu-date">${formatDate(gradDate)}</span>` : ''}
          </div>
          <div class="edu-school">${safeText(e.institution)}</div>
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
      <div class="header">
        <div class="header-content">
          ${avatarHtml}
          <div class="header-text">
            <div class="name">${safeText(info?.name || '')}</div>
            <div class="title">${safeText(info?.title || content.personalInfo?.title || '')}</div>
          </div>
          ${logoHtml}
        </div>
      </div>
      <hr class="header-rule" />
      ${contactRow}

      <div class="section-heading">Professional Summary</div>
      <div class="summary">${safeText(content.professionalSummary || content.personalInfo?.summary || '')}</div>

      <div class="section-heading">Work Experience</div>
      ${experiences}

      ${skillsHtml ? `
      <div class="section-heading">Technical Skills</div>
      <div class="skills-list">${skillsHtml}</div>
      ` : ''}

      ${projectsHtml ? `
      <div class="section-heading">Projects</div>
      ${projectsHtml}
      ` : ''}

      ${educationHtml ? `
      <div class="section-heading">Education</div>
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
