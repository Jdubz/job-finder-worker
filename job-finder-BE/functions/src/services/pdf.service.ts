/**
 * PDF Service
 *
 * Handles PDF generation using Puppeteer and Handlebars templates.
 */

import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"
import Handlebars from "handlebars"
import type { TemplateDelegate as HandlebarsTemplateDelegate } from "handlebars"
import * as fs from "fs/promises"
import * as path from "path"
import { createDefaultLogger } from "../utils/logger"
import type { SimpleLogger } from "../types/logger.types"
import type { ResumeContent, CoverLetterContent } from "../types/generator.types"

export class PDFService {
  private logger: SimpleLogger
  private resumeTemplate?: HandlebarsTemplateDelegate
  private coverLetterTemplate?: HandlebarsTemplateDelegate

  constructor(logger?: SimpleLogger) {
    // Use shared logger factory
    this.logger = logger || createDefaultLogger()
  }

  /**
   * Generate a resume PDF from ResumeContent
   */
  async generateResumePDF(
    content: ResumeContent,
    style: string = "modern",
    accentColor: string = "#3B82F6"
  ): Promise<Buffer> {
    try {
      this.logger.info("Generating resume PDF", { style, accentColor })

      // Load and compile template if not already loaded
      if (!this.resumeTemplate) {
        const templatePath = path.join(__dirname, "..", "templates", `resume-${style}.hbs`)
        const templateSource = await fs.readFile(templatePath, "utf-8")
        this.resumeTemplate = Handlebars.compile(templateSource)
      }

      // Load logo and avatar as base64 data URLs
      const logoPath = path.join(__dirname, "..", "templates", "assets", "logo.svg")
      const avatarPath = path.join(__dirname, "..", "templates", "assets", "avatar.jpg")

      let logoDataUrl = ""
      let avatarDataUrl = ""

      try {
        const logoBuffer = await fs.readFile(logoPath)
        logoDataUrl = `data:image/svg+xml;base64,${logoBuffer.toString("base64")}`
      } catch {
        this.logger.warning("Logo file not found, proceeding without logo")
      }

      try {
        const avatarBuffer = await fs.readFile(avatarPath)
        avatarDataUrl = `data:image/jpeg;base64,${avatarBuffer.toString("base64")}`
      } catch {
        this.logger.warning("Avatar file not found, proceeding without avatar")
      }

      // Render HTML from template
      const html = this.resumeTemplate({
        ...content,
        accentColor,
        logoDataUrl,
        avatarDataUrl,
      })

      // Generate PDF using Puppeteer
      const pdf = await this.htmlToPDF(html)

      this.logger.info("Resume PDF generated successfully", {
        size: pdf.length,
      })

      return pdf
    } catch (error) {
      this.logger.error("Failed to generate resume PDF", { error })
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate a cover letter PDF from CoverLetterContent
   */
  async generateCoverLetterPDF(
    content: CoverLetterContent,
    name: string,
    email: string,
    accentColor: string = "#3B82F6",
    date?: string
  ): Promise<Buffer> {
    try {
      this.logger.info("Generating cover letter PDF")

      // Load and compile template if not already loaded
      if (!this.coverLetterTemplate) {
        const templatePath = path.join(__dirname, "..", "templates", "cover-letter.hbs")
        const templateSource = await fs.readFile(templatePath, "utf-8")
        this.coverLetterTemplate = Handlebars.compile(templateSource)
      }

      // Use provided date or format current date as "MMM YYYY" fallback
      const formattedDate =
        date ||
        new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        })

      // Render HTML from template
      const html = this.coverLetterTemplate({
        ...content,
        name,
        email,
        date: formattedDate,
        accentColor,
      })

      // Generate PDF using Puppeteer
      const pdf = await this.htmlToPDF(html)

      this.logger.info("Cover letter PDF generated successfully", {
        size: pdf.length,
      })

      return pdf
    } catch (error) {
      this.logger.error("Failed to generate cover letter PDF", { error })
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Convert HTML to PDF using Puppeteer
   */
  private async htmlToPDF(html: string): Promise<Buffer> {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

    try {
      // Detect if running locally or in Cloud Functions
      const isLocal = process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV === "development"

      this.logger.info("Launching Puppeteer", { isLocal })

      if (isLocal) {
        // Local development - try to use Chrome channel first, fallback to common paths
        const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        }

        // Try Chrome channel first (works on most systems)
        try {
          browser = await puppeteer.launch({
            ...launchOptions,
            channel: "chrome",
          })
        } catch {
          // Fallback to common Chrome paths
          const chromePaths = [
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/snap/bin/chromium",
            process.env.CHROME_PATH,
          ].filter((p): p is string => p !== undefined)

          for (const executablePath of chromePaths) {
            try {
              browser = await puppeteer.launch({
                ...launchOptions,
                executablePath,
              })
              break
            } catch {
              continue
            }
          }

          if (!browser) {
            throw new Error(
              "Chrome not found. Please install Chrome or Chromium, or set CHROME_PATH environment variable."
            )
          }
        }
      } else {
        // Cloud Functions - use @sparticuz/chromium
        browser = await puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        })
      }

      const page = await browser.newPage()

      // Set content and wait for fonts/styles to load
      await page.setContent(html, {
        waitUntil: "networkidle0",
      })

      // Generate PDF
      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: {
          top: "0.5in",
          right: "0.5in",
          bottom: "0.5in",
          left: "0.5in",
        },
      })

      this.logger.info("PDF generated successfully via Puppeteer")

      return Buffer.from(pdf)
    } catch (error) {
      this.logger.error("Puppeteer PDF generation failed", { error })
      throw error
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }
}
