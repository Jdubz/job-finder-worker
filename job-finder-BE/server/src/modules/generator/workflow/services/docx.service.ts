import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  type IRunOptions,
} from 'docx'
import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { cleanText } from './text.util'
import { formatDate } from './date.util'

const FONT = 'Calibri'
const FONT_SIZE_BODY = 22 // half-points (11pt)
const FONT_SIZE_NAME = 36 // 18pt
const FONT_SIZE_TITLE = 26 // 13pt
const FONT_SIZE_SMALL = 20 // 10pt

function textRun(text: string, opts?: Partial<IRunOptions>): TextRun {
  return new TextRun({ text: cleanText(text), font: FONT, size: FONT_SIZE_BODY, ...opts })
}

function heading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE_TITLE, bold: true })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, space: 2, color: '222222' },
    },
  })
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: [textRun(text)],
    bullet: { level: 0 },
    spacing: { after: 20 },
  })
}

export class DocxService {
  async renderResume(content: ResumeContent, personalInfo?: PersonalInfo): Promise<Buffer> {
    const info = personalInfo ?? (content as any).personalInfo
    const name = info?.name || ''
    const title = info?.title || content.personalInfo?.title || ''

    const sections: Paragraph[] = []

    // Header: name centered
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: cleanText(name), font: FONT, size: FONT_SIZE_NAME, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      })
    )

    // Title
    if (title) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: cleanText(title), font: FONT, size: FONT_SIZE_TITLE, color: '444444' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        })
      )
    }

    // Contact row
    const contactParts: string[] = []
    if (info?.email) contactParts.push(`Email: ${info.email}`)
    if (info?.phone) contactParts.push(`Phone: ${info.phone}`)
    if (info?.location) contactParts.push(info.location)
    if (info?.website) contactParts.push(info.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))
    if (info?.linkedin) contactParts.push('LinkedIn')
    if (info?.github) contactParts.push('GitHub')

    if (contactParts.length) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: contactParts.join(' | '), font: FONT, size: FONT_SIZE_SMALL, color: '444444' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        })
      )
    }

    // Professional Summary
    const summary = content.professionalSummary || content.personalInfo?.summary || ''
    if (summary) {
      sections.push(heading('PROFESSIONAL SUMMARY'))
      sections.push(
        new Paragraph({
          children: [textRun(summary)],
          spacing: { after: 80 },
        })
      )
    }

    // Work Experience
    if (content.experience?.length) {
      sections.push(heading('WORK EXPERIENCE'))
      for (const exp of content.experience) {
        const dates = `${formatDate(exp.startDate)} - ${formatDate(exp.endDate) || 'Present'}`

        // Role and dates on same line
        sections.push(
          new Paragraph({
            children: [
              textRun(exp.role, { bold: true }),
              new TextRun({ text: `  ${dates}`, font: FONT, size: FONT_SIZE_SMALL }),
            ],
            spacing: { before: 100, after: 20 },
          })
        )

        // Company
        const companyLine = exp.location ? `${exp.company} - ${exp.location}` : exp.company
        sections.push(
          new Paragraph({
            children: [textRun(companyLine, { color: '444444' })],
            spacing: { after: 40 },
          })
        )

        // Bullets
        for (const h of exp.highlights || []) {
          sections.push(bullet(h))
        }

        // Technologies
        if (exp.technologies?.length) {
          sections.push(
            new Paragraph({
              children: [textRun(exp.technologies.join(', '), { italics: true, size: FONT_SIZE_SMALL, color: '555555' })],
              spacing: { after: 40 },
            })
          )
        }
      }
    }

    // Technical Skills
    if (content.skills?.length) {
      sections.push(heading('TECHNICAL SKILLS'))
      for (const skill of content.skills) {
        sections.push(
          new Paragraph({
            children: [
              textRun(`${skill.category}: `, { bold: true }),
              textRun(skill.items.join(', ')),
            ],
            spacing: { after: 40 },
          })
        )
      }
    }

    // Projects
    if (content.projects?.length) {
      sections.push(heading('PROJECTS'))
      for (const proj of content.projects) {
        const children: TextRun[] = [textRun(proj.name, { bold: true })]
        if (proj.link) {
          children.push(textRun(` (${proj.link.replace(/^https?:\/\//, '').replace(/\/$/, '')})`, { size: FONT_SIZE_SMALL, color: '444444' }))
        }
        sections.push(new Paragraph({ children, spacing: { before: 80, after: 20 } }))

        for (const h of proj.highlights || []) {
          sections.push(bullet(h))
        }
        if (!proj.highlights?.length && proj.description) {
          sections.push(bullet(proj.description))
        }
        if (proj.technologies?.length) {
          sections.push(
            new Paragraph({
              children: [textRun(proj.technologies.join(', '), { italics: true, size: FONT_SIZE_SMALL, color: '555555' })],
              spacing: { after: 40 },
            })
          )
        }
      }
    }

    // Education
    if (content.education?.length) {
      sections.push(heading('EDUCATION'))
      for (const edu of content.education) {
        const degreeField = [edu.degree, edu.field].filter(Boolean).join(' in ')
        const gradDate = (edu as any).graduationDate || edu.endDate
        const children: TextRun[] = [textRun(degreeField, { bold: true })]
        if (gradDate) {
          children.push(textRun(`  ${formatDate(gradDate)}`, { size: FONT_SIZE_SMALL }))
        }
        sections.push(new Paragraph({ children, spacing: { before: 60, after: 20 } }))
        sections.push(
          new Paragraph({
            children: [textRun(edu.institution, { color: '444444' })],
            spacing: { after: 40 },
          })
        )
      }
    }

    // Build skills keywords for document properties
    const skillKeywords = (content.skills || [])
      .flatMap((s) => s.items)
      .slice(0, 20)
      .join(', ')

    const doc = new Document({
      creator: '',
      title: `${name} - ${title} Resume`,
      description: `Resume for ${title}`,
      subject: `Resume for ${title}`,
      keywords: skillKeywords,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.75),
                bottom: convertInchesToTwip(0.75),
                left: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
              },
            },
          },
          children: sections,
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)
    return Buffer.from(buffer)
  }

  async renderCoverLetter(
    content: CoverLetterContent,
    opts: {
      name: string
      email: string
      location?: string
      phone?: string
      date?: string
      title?: string
    }
  ): Promise<Buffer> {
    const sections: Paragraph[] = []

    // Header
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: cleanText(opts.name), font: FONT, size: FONT_SIZE_NAME, bold: true })],
        spacing: { after: 40 },
      })
    )

    const contactParts: string[] = []
    if (opts.email) contactParts.push(opts.email)
    if (opts.phone) contactParts.push(opts.phone)
    if (opts.location) contactParts.push(opts.location)
    if (contactParts.length) {
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: contactParts.join(' | '), font: FONT, size: FONT_SIZE_SMALL, color: '444444' })],
          spacing: { after: 120 },
        })
      )
    }

    if (opts.date) {
      sections.push(
        new Paragraph({
          children: [textRun(opts.date)],
          spacing: { after: 120 },
        })
      )
    }

    // Greeting
    sections.push(
      new Paragraph({
        children: [textRun(content.greeting, { bold: true })],
        spacing: { after: 80 },
      })
    )

    // Body
    const paragraphs = [content.openingParagraph, ...(content.bodyParagraphs || []), content.closingParagraph].filter(Boolean)
    for (const p of paragraphs) {
      sections.push(
        new Paragraph({
          children: [textRun(p || '')],
          spacing: { after: 80 },
        })
      )
    }

    // Signature
    sections.push(
      new Paragraph({
        children: [textRun(typeof content.signature === 'string' && content.signature ? content.signature : 'Sincerely,')],
        spacing: { before: 160, after: 40 },
      })
    )
    sections.push(
      new Paragraph({
        children: [textRun(opts.name, { bold: true })],
      })
    )

    const doc = new Document({
      creator: '',
      title: `${opts.name} - Cover Letter`,
      description: `Cover letter${opts.title ? ' for ' + opts.title : ''}`,
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
              },
            },
          },
          children: sections,
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)
    return Buffer.from(buffer)
  }
}
