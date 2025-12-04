import PdfPrinter from 'pdfmake'
import type { TDocumentDefinitions, Content, StyleDictionary } from 'pdfmake/interfaces'
import { cleanText, cleanArray } from './text.util'
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

  /**
   * Build a single contact cell (icon + label) with consistent sizing/color across resume/cover letter.
   */
  private buildContactCell(
    iconKey: keyof typeof CONTACT_ICONS,
    label: string,
    options?: { link?: string; iconColor?: string; linkColor?: string }
  ): Content {
    const iconColor = options?.iconColor ?? '#6B7280'
    const linkColor = options?.linkColor ?? '#2563EB'
    return {
      columns: [
        {
          svg: CONTACT_ICONS[iconKey].replace(/stroke="currentColor"/g, `stroke="${iconColor}"`),
          fit: [12, 12],
          margin: [0, 0.5, 6, 0],
          alignment: 'center'
        },
        {
          text: label,
          link: options?.link,
          color: options?.link ? linkColor : '#1F2937',
          fontSize: 9,
          style: 'contactChip',
          margin: [0, 0.5, 0, 0]
        }
      ],
      columnGap: 6,
      alignment: 'center',
      margin: [2, 1, 2, 1]
    }
  }

  /**
   * Build a contact row with bullet separators.
   */
  private buildContactRow(
    items: Content[],
    margin: [number, number, number, number] = [0, 10, 0, 4]
  ): Content | null {
    if (items.length === 0) return null

    const separator: Content = { text: '•', fontSize: 10, color: '#CBD5E1', alignment: 'center', margin: [8, -0.5, 8, 0] }

    const cells: Content[] = items.flatMap((item, index) => (index > 0 ? [separator, item] : [item]))

    return {
      table: {
        widths: cells.map(() => 'auto'),
        body: [cells]
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 2,
        paddingBottom: () => 2
      },
      alignment: 'center' as const,
      margin
    }
  }

  async generateResumePDF(
    content: ResumeContent,
    _style = 'modern',
    accentColor = '#3B82F6',
    personalInfo?: PersonalInfo
  ): Promise<Buffer> {
    const resumeMargins: [number, number, number, number] = [60, 72, 60, 60]
    const contentWidth = 612 - resumeMargins[0] - resumeMargins[2] // LETTER width in points minus horizontal margins

    const styles: StyleDictionary = {
      // Header styles
      name: {
        fontSize: 24,
        bold: true,
        color: accentColor,
        margin: [0, 0, 0, 2]
      },
      title: {
        fontSize: 12,
        color: '#4B5563',
        margin: [0, 0, 0, 6]
      },
      contactLine: {
        fontSize: 9,
        color: '#1F2937'
      },
      contactChip: {
        fontSize: 9,
        color: '#1F2937',
        lineHeight: 1.1
      },
      // Section header
      sectionHeader: {
        fontSize: 11,
        bold: true,
        color: accentColor,
        margin: [0, 20, 0, 10],
        characterSpacing: 0.6
      },
      // Summary
      summary: {
        fontSize: 10.5,
        color: '#374151',
        lineHeight: 1.6
      },
      // Experience styles
      roleTitle: {
        fontSize: 11.5,
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
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.5,
        margin: [0, 0, 0, 4]
      },
      technologies: {
        fontSize: 8.75,
        color: '#6B7280',
        italics: true,
        margin: [0, 8, 0, 0]
      },
      // Skills styles
      skillCategory: {
        fontSize: 9.5,
        bold: true,
        color: '#1F2937'
      },
      skillItems: {
        fontSize: 9.75,
        color: '#4B5563',
        lineHeight: 1.35
      },
      // Education
      educationEntry: {
        fontSize: 10,
        color: '#374151'
      },
      // Footer
      footer: {
        fontSize: 7,
        color: '#A0A6B1',
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
    const email = cleanText(personalInfo?.email || content.personalInfo.contact.email)
    const location = cleanText(personalInfo?.location || content.personalInfo.contact.location)
    const website = cleanText(personalInfo?.website || content.personalInfo.contact.website)
    const linkedin = cleanText(personalInfo?.linkedin || content.personalInfo.contact.linkedin)
    const github = cleanText(personalInfo?.github || content.personalInfo.contact.github)
    const phone = (personalInfo as any)?.phone || (content.personalInfo as any)?.contact?.phone

    // Build contact items with generous breathing room and consistent alignment
    const contactItems: Content[] = []

    if (email) {
      contactItems.push(this.buildContactCell('email', email, { link: `mailto:${email}`, iconColor, linkColor }))
    }
    if (phone) {
      contactItems.push(this.buildContactCell('phone', phone, { iconColor, linkColor }))
    }
    if (location) {
      contactItems.push(this.buildContactCell('location', location, { iconColor, linkColor }))
    }
    if (website) {
      const websiteUrl = website.match(/^https?:/i) ? website : `https://${website}`
      contactItems.push(this.buildContactCell('website', cleanText(website.replace(/^https?:\/\//i, '')), { link: websiteUrl, iconColor, linkColor }))
    }
    if (linkedin) {
      const linkedinUrl = linkedin.match(/^https?:/i) ? linkedin : `https://${linkedin}`
      contactItems.push(this.buildContactCell('linkedin', 'LinkedIn', { link: linkedinUrl, iconColor, linkColor }))
    }
    if (github) {
      const githubUrl = github.match(/^https?:/i) ? github : `https://${github}`
      contactItems.push(this.buildContactCell('github', 'GitHub', { link: githubUrl, iconColor, linkColor }))
    }

    // Build contact row with separators
    const contactRow = this.buildContactRow(contactItems, [0, 10, 0, 4])

    // Build header with optional avatar
    const headerContent: Content[] = []
    const headerTitle = cleanText(content.personalInfo.title ?? '')

    // Left-aligned header stack + optional avatar on the right
    const headerColumns: any[] = []

    const mainStack: Content[] = [
      { text: cleanText(personalInfo?.name || content.personalInfo.name), style: 'name', alignment: 'left' }
    ]
    if (headerTitle) {
      mainStack.push({ text: headerTitle, style: 'title', alignment: 'left' })
    }
    if (contactRow) {
      mainStack.push({ ...(contactRow as any), alignment: 'left' })
    }

    headerColumns.push({ stack: mainStack, width: '*', alignment: 'left' })

    if (avatarDataUri) {
      headerColumns.push({ image: avatarDataUri, width: avatarSize, height: avatarSize, alignment: 'right', margin: [12, 2, 0, 0] })
    }

    headerContent.push({ columns: headerColumns, columnGap: 16, margin: [0, 10, 0, 18] })

    // Build experience section (each role is a cohesive block to improve flow)
    const experienceContent: Content[] = []
    for (let i = 0; i < content.experience.length; i++) {
      const exp = content.experience[i]
      const start = formatDate(exp.startDate)
      const end = formatDate(exp.endDate)
      const dateRange = start || end ? `${start || ''} - ${end || 'Present'}` : ''
      const isFirst = i === 0

      const roleAndDate: Content = {
        columns: [
          { text: cleanText(exp.role), style: 'roleTitle', width: '*' },
          { text: cleanText(dateRange), style: 'dateRange', width: 'auto', alignment: 'right' }
        ],
        columnGap: 10
      }

      const companyLine: Content = {
        text: cleanText(exp.company + (exp.location ? ` • ${exp.location}` : '')),
        style: 'companyLine'
      }

      const highlightList: Content[] =
        exp.highlights && exp.highlights.length > 0
          ? [
              {
                ul: cleanArray(exp.highlights).map((h) => ({ text: h, style: 'bulletPoint' })),
                margin: [0, 2, 0, 0],
                markerColor: accentColor
              }
            ]
          : []

      const tech = Array.isArray((exp as any).technologies) ? cleanArray((exp as any).technologies) : []
      const techLine: Content[] =
        tech.length > 0
          ? [
              {
                text: [{ text: 'Technologies: ', bold: true, color: '#4B5563' }, tech.join(', ')],
                style: 'technologies'
              }
            ]
          : []

      experienceContent.push({
        stack: [roleAndDate, companyLine, ...highlightList, ...techLine],
        margin: [0, isFirst ? 0 : 14, 0, 0]
      })
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
            { text: cleanArray(skill1.items).join(', '), style: 'skillItems', lineHeight: 1.35 }
          ],
          margin: [0, 6, 16, 6]
        })
        // Second skill (if exists)
        if (i + 1 < content.skills.length) {
          const skill2 = content.skills[i + 1]
          row.push({
            stack: [
              { text: skill2.category, style: 'skillCategory', margin: [0, 0, 0, 4] },
              { text: cleanArray(skill2.items).join(', '), style: 'skillItems', lineHeight: 1.35 }
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
        const institution = cleanText(edu.institution || '')
        const degree = cleanText(edu.degree || '')
        const field = cleanText(edu.field || '')
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
        { text: cleanText(title), style: 'sectionHeader' },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: contentWidth,
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
      const footerText = [{ text: 'Generated by the candidate with Job Finder', color: '#A0A6B1' }]
      if (logoDataUri) {
        return {
          columns: [
            { image: logoDataUri, width: 14, height: 14, margin: [50, 6, 6, 0] },
            { text: footerText, style: 'footer', margin: [0, 10, 50, 0], width: '*' }
          ]
        }
      }
      return { text: footerText, style: 'footer', margin: [50, 10, 50, 0] }
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: resumeMargins,
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
        { text: cleanText(content.professionalSummary || content.personalInfo.summary), style: 'summary', margin: [0, 0, 0, 10] },

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
    options: {
      name: string
      email: string
      location?: string
      phone?: string
      website?: string
      linkedin?: string
      github?: string
      accentColor?: string
      date?: string
      logo?: string
    }
  ): Promise<Buffer> {
    const accentColor = options.accentColor ?? '#3B82F6'
    const letterMargins: [number, number, number, number] = [60, 68, 60, 64]
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
      name: { fontSize: 21, bold: true, color: accentColor, margin: [0, 0, 0, 6] },
      contact: { fontSize: 9.5, color: '#1F2937' },
      contactChip: { fontSize: 9.5, color: '#1F2937', lineHeight: 1.15 },
      date: { fontSize: 10.5, color: '#374151', margin: [0, 12, 0, 12] },
      greeting: { fontSize: 10.5, color: '#111827', margin: [0, 0, 0, 12] },
      body: { fontSize: 10.5, color: '#374151', lineHeight: 1.6, margin: [0, 0, 0, 14] },
      closing: { fontSize: 10.5, color: '#374151', margin: [0, 6, 0, 4] },
      signature: { fontSize: 10.5, bold: true, color: '#111827', margin: [0, 16, 0, 0] },
      footer: { fontSize: 7, color: '#A0A6B1', alignment: 'center' }
    }

    const bodyContent: Content[] = cleanArray(content.bodyParagraphs).map((para) => ({ text: para, style: 'body' }))

    const iconColor = '#6B7280'
    const linkColor = '#2563EB'
    const contactItems: Content[] = []
    const safeEmail = cleanText(options.email)
    if (safeEmail)
      contactItems.push(this.buildContactCell('email', safeEmail, { link: `mailto:${safeEmail}`, iconColor, linkColor }))
    if (options.phone) contactItems.push(this.buildContactCell('phone', cleanText(options.phone), { iconColor, linkColor }))
    if (options.location) contactItems.push(this.buildContactCell('location', cleanText(options.location), { iconColor, linkColor }))
    if (options.website) {
      const url = options.website.match(/^https?:/i) ? options.website : `https://${options.website}`
      contactItems.push(this.buildContactCell('website', cleanText(options.website.replace(/^https?:\/\//i, '')), { link: url, iconColor, linkColor }))
    }
    if (options.linkedin) {
      const url = options.linkedin.match(/^https?:/i) ? options.linkedin : `https://${options.linkedin}`
      contactItems.push(this.buildContactCell('linkedin', 'LinkedIn', { link: url, iconColor, linkColor }))
    }
    if (options.github) {
      const url = options.github.match(/^https?:/i) ? options.github : `https://${options.github}`
      contactItems.push(this.buildContactCell('github', 'GitHub', { link: url, iconColor, linkColor }))
    }

    const contactRow = this.buildContactRow(contactItems, [0, 10, 0, 12])

    // Build header with optional logo + contact chips to avoid top dead space
    const headerColumns: any[] = []

    if (logoDataUri) {
      headerColumns.push({ image: logoDataUri, width: 32, height: 32, margin: [0, 4, 10, 0] })
    }

    const headerStack: Content[] = [{ text: cleanText(options.name), style: 'name', alignment: 'left' }]
    if (contactRow) {
      headerStack.push(contactRow)
    }

    headerColumns.push({
      stack: headerStack,
      width: '*'
    })

    const headerBlock: Content = { columns: headerColumns, columnGap: 14, margin: [0, 8, 0, 16] }

    // Build footer with optional logo
    const footerContent = (): Content => {
      const footerText = [{ text: 'Generated by the candidate with Job Finder', color: '#A0A6B1' }]
      if (logoDataUri) {
        return {
          columns: [
            { image: logoDataUri, width: 14, height: 14, margin: [50, 6, 6, 0] },
            { text: footerText, style: 'footer', margin: [0, 10, 50, 0], width: '*' }
          ]
        }
      }
      return { text: footerText, style: 'footer', margin: [50, 10, 50, 0] }
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: letterMargins,
      defaultStyle: {
        font: 'Helvetica'
      },
      styles,
      footer: footerContent,
      content: [
        // Header
        headerBlock,

        // Date
        { text: cleanText(date), style: 'date' },

        // Greeting
        { text: cleanText(content.greeting), style: 'greeting' },

        // Opening paragraph
        { text: cleanText(content.openingParagraph), style: 'body' },

        // Body paragraphs
        ...bodyContent,

        // Closing paragraph
        { text: cleanText(content.closingParagraph), style: 'body' },

        // Signature
        { text: cleanText(content.signature), style: 'closing' },
        { text: cleanText(options.name), style: 'signature' }
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
