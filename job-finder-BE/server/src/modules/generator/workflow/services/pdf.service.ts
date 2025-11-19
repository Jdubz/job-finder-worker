import path from 'node:path'
import fs from 'node:fs/promises'
import Handlebars from 'handlebars'
import type { TemplateDelegate } from 'handlebars'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import type { Logger } from 'pino'
import type { CoverLetterContent, ResumeContent } from '@shared/types'
import { logger as rootLogger } from '../../../../logger'

const TEMPLATE_ROOT = path.join(__dirname, '..', 'templates')

export class PDFService {
  private resumeTemplate?: TemplateDelegate
  private coverLetterTemplate?: TemplateDelegate

  constructor(private readonly log: Logger = rootLogger) {}

  async generateResumePDF(content: ResumeContent, style = 'modern', accentColor = '#3B82F6'): Promise<Buffer> {
    const template = await this.loadResumeTemplate(style)
    const html = template({ ...content, accentColor })
    return this.htmlToPdf(html)
  }

  async generateCoverLetterPDF(
    content: CoverLetterContent,
    options: { name: string; email: string; accentColor?: string; date?: string }
  ): Promise<Buffer> {
    const template = await this.loadCoverLetterTemplate()
    const html = template({
      ...content,
      name: options.name,
      email: options.email,
      accentColor: options.accentColor ?? '#3B82F6',
      date:
        options.date ??
        new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
    })
    return this.htmlToPdf(html)
  }

  private async loadResumeTemplate(style: string): Promise<TemplateDelegate> {
    if (!this.resumeTemplate) {
      const templatePath = path.join(TEMPLATE_ROOT, `resume-${style}.hbs`)
      const templateContents = await fs.readFile(templatePath, 'utf-8')
      this.resumeTemplate = Handlebars.compile(templateContents)
    }
    return this.resumeTemplate
  }

  private async loadCoverLetterTemplate(): Promise<TemplateDelegate> {
    if (!this.coverLetterTemplate) {
      const templatePath = path.join(TEMPLATE_ROOT, 'cover-letter-modern.hbs')
      const templateContents = await fs.readFile(templatePath, 'utf-8')
      this.coverLetterTemplate = Handlebars.compile(templateContents)
    }
    return this.coverLetterTemplate
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
        defaultViewport: chromium.defaultViewport,
        ignoreHTTPSErrors: true
      })

      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true
      })
      await page.close()
      return buffer
    } catch (error) {
      this.log.warn({ err: error }, 'Falling back to HTML buffer for PDF output')
      return Buffer.from(html, 'utf-8')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }
}
