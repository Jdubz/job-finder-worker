import PdfPrinter from 'pdfmake'
import type { TDocumentDefinitions, Content, StyleDictionary } from 'pdfmake/interfaces'
import type { Logger } from 'pino'
import type { CoverLetterContent, ResumeContent, PersonalInfo } from '@shared/types'
import { logger as rootLogger } from '../../../../logger'

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

// Fetch image and convert to base64 data URI for pdfmake
async function fetchImageAsBase64(url: string, log: Logger): Promise<string | null> {
  try {
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
    const contactParts: string[] = []
    const email = personalInfo?.email || content.personalInfo.contact.email
    const location = personalInfo?.location || content.personalInfo.contact.location
    const website = personalInfo?.website || content.personalInfo.contact.website
    const linkedin = personalInfo?.linkedin || content.personalInfo.contact.linkedin
    const github = personalInfo?.github || content.personalInfo.contact.github

    if (email) contactParts.push(email)
    if (location) contactParts.push(location)
    if (website) contactParts.push(website)
    if (linkedin) contactParts.push('LinkedIn')
    if (github) contactParts.push('GitHub')

    // Build header with optional avatar
    const headerContent: Content[] = []

    // If we have an avatar, create a two-column layout with avatar on left
    if (avatarDataUri) {
      headerContent.push({
        columns: [
          {
            image: avatarDataUri,
            width: 50,
            height: 50,
            margin: [0, 0, 12, 0]
          },
          {
            stack: [
              { text: personalInfo?.name || content.personalInfo.name, style: 'name' },
              { text: content.personalInfo.title, style: 'title' },
              { text: contactParts.join(' • '), style: 'contactLine' }
            ],
            width: '*'
          }
        ],
        margin: [0, 0, 0, 0]
      })
    } else {
      // No avatar - simple text header
      headerContent.push({ text: personalInfo?.name || content.personalInfo.name, style: 'name' })
      headerContent.push({ text: content.personalInfo.title, style: 'title' })
      headerContent.push({ text: contactParts.join(' • '), style: 'contactLine' })
    }

    // Build experience section
    const experienceContent: Content[] = []
    for (const exp of content.experience) {
      const dateRange = exp.endDate ? `${exp.startDate} - ${exp.endDate}` : `${exp.startDate} - Present`

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
      if (exp.technologies && exp.technologies.length > 0) {
        experienceContent.push({
          text: [{ text: 'Technologies: ', bold: true }, exp.technologies.join(', ')],
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
        const dateStr =
          edu.startDate || edu.endDate ? ` (${edu.startDate || ''}${edu.endDate ? ` - ${edu.endDate}` : ''})` : ''
        educationContent.push({
          text: [
            { text: edu.institution, bold: true },
            { text: ` – ${edu.degree}${edu.field ? ` in ${edu.field}` : ''}${dateStr}` }
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
              text: 'Generated by a custom AI resume builder — https://job-finder.joshwentworth.com/',
              style: 'footer',
              margin: [0, 10, 40, 0],
              width: '*'
            }
          ]
        }
      }
      return {
        text: 'Generated by a custom AI resume builder — https://job-finder.joshwentworth.com/',
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
              text: 'Generated by a custom AI resume builder — https://job-finder.joshwentworth.com/',
              style: 'footer',
              margin: [0, 10, 50, 0],
              width: '*'
            }
          ]
        }
      }
      return {
        text: 'Generated by a custom AI resume builder — https://job-finder.joshwentworth.com/',
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
