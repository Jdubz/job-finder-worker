import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { cleanText } from './text.util'
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
    contactParts.push(`Email: <a href="mailto:${info.email}">${cleanText(info.email)}</a>`)
  }
  if (info?.phone) {
    contactParts.push(`Phone: ${cleanText(info.phone)}`)
  }
  if (info?.location) {
    contactParts.push(cleanText(info.location))
  }
  if (info?.website) {
    contactParts.push(`<a href="${normalizeUrl(info.website)}">${cleanText(info.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`)
  }
  if (info?.linkedin) {
    contactParts.push(`LinkedIn: <a href="${normalizeUrl(info.linkedin)}">LinkedIn</a>`)
  }
  if (info?.github) {
    contactParts.push(`GitHub: <a href="${normalizeUrl(info.github)}">GitHub</a>`)
  }
  const contactRow = contactParts.length
    ? `<div class="contact-row">${contactParts.join('<span class="sep">|</span>')}</div>`
    : ''

  // Experience
  const experiences = (content.experience || [])
    .map((exp) => {
      const dates = `${formatDate(exp.startDate)} - ${formatDate(exp.endDate) || 'Present'}`
      const bullets = (exp.highlights || [])
        .map((b) => `<li>${cleanText(b)}</li>`)
        .join('')
      const tech = Array.isArray(exp.technologies) && exp.technologies.length
        ? `<div class="exp-tech">${cleanText(exp.technologies.join(', '))}</div>`
        : ''

      return `
        <div class="exp-entry">
          <div class="exp-header">
            <span class="exp-role">${cleanText(exp.role)}</span>
            <span class="exp-dates">${dates}</span>
          </div>
          <div class="exp-company">${cleanText(exp.company)}${exp.location ? ' - ' + cleanText(exp.location) : ''}</div>
          ${bullets ? `<ul class="exp-bullets">${bullets}</ul>` : ''}
          ${tech}
        </div>
      `
    })
    .join('')

  // Skills
  const skillsHtml = (content.skills || [])
    .map((s) => {
      return `<div class="skill-row"><span class="label">${cleanText(s.category)}:</span> ${s.items.map((i) => cleanText(i)).join(', ')}</div>`
    })
    .join('')

  // Projects
  const projectsHtml = (content.projects || [])
    .map((proj) => {
      const bullets = (proj.highlights || [])
        .map((b) => `<li>${cleanText(b)}</li>`)
        .join('')
      const desc = !bullets && proj.description ? `<li>${cleanText(proj.description)}</li>` : ''
      const allBullets = bullets || desc
      const tech = proj.technologies?.length
        ? `<div class="exp-tech">${cleanText(proj.technologies.join(', '))}</div>`
        : ''
      const link = proj.link
        ? ` <span class="project-link">(<a href="${normalizeUrl(proj.link)}">${cleanText(proj.link.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>)</span>`
        : ''

      return `
        <div class="project-entry">
          <span class="project-name">${cleanText(proj.name)}</span>${link}
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
            <span class="edu-degree">${cleanText(degreeField)}</span>
            ${gradDate ? `<span class="edu-date">${formatDate(gradDate)}</span>` : ''}
          </div>
          <div class="edu-school">${cleanText(e.institution)}</div>
        </div>
      `
    })
    .join('')

  const avatarHtml = info?.avatar
    ? `<img class="header-avatar" src="${info.avatar}" alt="" />`
    : ''
  const logoHtml = info?.logo
    ? `<img class="header-logo" src="${info.logo}" alt="" />`
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
            <div class="name">${cleanText(info?.name || '')}</div>
            <div class="title">${cleanText(info?.title || content.personalInfo?.title || '')}</div>
          </div>
          ${logoHtml}
        </div>
      </div>
      <hr class="header-rule" />
      ${contactRow}

      <div class="section-heading">Professional Summary</div>
      <div class="summary">${cleanText(content.professionalSummary || content.personalInfo?.summary || '')}</div>

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
  if (opts.email) contactParts.push(cleanText(opts.email))
  if (opts.phone) contactParts.push(cleanText(opts.phone))
  if (opts.location) contactParts.push(cleanText(opts.location))
  const contactLine = contactParts.join(' | ')

  const avatarHtml = opts.avatar
    ? `<img class="header-avatar" src="${opts.avatar}" alt="" />`
    : ''
  const logoHtml = opts.logo
    ? `<img class="header-logo" src="${opts.logo}" alt="" />`
    : ''

  const bodyParas = [content.openingParagraph, ...(content.bodyParagraphs || []), content.closingParagraph]
    .filter(Boolean)
    .map((p) => `<p>${cleanText(p || '')}</p>`)
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
            <div class="name">${cleanText(opts.name)}</div>
            ${opts.title ? `<div class="title">${cleanText(opts.title)}</div>` : ''}
          </div>
          ${logoHtml}
        </div>
        <div class="letter-contact">${contactLine}</div>
      </div>
      <hr class="header-rule" />

      ${opts.date ? `<div class="letter-date">${cleanText(opts.date)}</div>` : ''}

      <div class="letter-greeting">${cleanText(content.greeting)}</div>

      <div class="letter-body">
        ${bodyParas}
      </div>

      <div class="letter-signature">
        <div class="closing">${cleanText(typeof content.signature === 'string' && content.signature ? content.signature : 'Sincerely,')}</div>
        <div class="signer">${cleanText(opts.name)}</div>
      </div>
    </div>
  </body>
  </html>
  `
}
