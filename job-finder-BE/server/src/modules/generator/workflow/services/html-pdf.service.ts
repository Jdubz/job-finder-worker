import { chromium, type BrowserContext } from 'playwright-core'
import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { cleanText } from './text.util'
import { sharedCss } from './html-style'
const DEFAULT_MARGIN = '0.8in'
const CONTENT_WIDTH = '6.0in'

async function createContext(): Promise<BrowserContext> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'
  })
  return browser.newContext({ viewport: { width: 1275, height: 1650 } }) // Letter @150dpi
}

function buildContactRow(personal: PersonalInfo): string {
  const items: string[] = []
  const add = (label?: string, href?: string) => {
    if (!label) return
    const text = cleanText(label)
    if (!text) return
    const content = href ? `<a href="${href}" target="_blank">${text}</a>` : text
    items.push(`<span class="chip">${content}</span>`)
  }
  add(personal.email, `mailto:${personal.email}`)
  add((personal as any).phone)
  add(personal.location)
  if (personal.website) {
    const w = personal.website.startsWith('http') ? personal.website : `https://${personal.website}`
    add(personal.website, w)
  }
  if (personal.linkedin) {
    const l = personal.linkedin.startsWith('http') ? personal.linkedin : `https://${personal.linkedin}`
    add('LinkedIn', l)
  }
  if ((personal as any).github) {
    const g = (personal as any).github.startsWith('http') ? (personal as any).github : `https://${(personal as any).github}`
    add('GitHub', g)
  }
  return items.length ? `<div class="contact">${items.join('<span class="dot">·</span>')}</div>` : ''
}

function resumeHtml(content: ResumeContent, personalInfo?: PersonalInfo): string {
  const info = personalInfo ?? (content as any).personalInfo
  const initials = info?.name ? cleanText(info.name).split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() : ''
  const avatar = (info as any)?.avatar || ''
  const logo = (info as any)?.logo || ''
  const contactRow = buildContactRow(info)
  const experiences = content.experience
    .map((exp) => {
      const dates = `${cleanText(exp.startDate || '')} – ${cleanText(exp.endDate || 'Present')}`.trim()
      const bullets = (exp.highlights || [])
        .map((b) => `<li>${cleanText(b)}</li>`)
        .join('')
      const tech = Array.isArray((exp as any).technologies) && (exp as any).technologies.length
        ? `<div class="tech">${cleanText((exp as any).technologies.join(', '))}</div>`
        : ''
      return `
        <div class="role">
          <div class="role-header">
            <div>
              <div class="role-title">${cleanText(exp.role)}</div>
              <div class="company">${cleanText(exp.company)}${exp.location ? ' • ' + cleanText(exp.location) : ''}</div>
            </div>
            <div class="dates">${dates}</div>
          </div>
          <ul class="bullets">${bullets}</ul>
          ${tech}
        </div>
      `
    })
    .join('')

  const skills = (content.skills || [])
    .map((s) => `<div class="skill"><strong>${cleanText(s.category)}:</strong> ${cleanText(s.items.join(', '))}</div>`) 
    .join('')

  const education = (content.education || [])
    .map((e) => `<div class="edu"><strong>${cleanText(e.institution)}</strong> — ${cleanText(e.degree || e.field || '')}</div>`)
    .join('')

  return `
  <html>
  <head>
    <style>${sharedCss}</style>
  </head>
  <body>
    <div class="page">
      <header>
        <div class="brand">
          ${logo ? `<div class="logo-box"><img src="${logo}" alt="" /></div>` : ''}
          ${avatar ? `<img class="avatar-photo" src="${avatar}" alt="" />` : `<div class="avatar">${initials}</div>`}
        </div>
        <div>
          <div class="name">${cleanText(info.name)}</div>
          <div class="title">${cleanText(info.title || content.personalInfo.title || '')}</div>
          ${contactRow}
          <hr class="contact-rule" />
        </div>
      </header>

      <section>
        <div class="section-title">PROFESSIONAL SUMMARY</div>
        <div class="summary">${cleanText(content.professionalSummary || content.personalInfo.summary || '')}</div>
      </section>

      ${skills ? `<section><div class="section-title">TECHNICAL SKILLS</div>${skills}</section>` : ''}

      <section>
        <div class="section-title">PROFESSIONAL EXPERIENCE</div>
        ${experiences}
      </section>

      ${education ? `<section><div class="section-title">EDUCATION</div>${education}</section>` : ''}

      <footer>This document was created using my custom AI job-finder application — Job Finder</footer>
    </div>
  </body>
  </html>
  `
}

function coverLetterHtml(content: CoverLetterContent, opts: { name: string; email: string; location?: string; phone?: string; date?: string; logo?: string }): string {
  const contact = buildContactRow({
    name: opts.name,
    email: opts.email,
    location: opts.location,
    contact: { email: opts.email, location: opts.location },
    title: '',
    summary: ''
  } as any)
  const initials = opts.name ? cleanText(opts.name).split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() : ''
  const avatar = (opts as any).avatar || ''

  const bodyParas = [content.openingParagraph, ...(content.bodyParagraphs || []), content.closingParagraph]
    .filter(Boolean)
    .map((p) => `<p>${cleanText(p || '')}</p>`)
    .join('')

  return `
  <html>
  <head>
    <style>
      ${sharedCss}
      .letter { width: ${CONTENT_WIDTH}; margin: 0 auto; }
      .letter header { margin-bottom: 14px; grid-template-columns: 1fr; }
      .meta { font-size: 10.6px; color: var(--muted); margin: 6px 0 16px 0; }
      p { font-size: 11px; line-height: 1.68; color: var(--text); margin: 0 0 14px 0; }
      .signature { font-size: 11.2px; margin-top: 18px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="letter">
      <header>
        <div class="brand">
          ${opts.logo ? `<div class="logo-box"><img src="${opts.logo}" alt="" /></div>` : ''}
          ${avatar ? `<img class="avatar-photo" src="${avatar}" alt="" />` : `<div class="avatar">${initials}</div>`}
        </div>
        <div>
          <div class="name">${cleanText(opts.name)}</div>
          ${contact}
        </div>
      </header>
      <div class="meta">${cleanText(content.greeting)}<br>${cleanText(opts.date || '')}</div>
      ${bodyParas}
      <div class="signature">${cleanText(content.signature || opts.name)}</div>
    </div>
  </body>
  </html>
  `
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const context = await createContext()
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const pdf = await page.pdf({ format: 'Letter', margin: DEFAULT_MARGIN as any, printBackground: true })
  await context.browser()?.close()
  return pdf
}

export class HtmlPdfService {
  async renderResume(content: ResumeContent, personalInfo?: PersonalInfo): Promise<Buffer> {
    const html = resumeHtml(content, personalInfo)
    return renderHtmlToPdf(html)
  }

  async renderCoverLetter(content: CoverLetterContent, options: { name: string; email: string; location?: string; phone?: string; date?: string; logo?: string }): Promise<Buffer> {
    const html = coverLetterHtml(content, options)
    return renderHtmlToPdf(html)
  }
}
