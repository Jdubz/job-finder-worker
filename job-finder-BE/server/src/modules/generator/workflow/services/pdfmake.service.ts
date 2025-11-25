import PdfPrinter from 'pdfmake'
import type { TDocumentDefinitions, Content, StyleDictionary, TableCell } from 'pdfmake/interfaces'
import type { Logger } from 'pino'
import type { CoverLetterContent, ResumeContent } from '@shared/types'
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

// Color utilities
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null
}

function getLighterColor(hex: string, factor = 0.9): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#f0f4f8'
  const r = Math.round(rgb.r + (255 - rgb.r) * factor)
  const g = Math.round(rgb.g + (255 - rgb.g) * factor)
  const b = Math.round(rgb.b + (255 - rgb.b) * factor)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export class PdfMakeService {
  constructor(private readonly log: Logger = rootLogger) {}

  async generateResumePDF(content: ResumeContent, _style = 'modern', accentColor = '#3B82F6'): Promise<Buffer> {
    const lightBg = getLighterColor(accentColor, 0.92)

    const styles: StyleDictionary = {
      header: {
        fontSize: 24,
        bold: true,
        color: accentColor,
        margin: [0, 0, 0, 4]
      },
      subheader: {
        fontSize: 12,
        color: '#4B5563',
        margin: [0, 0, 0, 2]
      },
      contact: {
        fontSize: 10,
        color: '#6B7280',
        margin: [0, 0, 0, 16]
      },
      sectionTitle: {
        fontSize: 11,
        bold: true,
        color: '#374151',
        margin: [0, 16, 0, 8],
        decoration: 'underline',
        decorationColor: accentColor
      },
      experienceTitle: {
        fontSize: 11,
        bold: true,
        color: '#111827',
        margin: [0, 8, 0, 2]
      },
      experienceCompany: {
        fontSize: 10,
        color: '#4B5563',
        margin: [0, 0, 0, 4]
      },
      bullet: {
        fontSize: 10,
        color: '#374151',
        margin: [0, 2, 0, 2]
      },
      summary: {
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.4,
        margin: [0, 0, 0, 8]
      },
      skillCategory: {
        fontSize: 10,
        bold: true,
        color: '#374151'
      },
      skillItems: {
        fontSize: 10,
        color: '#4B5563'
      }
    }

    // Build contact line
    const contactParts: string[] = []
    if (content.personalInfo.contact.email) contactParts.push(content.personalInfo.contact.email)
    if (content.personalInfo.contact.location) contactParts.push(content.personalInfo.contact.location)
    if (content.personalInfo.contact.linkedin) contactParts.push(content.personalInfo.contact.linkedin)
    if (content.personalInfo.contact.github) contactParts.push(content.personalInfo.contact.github)
    if (content.personalInfo.contact.website) contactParts.push(content.personalInfo.contact.website)

    // Build experience section
    const experienceContent: Content[] = []
    for (const exp of content.experience) {
      const dateRange = exp.endDate ? `${exp.startDate} – ${exp.endDate}` : `${exp.startDate} – Present`

      experienceContent.push({
        columns: [
          { text: exp.role, style: 'experienceTitle', width: '*' },
          { text: dateRange, style: 'experienceCompany', width: 'auto', alignment: 'right' }
        ],
        margin: [0, 8, 0, 0]
      })

      experienceContent.push({
        text: exp.company + (exp.location ? ` • ${exp.location}` : ''),
        style: 'experienceCompany'
      })

      if (exp.highlights && exp.highlights.length > 0) {
        const bulletList: Content = {
          ul: exp.highlights.map((h) => ({ text: h, style: 'bullet' })),
          margin: [0, 4, 0, 8]
        }
        experienceContent.push(bulletList)
      }
    }

    // Build skills section
    const skillsContent: Content[] = []
    if (content.skills && content.skills.length > 0) {
      for (const skill of content.skills) {
        skillsContent.push({
          columns: [
            { text: `${skill.category}:`, style: 'skillCategory', width: 'auto' },
            { text: ` ${skill.items.join(', ')}`, style: 'skillItems', width: '*', margin: [4, 0, 0, 0] }
          ],
          margin: [0, 2, 0, 2]
        })
      }
    }

    // Build education section
    const educationContent: Content[] = []
    if (content.education && content.education.length > 0) {
      for (const edu of content.education) {
        educationContent.push({
          text: [
            { text: edu.institution, bold: true },
            { text: ` – ${edu.degree}${edu.field ? ` in ${edu.field}` : ''}` }
          ],
          fontSize: 10,
          color: '#374151',
          margin: [0, 2, 0, 2]
        })
      }
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      defaultStyle: {
        font: 'Helvetica'
      },
      styles,
      content: [
        // Header section with light background
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    { text: content.personalInfo.name, style: 'header' },
                    { text: content.personalInfo.title, style: 'subheader' },
                    { text: contactParts.join(' • '), style: 'contact' }
                  ],
                  fillColor: lightBg,
                  margin: [16, 16, 16, 16]
                } as TableCell
              ]
            ]
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 8]
        },

        // Professional Summary
        { text: 'PROFESSIONAL SUMMARY', style: 'sectionTitle' },
        { text: content.professionalSummary || content.personalInfo.summary, style: 'summary' },

        // Experience
        { text: 'EXPERIENCE', style: 'sectionTitle' },
        ...experienceContent,

        // Skills (if present)
        ...(skillsContent.length > 0 ? [{ text: 'SKILLS', style: 'sectionTitle' } as Content, ...skillsContent] : []),

        // Education (if present)
        ...(educationContent.length > 0
          ? [{ text: 'EDUCATION', style: 'sectionTitle' } as Content, ...educationContent]
          : [])
      ]
    }

    return this.generatePdfBuffer(docDefinition)
  }

  async generateCoverLetterPDF(
    content: CoverLetterContent,
    options: { name: string; email: string; accentColor?: string; date?: string }
  ): Promise<Buffer> {
    const accentColor = options.accentColor ?? '#3B82F6'
    const date =
      options.date ??
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

    const styles: StyleDictionary = {
      header: {
        fontSize: 18,
        bold: true,
        color: accentColor,
        margin: [0, 0, 0, 4]
      },
      contact: {
        fontSize: 10,
        color: '#6B7280',
        margin: [0, 0, 0, 24]
      },
      date: {
        fontSize: 10,
        color: '#374151',
        margin: [0, 0, 0, 16]
      },
      greeting: {
        fontSize: 11,
        color: '#111827',
        margin: [0, 0, 0, 12]
      },
      body: {
        fontSize: 11,
        color: '#374151',
        lineHeight: 1.5,
        margin: [0, 0, 0, 12]
      },
      closing: {
        fontSize: 11,
        color: '#374151',
        margin: [0, 16, 0, 4]
      },
      signature: {
        fontSize: 11,
        bold: true,
        color: '#111827',
        margin: [0, 24, 0, 0]
      }
    }

    const bodyContent: Content[] = content.bodyParagraphs.map((para) => ({
      text: para,
      style: 'body'
    }))

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [50, 50, 50, 50],
      defaultStyle: {
        font: 'Helvetica'
      },
      styles,
      content: [
        // Header
        { text: options.name, style: 'header' },
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

        pdfDoc.on('error', (err: Error) => {
          this.log.error({ err }, 'pdfmake PDF generation failed')
          reject(new Error(`PDF generation failed: ${err.message}`))
        })

        pdfDoc.end()
      } catch (error) {
        this.log.error({ err: error }, 'pdfmake PDF generation failed')
        reject(new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`))
      }
    })
  }
}
