/**
 * Render-measure service for pixel-perfect resume page fitting.
 *
 * Maintains a single Playwright browser session for the lifetime of a
 * fit-loop: measure content height via .page scrollHeight, adjust,
 * re-measure, then render the final PDF — all without relaunching the browser.
 *
 * Usable content area: Letter 11in – 0.6in top – 0.4in bottom = 960px at 96dpi.
 * The @page CSS rule in html-ats-style.ts controls print margins.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { ResumeContent, PersonalInfo } from '@shared/types'
import { atsResumeHtml } from './html-ats.service'
import { injectPdfMetadata } from './pdf-metadata.service'

/** Usable content height in CSS px: Letter (11in × 96) − margins ((0.6 + 0.4) × 96) */
export const USABLE_HEIGHT_PX = 960

const RENDER_TIMEOUT_MS = 15_000

export interface MeasureResult {
  contentHeightPx: number
  usableHeightPx: number
  /** Positive = room to spare, negative = overflow */
  sparePx: number
  fits: boolean
}

export class RenderMeasureService {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  /** Launch Chromium and create a reusable page for the session. */
  async init(): Promise<void> {
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: true,
      args: ['--no-sandbox'],
    }
    if (process.env.CHROMIUM_PATH) {
      launchOptions.executablePath = process.env.CHROMIUM_PATH
    }

    this.browser = await chromium.launch(launchOptions)
    this.context = await this.browser.newContext({
      viewport: { width: 1275, height: 1650 }, // Letter @150dpi
    })
    this.page = await this.context.newPage()
  }

  /**
   * Render resume HTML and measure the .page element's scrollHeight.
   * Reuses the existing browser page by replacing content.
   */
  async measure(content: ResumeContent, personalInfo: PersonalInfo): Promise<MeasureResult> {
    if (!this.page) throw new Error('RenderMeasureService not initialized — call init() first')

    const html = atsResumeHtml(content, personalInfo)
    await this.page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })

    const contentHeightPx = await this.page.evaluate(() => {
      const el = document.querySelector('.page')
      return el ? (el as HTMLElement).scrollHeight : 0
    })

    const sparePx = USABLE_HEIGHT_PX - contentHeightPx
    return {
      contentHeightPx,
      usableHeightPx: USABLE_HEIGHT_PX,
      sparePx,
      fits: sparePx >= 0,
    }
  }

  /**
   * Render the final PDF from resume content.
   * Sets content fresh to ensure the final HTML is loaded, then generates PDF.
   * Includes metadata injection matching HtmlPdfService.renderResume().
   */
  async renderPdf(content: ResumeContent, personalInfo: PersonalInfo): Promise<Buffer> {
    if (!this.page) throw new Error('RenderMeasureService not initialized — call init() first')

    const html = atsResumeHtml(content, personalInfo)
    await this.page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })

    let pdf: Buffer = await this.page.pdf({ format: 'Letter', printBackground: true })

    const name = personalInfo.name || ''
    const title = personalInfo.title || content.personalInfo?.title || ''
    const skillKeywords = (content.skills || [])
      .flatMap((s) => s.items)
      .slice(0, 20)

    pdf = await injectPdfMetadata(pdf, {
      title: `${name} - ${title} Resume`,
      author: name,
      subject: `Resume for ${title}`,
      keywords: skillKeywords,
    })

    return pdf
  }

  /** Close browser and release all resources. Always call in a finally block. */
  async dispose(): Promise<void> {
    try {
      await this.browser?.close()
    } finally {
      this.browser = null
      this.context = null
      this.page = null
    }
  }
}
