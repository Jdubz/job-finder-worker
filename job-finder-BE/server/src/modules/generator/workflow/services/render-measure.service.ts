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
    // Use print media so measurement matches PDF rendering (which uses @page rules)
    await this.page.emulateMedia({ media: 'print' })
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
      if (!el) throw new Error('.page element not found in rendered HTML')
      return (el as HTMLElement).scrollHeight
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
   * Delegates to renderPdfFilled with no spacing.
   */
  async renderPdf(content: ResumeContent, personalInfo: PersonalInfo): Promise<Buffer> {
    return this.renderPdfFilled(content, personalInfo, 0)
  }

  /**
   * Render the final PDF, distributing any spare vertical space to fill the page exactly.
   * Re-measures after setContent() to account for rendering variance, and reverts
   * to the original layout if spacing causes overflow.
   */
  async renderPdfFilled(content: ResumeContent, personalInfo: PersonalInfo, sparePx: number): Promise<Buffer> {
    if (!this.page) throw new Error('RenderMeasureService not initialized — call init() first')

    const html = atsResumeHtml(content, personalInfo)
    await this.page.setContent(html, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })

    if (sparePx > 2) {
      await applyPageFill(this.page, html)
    }

    let pdf: Buffer = await this.page.pdf({ format: 'Letter', printBackground: true })
    return injectResumeMetadata(pdf, content, personalInfo)
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

/** Extract and inject ATS-friendly PDF metadata for resume documents. */
async function injectResumeMetadata(
  pdf: Buffer,
  content: ResumeContent,
  personalInfo: PersonalInfo
): Promise<Buffer> {
  const name = personalInfo.name || ''
  const title = personalInfo.title || content.personalInfo?.title || ''
  const skillKeywords = (content.skills || [])
    .flatMap((s) => s.items)
    .slice(0, 20)

  return injectPdfMetadata(pdf, {
    title: `${name} - ${title} Resume`,
    author: name,
    subject: `Resume for ${title}`,
    keywords: skillKeywords,
  })
}

/**
 * Distribute spare vertical space proportionally across section boundaries to fill the page.
 * Uses padding (not margin) to avoid CSS margin collapse issues.
 * Additive: reads existing computed padding and adds to it rather than overwriting.
 * Call after setContent() and before pdf() to eliminate bottom-of-page gaps.
 *
 * Weighted distribution:
 *   - Section headings (paddingTop, weight 3) — most visual breathing room
 *   - Summary paragraph (paddingBottom, weight 2)
 *   - Experience / project / education entries (paddingBottom, weight 1)
 *   - Skill rows (paddingBottom, weight 0.5) — fine-grained fill
 */
/**
 * Measure .page scrollHeight, distribute spare space to fill the page, revert on overflow.
 * Shared by both HtmlPdfService (published resumes) and RenderMeasureService (tailored resumes).
 * Assumes the page already has content loaded and print media emulated.
 */
export async function applyPageFill(page: Page, html: string): Promise<void> {
  const contentHeight = await page.evaluate(() => {
    const el = document.querySelector('.page')
    return el ? (el as HTMLElement).scrollHeight : 0
  })

  // Guard: if .page is missing, contentHeight is 0 and spare would be huge — bail out
  if (contentHeight === 0) return

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

export async function distributePageSpacing(page: Page, sparePx: number): Promise<void> {
  if (sparePx <= 2) return

  // Reserve 2px for sub-pixel rounding — scrollHeight is an integer so the
  // measured spare can be up to 1px more than the real gap; distributing the
  // full amount then risks pushing content past the page boundary.
  const budget = sparePx - 2

  await page.evaluate((spare: number) => {
    const targets: Array<{ el: HTMLElement; weight: number; prop: 'paddingTop' | 'paddingBottom' }> = []

    document.querySelectorAll('.section-heading').forEach((el) => {
      targets.push({ el: el as HTMLElement, weight: 3, prop: 'paddingTop' })
    })
    document.querySelectorAll('.summary').forEach((el) => {
      targets.push({ el: el as HTMLElement, weight: 2, prop: 'paddingBottom' })
    })
    document.querySelectorAll('.exp-entry, .project-entry, .edu-entry').forEach((el) => {
      targets.push({ el: el as HTMLElement, weight: 1, prop: 'paddingBottom' })
    })
    document.querySelectorAll('.skill-row').forEach((el) => {
      targets.push({ el: el as HTMLElement, weight: 0.5, prop: 'paddingBottom' })
    })

    const totalWeight = targets.reduce((sum, t) => sum + t.weight, 0)
    if (totalWeight === 0) return

    const pxPerUnit = spare / totalWeight
    for (const t of targets) {
      // Read existing computed padding and add to it (additive, not destructive)
      const current = parseFloat(window.getComputedStyle(t.el).getPropertyValue(
        t.prop === 'paddingTop' ? 'padding-top' : 'padding-bottom'
      )) || 0
      const delta = Math.floor(pxPerUnit * t.weight * 100) / 100
      t.el.style[t.prop] = `${current + delta}px`
    }
  }, budget)
}
