import { chromium, type BrowserContext } from 'playwright-core'
import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { cleanText } from './text.util'
import { sharedCss, icons } from './html-style'
import { normalizeUrl } from './url.util'

const DEFAULT_MARGIN = '0.5in'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Format date to MMM-YYYY (e.g., "Feb-2025")
 * Handles various input formats: "2025-02", "2025-02-15", "Feb 2025", etc.
 */
function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  const cleaned = cleanText(dateStr)
  if (!cleaned || cleaned.toLowerCase() === 'present') return 'Present'

  // Try YYYY-MM or YYYY-MM-DD format
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})/)
  if (isoMatch) {
    const year = isoMatch[1]
    const monthIdx = parseInt(isoMatch[2], 10) - 1
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${MONTH_NAMES[monthIdx]}-${year}`
    }
  }

  // Try "Month YYYY" or "Month-YYYY" format (already formatted)
  const monthYearMatch = cleaned.match(/^([A-Za-z]{3,})\s*[-\s]?\s*(\d{4})$/)
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1].slice(0, 3)
    const monthCap = monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase()
    return `${monthCap}-${monthYearMatch[2]}`
  }

  // Just a year
  const yearMatch = cleaned.match(/^(\d{4})$/)
  if (yearMatch) {
    return yearMatch[1]
  }

  return cleaned
}

async function createContext(): Promise<BrowserContext> {
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: ['--no-sandbox']
  }

  if (process.env.CHROMIUM_PATH) {
    launchOptions.executablePath = process.env.CHROMIUM_PATH
  }

  const browser = await chromium.launch(launchOptions)
  return browser.newContext({ viewport: { width: 1275, height: 1650 } }) // Letter @150dpi
}

function buildContactRow(personal: PersonalInfo): string {
  const items: string[] = []

  const addItem = (icon: string, label: string, href?: string) => {
    const text = cleanText(label)
    if (!text) return
    const content = href ? `<a href="${href}">${text}</a>` : `<span>${text}</span>`
    items.push(`<span class="contact-item">${icon}${content}</span>`)
  }

  if (personal.email) {
    addItem(icons.email, personal.email, `mailto:${personal.email}`)
  }
  if ((personal as any).phone) {
    addItem(icons.phone, (personal as any).phone)
  }
  if (personal.location) {
    addItem(icons.location, personal.location)
  }
  if (personal.website) {
    addItem(icons.website, personal.website, normalizeUrl(personal.website))
  }
  if (personal.linkedin) {
    addItem(icons.linkedin, 'LinkedIn', normalizeUrl(personal.linkedin))
  }
  if (personal.github) {
    addItem(icons.github, 'GitHub', normalizeUrl(personal.github))
  }

  return items.length ? `<div class="contact">${items.join('')}</div>` : ''
}

function buildSidebarContact(personal: PersonalInfo): string {
  const items: string[] = []

  const addItem = (icon: string, label: string, href?: string) => {
    const text = cleanText(label)
    if (!text) return
    const content = href ? `<a href="${href}">${text}</a>` : `<span>${text}</span>`
    items.push(`<div class="contact-item">${icon}${content}</div>`)
  }

  if (personal.email) {
    addItem(icons.email, personal.email, `mailto:${personal.email}`)
  }
  if (personal.phone) {
    addItem(icons.phone, personal.phone)
  }
  if (personal.location) {
    addItem(icons.location, personal.location)
  }
  if (personal.website) {
    const displayUrl = personal.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
    addItem(icons.website, displayUrl, normalizeUrl(personal.website))
  }
  if (personal.linkedin) {
    addItem(icons.linkedin, 'LinkedIn', normalizeUrl(personal.linkedin))
  }
  if (personal.github) {
    addItem(icons.github, 'GitHub', normalizeUrl(personal.github))
  }

  return items.length ? `<div class="contact-list">${items.join('')}</div>` : ''
}

function getInitials(name?: string): string {
  if (!name) return ''
  return cleanText(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function resumeHtml(content: ResumeContent, personalInfo?: PersonalInfo): string {
  const info = personalInfo ?? (content as any).personalInfo
  const initials = getInitials(info?.name)
  const avatar = (info as any)?.avatar || ''
  const logo = (info as any)?.logo || ''
  const sidebarContact = buildSidebarContact(info)

  // Build experiences
  const experiences = content.experience
    .map((exp) => {
      const dates = `${formatDate(exp.startDate)} - ${formatDate(exp.endDate) || 'Present'}`
      const bullets = (exp.highlights || [])
        .map((b) => `<li>${cleanText(b)}</li>`)
        .join('')

      const tech = Array.isArray((exp as any).technologies) && (exp as any).technologies.length
        ? `<div class="tech">${cleanText((exp as any).technologies.join(' • '))}</div>`
        : ''

      return `
        <div class="role">
          <div class="role-header">
            <span class="role-title">${cleanText(exp.role)}</span>
            <span class="dates">${dates}</span>
          </div>
          <div class="company"><strong>${cleanText(exp.company)}</strong>${exp.location ? ' • ' + cleanText(exp.location) : ''}</div>
          ${bullets ? `<ul class="bullets">${bullets}</ul>` : ''}
          ${tech}
        </div>
      `
    })
    .join('')

  // Build skills for sidebar
  const skillsHtml = (content.skills || [])
    .map((s) => {
      const tags = s.items.map((item) => `<span class="skill-tag">${cleanText(item)}</span>`).join('')
      return `
        <div class="skill-category">
          <div class="skill-label">${cleanText(s.category)}</div>
          <div class="skill-tags">${tags}</div>
        </div>
      `
    })
    .join('')

  // Build education for sidebar
  const educationHtml = (content.education || [])
    .map((e) => {
      const gradDate = (e as any).graduationDate || e.endDate
      return `
        <div class="edu-item">
          <div class="edu-degree">${cleanText(e.degree || e.field || '')}</div>
          <div class="edu-school">${cleanText(e.institution)}</div>
          ${gradDate ? `<div class="edu-date">${formatDate(gradDate)}</div>` : ''}
        </div>
      `
    })
    .join('')

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>${sharedCss}</style>
  </head>
  <body>
    <div class="page">
      <!-- Left Sidebar -->
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="avatar-wrapper">
            ${avatar ? `<img class="avatar-photo" src="${avatar}" alt="" />` : `<div class="avatar">${initials}</div>`}
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-title">Contact</div>
          ${sidebarContact}
        </div>

        ${skillsHtml ? `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Skills</div>
          ${skillsHtml}
        </div>
        ` : ''}

        ${educationHtml ? `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Education</div>
          ${educationHtml}
        </div>
        ` : ''}
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <div class="main-header">
          <div class="header-text">
            <div class="name">${cleanText(info.name)}</div>
            <div class="title">${cleanText(info.title || content.personalInfo?.title || '')}</div>
          </div>
          ${logo ? `<div class="logo-box"><img src="${logo}" alt="" /></div>` : ''}
        </div>

        <div class="main-section">
          <div class="section-title">Professional Summary</div>
          <div class="summary">${cleanText(content.professionalSummary || content.personalInfo?.summary || '')}</div>
        </div>

        <div class="main-section">
          <div class="section-title">Experience</div>
          <div class="experience-list">
            ${experiences}
          </div>
        </div>

        <div class="main-footer">
          Generated by my custom AI application — <a href="https://job-finder.joshwentworth.com/">JOB FINDER</a>
        </div>
      </div>
    </div>
  </body>
  </html>
  `
}

function coverLetterHtml(
  content: CoverLetterContent,
  opts: {
    name: string
    email: string
    location?: string
    phone?: string
    date?: string
    logo?: string
    avatar?: string
    title?: string
    website?: string
    linkedin?: string
    github?: string
  }
): string {
  const contact = buildContactRow({
    name: opts.name,
    email: opts.email,
    location: opts.location,
    contact: { email: opts.email, location: opts.location },
    title: '',
    summary: '',
    phone: opts.phone,
    website: opts.website,
    linkedin: opts.linkedin,
    github: opts.github
  } as any)

  const initials = getInitials(opts.name)
  const avatar = opts.avatar || ''

  const bodyParas = [content.openingParagraph, ...(content.bodyParagraphs || []), content.closingParagraph]
    .filter(Boolean)
    .map((p) => `<p>${cleanText(p || '')}</p>`)
    .join('')

  const coverLetterCss = `
    ${sharedCss}

    /* Override: no decorative corners for cover letter */
    .letter::before,
    .letter::after { display: none; }

    .letter {
      width: 100%;
      max-width: 7.3in;
      margin: 0 auto;
      position: relative;
    }

    .letter header {
      display: grid;
      margin-bottom: 12px;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 14px;
      padding: 4px 6px 0;
    }

    .header-center .name {
      font-size: 22px;
      letter-spacing: -0.2px;
      margin-bottom: 4px;
    }

    .header-center .title {
      font-size: 12px;
      color: var(--accent);
      font-weight: 600;
      margin-bottom: 6px;
    }

    .header-center .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .header-center .contact .contact-item {
      font-size: 11px;
      gap: 6px;
      align-items: center;
    }

    .letter .header-rule {
      display: block;
      border: none;
      height: 2px;
      background: var(--accent);
      margin-bottom: 20px;
    }

    body {
      font-size: 11.5px;
      line-height: 1.6;
    }
    /* Recipient block with accent bar */
    .recipient {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--rule-light);
    }

    .greeting {
      font-size: 15px;
      color: var(--text);
      font-weight: 700;
      margin: 0;
    }

    .date {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
      margin-left: auto;
    }

    /* Letter body - clean with subtle left accent */
    .letter-body {
      padding-left: 16px;
      border-left: 3px solid var(--accent);
      margin-left: 4px;
    }

    .letter-body p {
      font-size: 11.5px;
      line-height: 1.72;
      color: var(--text);
      margin: 0 0 14px 0;
      text-align: left;
    }

    .letter-body p:last-child {
      margin-bottom: 0;
    }

    /* Signature - simple and professional */
    .signature {
      margin-top: 24px;
      padding-left: 16px;
      margin-left: 4px;
    }

    .signature-line {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 2px;
    }

    .signature-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--text);
    }

    .letter footer {
      margin-top: 48px;
    }
  `

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>${coverLetterCss}</style>
  </head>
  <body>
    <div class="letter">
      <header>
        ${avatar ? `<img class="avatar-photo" src="${avatar}" alt="" />` : `<div class="avatar">${initials}</div>`}
        <div class="header-center">
          <div class="name">${cleanText(opts.name)}</div>
          ${opts.title ? `<div class="title">${cleanText(opts.title)}</div>` : ''}
          ${contact}
        </div>
        ${opts.logo ? `<div class="logo-box"><img src="${opts.logo}" alt="" /></div>` : '<div></div>'}
      </header>
      <hr class="header-rule" />

      <div class="recipient">
        <div class="greeting">${cleanText(content.greeting)}</div>
        <div class="date">${cleanText(opts.date || '')}</div>
      </div>

      <div class="letter-body">
        ${bodyParas}
      </div>

      <div class="signature">
        <div class="signature-line">Sincerely,</div>
        ${(() => {
          const sigRaw = cleanText(content.signature || opts.name)
          const sigMain = sigRaw.split(',')[0] || sigRaw
          return `<div class="signature-name">${sigMain}</div>`
        })()}
      </div>

      <footer>
        Generated by my custom AI resume builder — <a href="https://job-finder.joshwentworth.com">JOB FINDER</a>
      </footer>
    </div>
  </body>
  </html>
  `
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const context = await createContext()
  let pdf: Buffer
  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    pdf = await page.pdf({ format: 'Letter', margin: DEFAULT_MARGIN as any, printBackground: true })
  } finally {
    await context.browser()?.close()
  }
  return pdf
}

export class HtmlPdfService {
  async renderResume(content: ResumeContent, personalInfo?: PersonalInfo): Promise<Buffer> {
    const html = resumeHtml(content, personalInfo)
    return renderHtmlToPdf(html)
  }

  async renderCoverLetter(
    content: CoverLetterContent,
    options: {
      name: string
      title?: string
      email: string
      location?: string
      phone?: string
      date?: string
      logo?: string
      avatar?: string
      website?: string
      linkedin?: string
      github?: string
    }
  ): Promise<Buffer> {
    const html = coverLetterHtml(content, options)
    return renderHtmlToPdf(html)
  }
}
