/**
 * Page-fill integration test.
 *
 * Renders actual resume HTML via Playwright, applies applyPageFill(),
 * and measures content height before and after to verify the page is filled.
 */
import { describe, it, expect } from 'vitest'
import { chromium } from 'playwright-core'
import type { Page } from 'playwright-core'
import { atsResumeHtml } from '../html-ats.service'
import { applyPageFill, USABLE_HEIGHT_PX } from '../render-measure.service'
import type { ResumeContent, PersonalInfo } from '@shared/types'

const personalInfo: PersonalInfo = {
  name: 'Joshua Wentworth',
  email: 'contact@joshwentworth.com',
  title: 'Senior Software Engineer',
  location: 'Portland, OR',
  website: 'https://joshwentworth.com',
  linkedin: 'https://linkedin.com/in/joshwentworth',
  github: 'https://github.com/joshwentworth',
  phone: '(510)898-8892',
  applicationInfo: ''
}

/** Prod-like resume matching the one reported as having a gap. */
function makeProdResume(): ResumeContent {
  return {
    personalInfo: {
      name: personalInfo.name,
      title: personalInfo.title ?? '',
      summary: '',
      contact: {
        email: personalInfo.email,
        location: personalInfo.location,
        website: personalInfo.website,
        linkedin: personalInfo.linkedin,
        github: personalInfo.github,
        phone: personalInfo.phone
      }
    },
    professionalSummary:
      "Software engineer with 8+ years building end-to-end systems for clients including Amazon, McDonald's, and Google. Combines full-stack engineering depth with hands-on AI/ML experience in PyTorch, LLM integration, and embedded inference. Adept at AI-accelerated workflows for better quality and faster delivery.",
    experience: [
      {
        company: 'Fulfil Solutions',
        role: 'Senior Software Engineer',
        location: 'Mountain View, CA — Remote (Portland, OR)',
        startDate: '2021-12',
        endDate: '2025-03',
        highlights: [
          'Launched and supported an Amazon Fresh integration for Whole Foods, leveraging an event-driven Pub/Sub pipeline, proving the product\'s market viability with a tier 1 enterprise partner.',
          'Built unified REST API serving the white-label PWA, DoorDash, Uber Eats, and Amazon Fresh with webhook lifecycle events and push notifications, growing order fulfillment from 0 to 200+ daily deliveries.',
          'Migrated cloud logging from Elastic to self-hosted Grafana/Loki, de-duplicating logs by 60%, reducing cloud hosting costs, and cutting mean-time-to-resolution with structured queries and granular alerting.',
          'Owned end-to-end order lifecycle across payment processing (Stripe), customer notifications (Twilio, SendGrid), and operator alerting (Slack, PagerDuty), ensuring reliable fulfillment of 200+ daily deliveries.'
        ]
      },
      {
        company: 'Meow Wolf',
        role: 'Front End Software Developer',
        location: 'Denver, CO — Remote',
        startDate: '2021-03',
        endDate: '2021-07',
        highlights: [
          'Implemented event-driven Pub/Sub architecture across interactive exhibit applications, tracking visitor activity in real time and updating user profiles based on puzzle completion throughout the venue.',
          'Integrated Docker-based fleet management system for deploying and coordinating interactive exhibit applications across venue installations.'
        ]
      },
      {
        company: 'Opna Development',
        role: 'Co-Founder & Lead Engineer',
        location: 'San Francisco, CA',
        startDate: '2017-06',
        endDate: '2021-12',
        highlights: [
          "Built McDonald's NLP ordering service with Dialogflow on GCP, handling intent recognition for menu navigation, item substitutions, and coupon redemption, strengthening the McDonald's-Google Cloud partnership.",
          "Designed microservice architecture for JLL on GCP with Dialogflow for natural language maintenance requests, delivering the foundation for JLL's enterprise facility management platform serving millions of users."
        ]
      },
      {
        company: 'Various Consulting Projects',
        role: 'Software Engineer',
        location: 'San Francisco, CA',
        startDate: '2015-08',
        endDate: '2017-06',
        highlights: [
          'Built applications across enterprise software and embedded systems using JavaScript, Python, and real-time system design for consulting clients.'
        ]
      }
    ],
    skills: [
      { category: 'AI / ML', items: ['PyTorch', 'TFLite Micro', 'Stable Diffusion', 'Hugging Face', 'LiteLLM', 'Ollama', 'Dialogflow'] },
      { category: 'Backend & APIs', items: ['Node.js', 'Express', 'Flask', 'GraphQL', 'REST', 'gRPC'] },
      { category: 'Languages', items: ['Python', 'TypeScript', 'JavaScript', 'C++', 'SQL'] }
    ],
    education: [
      { institution: 'Google Cloud', degree: 'Professional Cloud Developer Certificate', endDate: '2021' },
      {
        institution: 'University of California — Santa Cruz',
        degree: 'B.A. in Music',
        endDate: '2010-07',
        field: 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.'
      }
    ]
  }
}

async function measureHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.page')
    return el ? (el as HTMLElement).scrollHeight : 0
  })
}

describe('applyPageFill integration', () => {
  it('fills the page — gap must be < 5px after distribution', async () => {
    const content = makeProdResume()
    const html = atsResumeHtml(content, personalInfo)

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    try {
      const context = await browser.newContext({ viewport: { width: 1275, height: 1650 } })
      const page = await context.newPage()
      await page.emulateMedia({ media: 'print' })
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 })

      const beforeHeight = await measureHeight(page)
      const spareBefore = USABLE_HEIGHT_PX - beforeHeight

      // Content should NOT fill the page before page-fill
      expect(spareBefore).toBeGreaterThan(100)

      await applyPageFill(page, html)

      const afterHeight = await measureHeight(page)
      const spareAfter = USABLE_HEIGHT_PX - afterHeight

      // Page MUST be filled — spare after fill should be < 5px
      expect(spareAfter).toBeLessThan(5)
      expect(spareAfter).toBeGreaterThanOrEqual(0)
      expect(afterHeight).toBeGreaterThan(beforeHeight)
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('works with a sparse resume (large gap)', async () => {
    const content: ResumeContent = {
      personalInfo: {
        name: 'Test User',
        title: 'Engineer',
        summary: '',
        contact: { email: 'test@example.com' }
      },
      professionalSummary: 'Senior engineer with cloud expertise.',
      experience: [
        {
          company: 'Acme Corp',
          role: 'Engineer',
          startDate: '2022-01',
          endDate: '2024-01',
          highlights: ['Built production systems.', 'Improved performance by 2x.']
        }
      ],
      skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
      education: [{ institution: 'State University', degree: 'BS Computer Science' }]
    }

    const info: PersonalInfo = {
      name: 'Test User',
      email: 'test@example.com',
      title: 'Engineer',
      applicationInfo: ''
    }

    const html = atsResumeHtml(content, info)
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    try {
      const context = await browser.newContext({ viewport: { width: 1275, height: 1650 } })
      const page = await context.newPage()
      await page.emulateMedia({ media: 'print' })
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 })

      await applyPageFill(page, html)

      const afterHeight = await measureHeight(page)
      const spareAfter = USABLE_HEIGHT_PX - afterHeight

      // Even with a sparse resume, page should be filled
      expect(spareAfter).toBeLessThan(5)
      expect(spareAfter).toBeGreaterThanOrEqual(0)
    } finally {
      await browser.close()
    }
  }, 30_000)
})
