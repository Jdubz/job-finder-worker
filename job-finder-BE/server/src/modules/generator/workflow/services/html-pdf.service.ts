import { chromium, type BrowserContext, type Page } from 'playwright-core'
import type { ResumeContent, CoverLetterContent, PersonalInfo } from '@shared/types'
import { atsResumeHtml, atsCoverLetterHtml } from './html-ats.service'
import { injectPdfMetadata } from './pdf-metadata.service'
import { distributePageSpacing, USABLE_HEIGHT_PX } from './render-measure.service'

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
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
    const pdf = await page.pdf({ format: 'Letter', printBackground: true })
    return pdf
  } finally {
    await context.browser()?.close()
  }
}

/**
 * Render resume HTML to PDF with page-fill spacing distribution.
 * Measures content height, distributes spare space to fill the page,
 * verifies no overflow, and reverts to original layout if needed.
 */
async function renderResumeHtmlToPdf(html: string): Promise<Buffer> {
  const context = await createContext()
  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })

    await applyPageFill(page, html)

    const pdf = await page.pdf({ format: 'Letter', printBackground: true })
    return pdf
  } finally {
    await context.browser()?.close()
  }
}

/** Measure .page scrollHeight, distribute spare space, revert on overflow. */
async function applyPageFill(page: Page, html: string): Promise<void> {
  const contentHeight = await page.evaluate(() => {
    const el = document.querySelector('.page')
    return el ? (el as HTMLElement).scrollHeight : 0
  })

  const spare = USABLE_HEIGHT_PX - contentHeight
  if (spare <= 2) return

  await distributePageSpacing(page, spare)

  // Verify distribution didn't push content past the page boundary
  const filledHeight = await page.evaluate(() => {
    const el = document.querySelector('.page')
    return el ? (el as HTMLElement).scrollHeight : 0
  })
  if (filledHeight > USABLE_HEIGHT_PX) {
    // Revert to original un-filled layout
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
  }
}

export class HtmlPdfService {
  async renderResume(content: ResumeContent, personalInfo?: PersonalInfo): Promise<Buffer> {
    const html = atsResumeHtml(content, personalInfo)
    let pdf = await renderResumeHtmlToPdf(html)

    const info = personalInfo ?? content.personalInfo
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
