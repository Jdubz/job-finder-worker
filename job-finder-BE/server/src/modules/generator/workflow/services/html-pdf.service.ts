import { chromium, type BrowserContext } from 'playwright-core'
import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { atsResumeHtml, atsCoverLetterHtml } from './html-ats.service'
import { injectPdfMetadata } from './pdf-metadata.service'
import { USABLE_HEIGHT_PX, distributePageSpacing } from './render-measure.service'

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

/** Page margins are controlled by @page in html-ats-style.ts (0.6in top, 0.4in bottom, 0.75in left/right).
 *  Do NOT pass margin to Playwright's page.pdf() — it would override the CSS @page rule. */
const RENDER_TIMEOUT_MS = 30_000

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const context = await createContext()
  try {
    const page = await context.newPage()
    // Use 'domcontentloaded' — ATS HTML is fully self-contained with no external resources,
    // so 'networkidle' adds risk of hanging on unexpected Chromium network activity.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
    const pdf = await page.pdf({ format: 'Letter', printBackground: true })
    return pdf
  } finally {
    await context.browser()?.close()
  }
}

export class HtmlPdfService {
  async renderResume(content: ResumeContent, personalInfo?: PersonalInfo): Promise<Buffer> {
    const html = atsResumeHtml(content, personalInfo)

    // Measure content and distribute spare space to fill the page exactly
    const context = await createContext()
    let pdf: Buffer
    try {
      const page = await context.newPage()
      await page.emulateMedia({ media: 'print' })
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })

      const contentHeight = await page.evaluate(() => {
        const el = document.querySelector('.page')
        return el ? (el as HTMLElement).scrollHeight : 0
      })
      const sparePx = USABLE_HEIGHT_PX - contentHeight
      if (sparePx > 0) {
        await distributePageSpacing(page, sparePx)
      }

      pdf = await page.pdf({ format: 'Letter', printBackground: true })
    } finally {
      await context.browser()?.close()
    }

    const info = personalInfo ?? (content as any).personalInfo
    const name = info?.name || ''
    const title = info?.title || content.personalInfo?.title || ''
    const skillKeywords = (content.skills || [])
      .flatMap((s) => s.items)
      .slice(0, 20)

    pdf = await injectPdfMetadata(pdf, {
      title: `${name} - ${title} Resume`,
      author: name,
      subject: `Resume for ${title}`,
      keywords: skillKeywords
    })

    return pdf
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
    const html = atsCoverLetterHtml(content, options)
    let pdf = await renderHtmlToPdf(html)

    pdf = await injectPdfMetadata(pdf, {
      title: `${options.name} - Cover Letter`,
      author: options.name,
      subject: `Cover letter${options.title ? ' for ' + options.title : ''}`
    })

    return pdf
  }
}
