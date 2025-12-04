import { chromium, type BrowserContext } from 'playwright-core'
import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { cleanText } from './text.util'
import { sharedCss, icons } from './html-style'
import { normalizeUrl } from './url.util'

const DEFAULT_MARGIN = '0.5in'

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
  const contactRow = buildContactRow(info)

  // Build experiences with timeline
  const experiences = content.experience
    .map((exp) => {
      const dates = `${cleanText(exp.startDate || '')} - ${cleanText(exp.endDate || 'Present')}`.trim()
      const bullets = (exp.highlights || [])
        .map((b) => `<li>${cleanText(b)}</li>`)
        .join('')

      const tech = Array.isArray((exp as any).technologies) && (exp as any).technologies.length
        ? `<div class="tech">Technologies: ${cleanText((exp as any).technologies.join(', '))}</div>`
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

  // Build skills as tags/pills in two columns
  const skillItems = (content.skills || [])
    .map((s) => {
      const tags = s.items.map((item) => `<span class="skill-tag">${cleanText(item)}</span>`).join('')
      return `
        <div class="skill-category">
          <span class="skill-label">${cleanText(s.category)}</span>
          <div class="skill-tags">${tags}</div>
        </div>
      `
    })
    .join('')

  const skillsSection = skillItems
    ? `<section class="skills-section">
        <div class="section-title">Technical Skills</div>
        <div class="skills-grid">${skillItems}</div>
       </section>`
    : ''

  // Build education
  const education = (content.education || [])
    .map((e) => {
      const gradDate = (e as any).graduationDate || e.endDate
      return `
        <div class="edu">
          <strong>${cleanText(e.degree || e.field || '')}</strong>
          <span class="edu-details"> — ${cleanText(e.institution)}${gradDate ? ', ' + cleanText(gradDate) : ''}</span>
        </div>
      `
    })
    .join('')

  const educationSection = education
    ? `<section>
        <div class="section-title">Education</div>
        ${education}
       </section>`
    : ''

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>${sharedCss}</style>
  </head>
  <body>
    <div class="page">
      <header>
        ${logo ? `<div class="logo-box"><img src="${logo}" alt="" /></div>` : '<div></div>'}
        <div class="header-center">
          <div class="name">${cleanText(info.name)}</div>
          <div class="title">${cleanText(info.title || content.personalInfo?.title || '')}</div>
          ${contactRow}
        </div>
        ${avatar ? `<img class="avatar-photo" src="${avatar}" alt="" />` : `<div class="avatar">${initials}</div>`}
      </header>
      <hr class="header-rule" />

      <section>
        <div class="section-title">Professional Summary</div>
        <div class="summary">${cleanText(content.professionalSummary || content.personalInfo?.summary || '')}</div>
      </section>

      <section>
        <div class="section-title">Professional Experience</div>
        <div class="experience-list">
          ${experiences}
        </div>
      </section>

      ${skillsSection}

      ${educationSection}

      <footer>
        Generated by my custom AI resume builder — <a href="https://job-finder.joshwentworth.com">JOB FINDER</a>
      </footer>
    </div>
  </body>
  </html>
  `
}

function coverLetterHtml(
  content: CoverLetterContent,
  opts: { name: string; email: string; location?: string; phone?: string; date?: string; logo?: string; avatar?: string }
): string {
  const contact = buildContactRow({
    name: opts.name,
    email: opts.email,
    location: opts.location,
    contact: { email: opts.email, location: opts.location },
    title: '',
    summary: ''
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
      margin-bottom: 12px;
      grid-template-columns: auto 1fr auto;
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
      font-size: 13px;
      color: var(--text);
      font-weight: 700;
      margin: 0;
    }

    .date {
      font-size: 10px;
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
      font-size: 10.5px;
      line-height: 1.75;
      color: var(--text);
      margin: 0 0 14px 0;
      text-align: justify;
    }

    .letter-body p:last-child {
      margin-bottom: 0;
    }

    /* Signature with accent */
    .signature {
      margin-top: 28px;
      padding-left: 16px;
      margin-left: 4px;
    }

    .signature-line {
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .signature-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      position: relative;
      display: inline-block;
    }

    .signature-name::after {
      content: "";
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, var(--accent) 0%, transparent 100%);
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
        ${opts.logo ? `<div class="logo-box"><img src="${opts.logo}" alt="" /></div>` : '<div></div>'}
        <div class="header-center">
          <div class="name">${cleanText(opts.name)}</div>
          ${contact}
        </div>
        ${avatar ? `<img class="avatar-photo" src="${avatar}" alt="" />` : `<div class="avatar">${initials}</div>`}
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
        <div class="signature-name">${cleanText(content.signature || opts.name)}</div>
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
    options: { name: string; email: string; location?: string; phone?: string; date?: string; logo?: string; avatar?: string }
  ): Promise<Buffer> {
    const html = coverLetterHtml(content, options)
    return renderHtmlToPdf(html)
  }
}
