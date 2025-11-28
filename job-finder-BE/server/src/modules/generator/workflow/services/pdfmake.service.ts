import PdfPrinter from 'pdfmake'
import type { TDocumentDefinitions, Content, StyleDictionary } from 'pdfmake/interfaces'
import type { Logger } from 'pino'
import type { CoverLetterContent, ResumeContent, PersonalInfo } from '@shared/types'
import { logger as rootLogger } from '../../../../logger'
import { storageService } from './storage.service'
import { env } from '../../../../config/env'
import sharp from 'sharp'

function formatDate(value?: string | null): string {
  if (!value) return ''
  const normalized = value.length === 4 ? `${value}-01` : value
  const date = new Date(normalized + (normalized.length === 7 ? '-01' : ''))
  if (Number.isNaN(date.getTime())) return value
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
  return formatter.format(date)
}

// SVG icons for contact items (simple, clean designs)
const CONTACT_ICONS = {
  email: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  location: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  linkedin: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>`,
  github: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`,
  website: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`
}

// Make an image circular using sharp
async function makeImageCircular(imageBuffer: Buffer, size: number): Promise<Buffer> {
  const circleShape = Buffer.from(
    `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
  )

  return sharp(imageBuffer)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: circleShape, blend: 'dest-in' }])
    .png()
    .toBuffer()
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
async function fetchImageAsBase64(
  url: string,
  log: Logger,
  options?: { circular?: boolean; size?: number }
): Promise<string | null> {
  // Already a data URI; use as-is (unless we need to make it circular)
  if (url.startsWith('data:image/') && !options?.circular) {
    return url
  }

  try {
    let buffer: Buffer

    if (url.startsWith('data:image/')) {
      // Extract buffer from data URI
      const base64Data = url.split(',')[1]
      buffer = Buffer.from(base64Data, 'base64')
    } else {
      const localPath = normalizeAssetPath(url)

      // Allow local filesystem paths for avatar/logo
      if (localPath) {
        const fs = await import('node:fs/promises')
        const absolute = storageService.getAbsolutePath(localPath)
        buffer = await fs.readFile(absolute)
      } else {
        const response = await fetch(url)
        if (!response.ok) {
          log.warn({ url, status: response.status }, 'Failed to fetch image')
          return null
        }
        buffer = Buffer.from(await response.arrayBuffer())
      }
    }

    // Make circular if requested
    if (options?.circular) {
      const size = options.size || 120
      buffer = await makeImageCircular(buffer, size)
    }

    return `data:image/png;base64,${buffer.toString('base64')}`
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
        fontSize: 24,
        bold: true,
        color: accentColor
      },
      title: {
        fontSize: 12,
        color: '#4B5563',
        margin: [0, 4, 0, 8]
      },
      contactLine: {
        fontSize: 9,
        color: '#6B7280',
        margin: [0, 0, 0, 0]
      },
      // Section header
      sectionHeader: {
        fontSize: 11,
        bold: true,
        color: accentColor,
        margin: [0, 18, 0, 8]
      },
      // Summary
      summary: {
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.5
      },
      // Experience styles
      roleTitle: {
        fontSize: 11,
        bold: true,
        color: '#111827'
      },
      dateRange: {
        fontSize: 9,
        color: '#6B7280'
      },
      companyLine: {
        fontSize: 9.5,
        color: '#4B5563',
        italics: true,
        margin: [0, 2, 0, 6]
      },
      bulletPoint: {
        fontSize: 9.5,
        color: '#374151',
        lineHeight: 1.4
      },
      technologies: {
        fontSize: 8.5,
        color: '#6B7280',
        italics: true,
        margin: [0, 6, 0, 14]
      },
      // Skills styles
      skillCategory: {
        fontSize: 9.5,
        bold: true,
        color: '#374151'
      },
      skillItems: {
        fontSize: 9.5,
        color: '#4B5563'
      },
      // Education
      educationEntry: {
        fontSize: 9.5,
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

    // Fetch avatar (circular) and logo if available
    let avatarDataUri: string | null = null
    let logoDataUri: string | null = null
    const avatarSize = 70 // Slightly larger for better presence

    if (personalInfo?.avatar) {
      avatarDataUri = await fetchImageAsBase64(personalInfo.avatar, this.log, {
        circular: true,
        size: avatarSize * 2 // Double resolution for crisp rendering
      })
    }
    if (personalInfo?.logo) {
      logoDataUri = await fetchImageAsBase64(personalInfo.logo, this.log)
    }

    // Build contact line from PersonalInfo (primary) or ResumeContent (fallback)
    const linkColor = '#2563EB' // Blue color for all links
    const iconColor = '#6B7280' // Gray for icons
    const email = personalInfo?.email || content.personalInfo.contact.email
    const location = personalInfo?.location || content.personalInfo.contact.location
    const website = personalInfo?.website || content.personalInfo.contact.website
    const linkedin = personalInfo?.linkedin || content.personalInfo.contact.linkedin
    const github = personalInfo?.github || content.personalInfo.contact.github
    const phone = (personalInfo as any)?.phone || (content.personalInfo as any)?.contact?.phone

    // Build contact items with icons - each as a column for better layout
    const contactItems: any[] = []

    if (email) {
      contactItems.push({
        columns: [
          { svg: CONTACT_ICONS.email.replace(/stroke="currentColor"/g, `stroke="${iconColor}"`), width: 10, height: 10, margin: [0, 1, 4, 0] },
          { text: email, link: `mailto:${email}`, color: linkColor, fontSize: 9 }
        ],
        columnGap: 0,
        width: 'auto'
      })
    }
    if (phone) {
      contactItems.push({
        columns: [
          { svg: CONTACT_ICONS.phone.replace(/stroke="currentColor"/g, `stroke="${iconColor}"`), width: 10, height: 10, margin: [0, 1, 4, 0] },
          { text: phone, fontSize: 9, color: '#4B5563' }
        ],
        columnGap: 0,
        width: 'auto'
      })
    }
    if (location) {
      contactItems.push({
        columns: [
          { svg: CONTACT_ICONS.location.replace(/stroke="currentColor"/g, `stroke="${iconColor}"`), width: 10, height: 10, margin: [0, 1, 4, 0] },
          { text: location, fontSize: 9, color: '#4B5563' }
        ],
        columnGap: 0,
        width: 'auto'
      })
    }
    if (website) {
      const websiteUrl = website.startsWith('http') ? website : `https://${website}`
      contactItems.push({
        columns: [
          { svg: CONTACT_ICONS.website.replace(/stroke="currentColor"/g, `stroke="${linkColor}"`), width: 10, height: 10, margin: [0, 1, 4, 0] },
          { text: 'Portfolio', link: websiteUrl, color: linkColor, fontSize: 9 }
        ],
        columnGap: 0,
        width: 'auto'
      })
    }
    if (linkedin) {
      const linkedinUrl = linkedin.startsWith('http') ? linkedin : `https://${linkedin}`
      contactItems.push({
        columns: [
          { svg: CONTACT_ICONS.linkedin.replace(/stroke="currentColor"/g, `stroke="${linkColor}"`), width: 10, height: 10, margin: [0, 1, 4, 0] },
          { text: 'LinkedIn', link: linkedinUrl, color: linkColor, fontSize: 9 }
        ],
        columnGap: 0,
        width: 'auto'
      })
    }
    if (github) {
      const githubUrl = github.startsWith('http') ? github : `https://${github}`
      contactItems.push({
        columns: [
          { svg: CONTACT_ICONS.github.replace(/stroke="currentColor"/g, `stroke="${linkColor}"`), width: 10, height: 10, margin: [0, 1, 4, 0] },
          { text: 'GitHub', link: githubUrl, color: linkColor, fontSize: 9 }
        ],
        columnGap: 0,
        width: 'auto'
      })
    }

    // Build contact row with separators
    const contactRow: any[] = []
    contactItems.forEach((item, index) => {
      if (index > 0) {
        contactRow.push({ text: '  •  ', fontSize: 9, color: '#D1D5DB' })
      }
      contactRow.push(item)
    })

    // Build header with optional avatar
    const headerContent: Content[] = []
    const headerTitle = content.personalInfo.title ?? ''

    // Build the header with logo on left, name centered, avatar on right
    const headerColumns: any[] = []

    // Left column: Logo (or spacer)
    if (logoDataUri) {
      headerColumns.push({
        image: logoDataUri,
        width: 45,
        height: 45,
        margin: [0, 5, 0, 0]
      })
    } else {
      headerColumns.push({ text: '', width: 45 }) // Spacer for alignment
    }

    // Center column: Name, title, and contact info
    headerColumns.push({
      stack: [
        { text: personalInfo?.name || content.personalInfo.name, style: 'name', alignment: 'center' },
        { text: headerTitle, style: 'title', alignment: 'center' },
        {
          columns: contactRow,
          columnGap: 0,
          alignment: 'center',
          margin: [0, 4, 0, 0]
        }
      ],
      width: '*',
      alignment: 'center'
    })

    // Right column: Circular avatar (or spacer)
    if (avatarDataUri) {
      headerColumns.push({
        image: avatarDataUri,
        width: avatarSize,
        height: avatarSize,
        alignment: 'right',
        margin: [0, 0, 0, 0]
      })
    } else {
      headerColumns.push({ text: '', width: avatarSize }) // Spacer for alignment
    }

    headerContent.push({
      columns: headerColumns,
      columnGap: 16,
      margin: [0, 0, 0, 12]
    })

    // Build experience section
    const experienceContent: Content[] = []
    for (let i = 0; i < content.experience.length; i++) {
      const exp = content.experience[i]
      const start = formatDate(exp.startDate)
      const end = formatDate(exp.endDate)
      const dateRange = start || end ? `${start || ''} - ${end || 'Present'}` : ''
      const isFirst = i === 0

      // Role and date on same line
      experienceContent.push({
        columns: [
          { text: exp.role, style: 'roleTitle', width: '*' },
          { text: dateRange, style: 'dateRange', width: 'auto', alignment: 'right' }
        ],
        margin: [0, isFirst ? 0 : 12, 0, 0] // More space between jobs, none before first
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
          margin: [0, 2, 0, 0],
          markerColor: accentColor
        })
      }

      // Technologies line (if present)
      const tech = Array.isArray((exp as any).technologies) ? (exp as any).technologies : []
      if (tech.length > 0) {
        experienceContent.push({
          text: [{ text: 'Technologies: ', bold: true, color: '#4B5563' }, tech.join(', ')],
          style: 'technologies'
        })
      }
    }

    // Build skills section - two column table layout with better spacing
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
            { text: skill1.category, style: 'skillCategory', margin: [0, 0, 0, 4] },
            { text: skill1.items.join(', '), style: 'skillItems', lineHeight: 1.3 }
          ],
          margin: [0, 6, 16, 6]
        })
        // Second skill (if exists)
        if (i + 1 < content.skills.length) {
          const skill2 = content.skills[i + 1]
          row.push({
            stack: [
              { text: skill2.category, style: 'skillCategory', margin: [0, 0, 0, 4] },
              { text: skill2.items.join(', '), style: 'skillItems', lineHeight: 1.3 }
            ],
            margin: [16, 6, 0, 6]
          })
        } else {
          row.push({ text: '', margin: [16, 6, 0, 6] })
        }
        skillRows.push(row)
      }

      skillsContent.push({
        table: {
          widths: ['50%', '50%'],
          body: skillRows
        },
        layout: 'noBorders',
        margin: [0, 6, 0, 0]
      })
    }

    // Build education section with better formatting
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
          margin: [0, 4, 0, 4]
        })
      }
    }

    // Section header with underline - adjusted width for new margins
    const createSectionHeader = (title: string): Content => ({
      stack: [
        { text: title, style: 'sectionHeader' },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 492, // Adjusted for 50pt margins (612 - 50 - 50 - 20 buffer)
              y2: 0,
              lineWidth: 1,
              lineColor: accentColor
            }
          ],
          margin: [0, 0, 0, 10]
        }
      ]
    })

    // Build footer with optional logo
    const footerContent = (_currentPage: number, _pageCount: number): Content => {
      const footerText = [
        { text: 'Generated by a custom AI resume builder built by the candidate — ' },
        { text: 'joshwentworth.com/resume-builder', link: 'https://joshwentworth.com/resume-builder', color: '#2563EB' }
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
      pageMargins: [50, 45, 50, 55], // Slightly larger margins for cleaner look
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
        { text: content.professionalSummary || content.personalInfo.summary, style: 'summary', margin: [0, 0, 0, 8] },

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
