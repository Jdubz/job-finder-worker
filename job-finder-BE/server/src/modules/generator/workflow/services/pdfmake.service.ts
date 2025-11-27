import PdfPrinter from 'pdfmake'
import type { TDocumentDefinitions, Content, StyleDictionary } from 'pdfmake/interfaces'
import type { Logger } from 'pino'
import type { CoverLetterContent, ResumeContent, PersonalInfo } from '@shared/types'
import { logger as rootLogger } from '../../../../logger'
import { storageService } from './storage.service'
import { env } from '../../../../config/env'

function formatDate(value?: string | null): string {
  if (!value) return ''
  const normalized = value.length === 4 ? `${value}-01` : value
  const date = new Date(normalized + (normalized.length === 7 ? '-01' : ''))
  if (Number.isNaN(date.getTime())) return value
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
  return formatter.format(date)
}

// Use standard fonts that pdfmake bundles
const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}

const printer = new PdfPrinter(fonts)

// Normalize asset URLs coming from the API (e.g., /api/generator/artifacts/assets/...) to
// a relative storage path that can be read directly from disk. Returns null when the URL
// does not point to a locally stored asset.
export function normalizeAssetPath(url: string): string | null {
  // Ensure leading slash and no trailing slash
  const publicBase = `/${(env.GENERATOR_ARTIFACTS_PUBLIC_BASE ?? '/api/generator/artifacts')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')}`

  const trimLeadingSlash = (value: string) => value.replace(/^\/+/, '')

  const matchLocalPath = (pathname: string, allowGenericAbsolute = true): string | null => {
    if (pathname.startsWith(publicBase)) {
      const stripped = pathname.slice(publicBase.length)
      return trimLeadingSlash(stripped)
    }
    if (pathname.startsWith('/assets/')) {
      return trimLeadingSlash(pathname)
    }
    // Preserve prior behaviour for non-URL paths: treat any other absolute path as a local storage path
    if (allowGenericAbsolute && pathname.startsWith('/')) {
      return trimLeadingSlash(pathname)
    }
    return null
  }

  try {
    if (/^https?:\/\//i.test(url)) {
      const parsed = new URL(url)
      return matchLocalPath(parsed.pathname, false)
    }
  } catch {
    // Non-URL input; fall through and handle as a path below
  }

  return matchLocalPath(url)
}

// Fetch image and convert to base64 data URI for pdfmake
async function fetchImageAsBase64(url: string, log: Logger): Promise<string | null> {
  // Already a data URI; use as-is
  if (url.startsWith('data:image/')) {
    return url
  }

  try {
    const localPath = normalizeAssetPath(url)

    // Allow local filesystem paths for avatar/logo
    if (localPath) {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const absolute = storageService.getAbsolutePath(localPath)
      const buffer = await fs.readFile(absolute)
      const ext = path.extname(absolute).toLowerCase()
      const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${buffer.toString('base64')}`
    }

    const response = await fetch(url)
    if (!response.ok) {
      log.warn({ url, status: response.status }, 'Failed to fetch image')
      return null
    }
    const contentType = response.headers.get('content-type') || 'image/png'
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:${contentType};base64,${base64}`
  } catch (error) {
    log.warn({ err: error, url }, 'Error fetching image for PDF')
    return null
  }
}

export class PdfMakeService {
  constructor(private readonly log: Logger = rootLogger) {}

  // TODO: Implement style variants (modern, traditional, technical, executive)
  async generateResumePDF(
    content: ResumeContent,
    _style = 'modern',
    accentColor = '#3B82F6',
    personalInfo?: PersonalInfo
  ): Promise<Buffer> {
    const styles: StyleDictionary = {
      // Header styles
      name: {
        fontSize: 22,
        bold: true,
        color: accentColor
      },
      title: {
        fontSize: 12,
        color: '#4B5563',
        margin: [0, 2, 0, 4]
      },
      contactLine: {
        fontSize: 9,
        color: '#6B7280',
        margin: [0, 0, 0, 16]
      },
      // Section header
      sectionHeader: {
        fontSize: 10,
        bold: true,
        color: '#111827',
        margin: [0, 14, 0, 6]
      },
      // Summary
      summary: {
        fontSize: 9.5,
        color: '#374151',
        lineHeight: 1.4
      },
      // Experience styles
      roleTitle: {
        fontSize: 10,
        bold: true,
        color: '#111827'
      },
      dateRange: {
        fontSize: 9,
        color: '#6B7280'
      },
      companyLine: {
        fontSize: 9,
        color: '#4B5563',
        italics: true,
        margin: [0, 1, 0, 4]
      },
      bulletPoint: {
        fontSize: 9,
        color: '#374151',
        lineHeight: 1.3
      },
      technologies: {
        fontSize: 8.5,
        color: '#6B7280',
        italics: true,
        margin: [0, 4, 0, 10]
      },
      // Skills styles
      skillCategory: {
        fontSize: 9,
        bold: true,
        color: '#374151'
      },
      skillItems: {
        fontSize: 9,
        color: '#4B5563'
      },
      // Education
      educationEntry: {
        fontSize: 9,
        color: '#374151'
      },
      // Footer
      footer: {
        fontSize: 7.5,
        color: '#9CA3AF',
        italics: true,
        alignment: 'center'
      }
    }

    // Fetch avatar and logo if available
    let avatarDataUri: string | null = null
    let logoDataUri: string | null = null

    if (personalInfo?.avatar) {
      avatarDataUri = await fetchImageAsBase64(personalInfo.avatar, this.log)
    }
    if (personalInfo?.logo) {
      logoDataUri = await fetchImageAsBase64(personalInfo.logo, this.log)
    }

    // Build contact line from PersonalInfo (primary) or ResumeContent (fallback)
    const linkColor = '#2563EB' // Blue color for all links
    const email = personalInfo?.email || content.personalInfo.contact.email
    const location = personalInfo?.location || content.personalInfo.contact.location
    const website = personalInfo?.website || content.personalInfo.contact.website
    const linkedin = personalInfo?.linkedin || content.personalInfo.contact.linkedin
    const github = personalInfo?.github || content.personalInfo.contact.github
    const phone = (personalInfo as any)?.phone || (content.personalInfo as any)?.contact?.phone

    // Build contact parts as text/link objects for proper link handling
    const contactElements: any[] = []
    const addSeparator = () => {
      if (contactElements.length > 0) contactElements.push({ text: ' • ' })
    }

    if (email) {
      addSeparator()
      contactElements.push({ text: email, link: `mailto:${email}`, color: linkColor })
    }
    if (location) {
      addSeparator()
      contactElements.push({ text: location })
    }
    if (phone) {
      addSeparator()
      contactElements.push({ text: phone })
    }
    if (website) {
      addSeparator()
      const websiteUrl = website.startsWith('http') ? website : `https://${website}`
      contactElements.push({ text: 'Portfolio', link: websiteUrl, color: linkColor })
    }
    if (linkedin) {
      addSeparator()
      const linkedinUrl = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`
      contactElements.push({ text: 'LinkedIn', link: linkedinUrl, color: linkColor })
    }
    if (github) {
      addSeparator()
      const githubUrl = github.startsWith('http') ? github : `https://${github}`
      contactElements.push({ text: 'GitHub', link: githubUrl, color: linkColor })
    }

    // Build header with optional avatar
    const headerContent: Content[] = []
    const headerTitle = content.personalInfo.title ?? ''

    // If we have an avatar and/or logo, show them with the header stack
    const headerColumns: any[] = []
    if (avatarDataUri) {
      headerColumns.push({
        image: avatarDataUri,
        width: 50,
        height: 50,
        margin: [0, 0, 12, 0]
      })
    }

    headerColumns.push({
      stack: [
        { text: personalInfo?.name || content.personalInfo.name, style: 'name' },
        { text: headerTitle, style: 'title' },
        { text: contactElements, style: 'contactLine' }
      ],
      width: '*'
    })

    if (logoDataUri) {
      headerColumns.push({
        image: logoDataUri,
        width: 40,
        height: 40,
        alignment: 'right'
      })
    }

    headerContent.push({
      columns: headerColumns,
      margin: [0, 0, 0, 0]
    })

    // Build experience section
    const experienceContent: Content[] = []
    for (const exp of content.experience) {
      const start = formatDate(exp.startDate)
      const end = formatDate(exp.endDate)
      const dateRange = start || end ? `${start || ''} - ${end || 'Present'}` : ''

      // Role and date on same line
      experienceContent.push({
        columns: [
          { text: exp.role, style: 'roleTitle', width: '*' },
          { text: dateRange, style: 'dateRange', width: 'auto', alignment: 'right' }
        ],
        margin: [0, 6, 0, 0]
      })

      // Company and location
      experienceContent.push({
        text: exp.company + (exp.location ? ` • ${exp.location}` : ''),
        style: 'companyLine'
      })

      // Bullet points for highlights
      if (exp.highlights && exp.highlights.length > 0) {
        experienceContent.push({
          ul: exp.highlights.map((h) => ({ text: h, style: 'bulletPoint' })),
          margin: [0, 0, 0, 0]
        })
      }

      // Technologies line (if present)
      const tech = Array.isArray((exp as any).technologies) ? (exp as any).technologies : []
      if (tech.length > 0) {
        experienceContent.push({
          text: [{ text: 'Technologies: ', bold: true }, tech.join(', ')],
          style: 'technologies'
        })
      }
    }

    // Build skills section - two column table layout
    const skillsContent: Content[] = []
    if (content.skills && content.skills.length > 0) {
      // Pair skills into rows of 2
      const skillRows: Content[][] = []
      for (let i = 0; i < content.skills.length; i += 2) {
        const row: Content[] = []
        // First skill
        const skill1 = content.skills[i]
        row.push({
          stack: [
            { text: skill1.category, style: 'skillCategory', margin: [0, 0, 0, 2] },
            { text: skill1.items.join(', '), style: 'skillItems' }
          ],
          margin: [0, 4, 8, 4]
        })
        // Second skill (if exists)
        if (i + 1 < content.skills.length) {
          const skill2 = content.skills[i + 1]
          row.push({
            stack: [
              { text: skill2.category, style: 'skillCategory', margin: [0, 0, 0, 2] },
              { text: skill2.items.join(', '), style: 'skillItems' }
            ],
            margin: [8, 4, 0, 4]
          })
        } else {
          row.push({ text: '', margin: [8, 4, 0, 4] })
        }
        skillRows.push(row)
      }

      skillsContent.push({
        table: {
          widths: ['50%', '50%'],
          body: skillRows
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 0]
      })
    }

    // Build education section
    const educationContent: Content[] = []
    if (content.education && content.education.length > 0) {
      for (const edu of content.education) {
        const institution = edu.institution || ''
        const degree = edu.degree || ''
        const field = edu.field || ''
        const start = formatDate(edu.startDate)
        const end = formatDate(edu.endDate)
        const dateStr = start || end ? ` (${start || ''}${end ? ` - ${end}` : ''})` : ''

        if (!institution && !degree && !field && !dateStr) continue

        educationContent.push({
          text: [
            { text: institution, bold: true },
            { text: `${institution ? ' – ' : ''}${degree}${field ? ` in ${field}` : ''}${dateStr}` }
          ],
          style: 'educationEntry',
          margin: [0, 2, 0, 2]
        })
      }
    }

    // Section header with underline
    const createSectionHeader = (title: string): Content => ({
      stack: [
        { text: title, style: 'sectionHeader' },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 515,
              y2: 0,
              lineWidth: 0.5,
              lineColor: accentColor
            }
          ],
          margin: [0, 0, 0, 6]
        }
      ]
    })

    // Build footer with optional logo
    const footerContent = (_currentPage: number, _pageCount: number): Content => {
      const footerText = [
        { text: 'Generated by my custom AI resume builder — ' },
        { text: 'Job Finder', link: 'https://job-finder.joshwentworth.com/', color: '#2563EB' }
      ]
      if (logoDataUri) {
        return {
          columns: [
            {
              image: logoDataUri,
              width: 16,
              height: 16,
              margin: [40, 6, 4, 0]
            },
            {
              text: footerText,
              style: 'footer',
              margin: [0, 10, 40, 0],
              width: '*'
            }
          ]
        }
      }
      return {
        text: footerText,
        style: 'footer',
        margin: [40, 10, 40, 0]
      }
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [40, 40, 40, 50],
      defaultStyle: {
        font: 'Helvetica'
      },
      styles,
      footer: footerContent,
      content: [
        // Header (with or without avatar)
        ...headerContent,

        // Professional Summary
        createSectionHeader('PROFESSIONAL SUMMARY'),
        { text: content.professionalSummary || content.personalInfo.summary, style: 'summary', margin: [0, 0, 0, 4] },

        // Professional Experience
        createSectionHeader('PROFESSIONAL EXPERIENCE'),
        ...experienceContent,

        // Technical Skills (if present)
        ...(skillsContent.length > 0 ? [createSectionHeader('TECHNICAL SKILLS'), ...skillsContent] : []),

        // Education (if present)
        ...(educationContent.length > 0 ? [createSectionHeader('EDUCATION'), ...educationContent] : [])
      ]
    }

    return this.generatePdfBuffer(docDefinition)
  }

  async generateCoverLetterPDF(
    content: CoverLetterContent,
    options: { name: string; email: string; accentColor?: string; date?: string; logo?: string }
  ): Promise<Buffer> {
    const accentColor = options.accentColor ?? '#3B82F6'
    const date =
      options.date ??
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

    // Fetch logo if available
    let logoDataUri: string | null = null
    if (options.logo) {
      logoDataUri = await fetchImageAsBase64(options.logo, this.log)
    }

    const styles: StyleDictionary = {
      name: {
        fontSize: 18,
        bold: true,
        color: accentColor
      },
      contact: {
        fontSize: 9,
        color: '#6B7280',
        margin: [0, 2, 0, 24]
      },
      date: {
        fontSize: 10,
        color: '#374151',
        margin: [0, 0, 0, 16]
      },
      greeting: {
        fontSize: 10,
        color: '#111827',
        margin: [0, 0, 0, 12]
      },
      body: {
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.5,
        margin: [0, 0, 0, 12]
      },
      closing: {
        fontSize: 10,
        color: '#374151',
        margin: [0, 8, 0, 4]
      },
      signature: {
        fontSize: 10,
        bold: true,
        color: '#111827',
        margin: [0, 20, 0, 0]
      },
      footer: {
        fontSize: 7.5,
        color: '#9CA3AF',
        italics: true,
        alignment: 'center'
      }
    }

    const bodyContent: Content[] = content.bodyParagraphs.map((para) => ({
      text: para,
      style: 'body'
    }))

    // Build footer with optional logo
    const footerContent = (): Content => {
      const footerText = [
        { text: 'Generated by my custom AI resume builder — ' },
        { text: 'Job Finder', link: 'https://job-finder.joshwentworth.com/', color: '#2563EB' }
      ]
      if (logoDataUri) {
        return {
          columns: [
            {
              image: logoDataUri,
              width: 16,
              height: 16,
              margin: [50, 6, 4, 0]
            },
            {
              text: footerText,
              style: 'footer',
              margin: [0, 10, 50, 0],
              width: '*'
            }
          ]
        }
      }
      return {
        text: footerText,
        style: 'footer',
        margin: [50, 10, 50, 0]
      }
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [50, 50, 50, 50],
      defaultStyle: {
        font: 'Helvetica'
      },
      styles,
      footer: footerContent,
      content: [
        // Header
        { text: options.name, style: 'name' },
        { text: options.email, style: 'contact' },

        // Date
        { text: date, style: 'date' },

        // Greeting
        { text: content.greeting, style: 'greeting' },

        // Opening paragraph
        { text: content.openingParagraph, style: 'body' },

        // Body paragraphs
        ...bodyContent,

        // Closing paragraph
        { text: content.closingParagraph, style: 'body' },

        // Signature
        { text: content.signature, style: 'closing' },
        { text: options.name, style: 'signature' }
      ]
    }

    return this.generatePdfBuffer(docDefinition)
  }

  private generatePdfBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const handleError = (error: unknown) => {
        this.log.error({ err: error }, 'pdfmake PDF generation failed')
        const message = error instanceof Error ? error.message : 'Unknown error'
        reject(new Error(`PDF generation failed: ${message}`))
      }

      try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition)
        const chunks: Buffer[] = []

        pdfDoc.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        pdfDoc.on('end', () => {
          const result = Buffer.concat(chunks)
          this.log.info({ size: result.length }, 'PDF generated successfully with pdfmake')
          resolve(result)
        })

        pdfDoc.on('error', handleError)

        pdfDoc.end()
      } catch (error) {
        handleError(error)
      }
    })
  }
}
