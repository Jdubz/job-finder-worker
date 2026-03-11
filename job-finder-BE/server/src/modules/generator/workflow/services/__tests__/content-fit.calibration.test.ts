/**
 * Content-fit calibration test.
 *
 * Renders actual resume HTML via Playwright and measures the real content
 * height in pixels, then compares against the estimator's prediction.
 * This test does NOT assert pass/fail — it prints a calibration report
 * showing exactly where the estimator diverges from reality.
 *
 * Run: npx vitest run --reporter=verbose content-fit.calibration
 */
import { describe, it, expect } from 'vitest'
import { chromium } from 'playwright-core'
import { estimateContentFit, LAYOUT } from '../content-fit.service'
import { atsResumeHtml } from '../html-ats.service'
import type { ResumeContent, PersonalInfo } from '@shared/types'

const LINE_UNIT_PX = 14.175 // 10.5px × 1.35 line-height

const personalInfo: PersonalInfo = {
  name: 'Jordan Dubois',
  email: 'jordan@example.com',
  title: 'Senior Software Engineer',
  location: 'Portland, OR',
  website: 'https://jordandubois.dev',
  linkedin: 'https://linkedin.com/in/jordandubois',
  github: 'https://github.com/jordandubois',
  applicationInfo: ''
}

/** Measure the actual rendered content height of resume HTML using Playwright. */
async function measureContentHeight(content: ResumeContent): Promise<{
  contentHeightPx: number
  usableHeightPx: number
  sectionHeights: Record<string, number>
  elementHeights: Record<string, number>
}> {
  const html = atsResumeHtml(content, personalInfo)
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const context = await browser.newContext({ viewport: { width: 1275, height: 1650 } })
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 })

    const measurements = await page.evaluate(() => {
      const pageEl = document.querySelector('.page') as HTMLElement
      if (!pageEl) return { contentHeightPx: 0, sectionHeights: {}, elementHeights: {} as Record<string, number> }

      // Measure total content height (scrollHeight gives the full content box)
      const contentHeightPx = pageEl.scrollHeight

      // Measure individual sections
      const sectionHeights: Record<string, number> = {}

      // Header region: from top of .page to first .section-heading
      const firstHeading = pageEl.querySelector('.section-heading') as HTMLElement
      if (firstHeading) {
        sectionHeights['header'] = firstHeading.offsetTop
      }

      // Measure each section heading + content
      const headings = pageEl.querySelectorAll('.section-heading')
      headings.forEach((h, i) => {
        const el = h as HTMLElement
        const label = el.textContent?.trim() || `section-${i}`
        const nextHeading = headings[i + 1] as HTMLElement | undefined
        const sectionEnd = nextHeading ? nextHeading.offsetTop : contentHeightPx
        sectionHeights[label] = sectionEnd - el.offsetTop
      })

      // Detailed per-element measurements
      const elementHeights: Record<string, number> = {}

      // Header elements
      const nameEl = pageEl.querySelector('.name') as HTMLElement
      if (nameEl) elementHeights['name'] = nameEl.getBoundingClientRect().height
      const titleEl = pageEl.querySelector('.header .title') as HTMLElement
      if (titleEl) elementHeights['title'] = titleEl.getBoundingClientRect().height
      const ruleEl = pageEl.querySelector('.header-rule') as HTMLElement
      if (ruleEl) elementHeights['header-rule'] = ruleEl.getBoundingClientRect().height
      const contactEl = pageEl.querySelector('.contact-row') as HTMLElement
      if (contactEl) elementHeights['contact-row'] = contactEl.getBoundingClientRect().height
      const headerEl = pageEl.querySelector('.header') as HTMLElement
      if (headerEl) elementHeights['header-block'] = headerEl.getBoundingClientRect().height

      // Section headings
      headings.forEach((h, i) => {
        const el = h as HTMLElement
        const label = el.textContent?.trim() || `heading-${i}`
        elementHeights[`heading: ${label}`] = el.getBoundingClientRect().height
      })

      // Summary
      const summaryEl = pageEl.querySelector('.summary') as HTMLElement
      if (summaryEl) elementHeights['summary-text'] = summaryEl.getBoundingClientRect().height

      // Experience entries
      const expEntries = pageEl.querySelectorAll('.exp-entry')
      expEntries.forEach((e, i) => {
        const el = e as HTMLElement
        const role = el.querySelector('.exp-role')?.textContent || `exp-${i}`
        elementHeights[`exp: ${role}`] = el.getBoundingClientRect().height
        // Also measure the header row, company, bullets UL, tech
        const hdr = el.querySelector('.exp-header') as HTMLElement
        if (hdr) elementHeights[`  exp-header: ${role}`] = hdr.getBoundingClientRect().height
        const co = el.querySelector('.exp-company') as HTMLElement
        if (co) elementHeights[`  exp-company: ${role}`] = co.getBoundingClientRect().height
        const ul = el.querySelector('.exp-bullets') as HTMLElement
        if (ul) elementHeights[`  exp-bullets: ${role}`] = ul.getBoundingClientRect().height
        const tech = el.querySelector('.exp-tech') as HTMLElement
        if (tech) elementHeights[`  exp-tech: ${role}`] = tech.getBoundingClientRect().height
      })

      // Skills
      const skillRows = pageEl.querySelectorAll('.skill-row')
      skillRows.forEach((s, i) => {
        const el = s as HTMLElement
        elementHeights[`skill-row-${i}`] = el.getBoundingClientRect().height
      })

      // Projects
      const projEntries = pageEl.querySelectorAll('.project-entry')
      projEntries.forEach((p, i) => {
        const el = p as HTMLElement
        const name = el.querySelector('.project-name')?.textContent || `proj-${i}`
        elementHeights[`proj: ${name}`] = el.getBoundingClientRect().height
      })

      // Education
      const eduEntries = pageEl.querySelectorAll('.edu-entry')
      eduEntries.forEach((e, i) => {
        const el = e as HTMLElement
        elementHeights[`edu-${i}`] = el.getBoundingClientRect().height
      })

      return { contentHeightPx, sectionHeights, elementHeights }
    })

    // Letter page usable height: 11in - 2×0.6in margins = 9.8in = 940.8px at 96dpi
    const usableHeightPx = 940.8

    return { ...measurements, usableHeightPx }
  } finally {
    await browser.close()
  }
}

function makeResume(overrides: Partial<ResumeContent> = {}): ResumeContent {
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
        github: personalInfo.github
      }
    },
    professionalSummary: '',
    experience: [],
    skills: [],
    education: [],
    ...overrides
  }
}

/** Build a resume that resembles the prod fullstack version (with projects). */
function makeFullstackResume(): ResumeContent {
  return makeResume({
    professionalSummary:
      'Full-stack engineer with 8+ years designing end-to-end systems for clients including Amazon, McDonald\'s, and Google. Expert in TypeScript, React, Node.js, and Python with event-driven architecture experience.',
    experience: [
      {
        company: 'Fulfil Solutions',
        role: 'Senior Software Engineer',
        startDate: '2021-12',
        endDate: '2025-03',
        highlights: [
          'Launched Amazon Fresh — first tier-1 enterprise partner — with event-driven Pub/Sub pipeline for high-volume order processing',
          'Doubled robotic fulfillment throughput by designing intelligent order batching algorithm',
          'Shipped white-label grocery PWA with Angular/Ionic frontend, Contentful CMS, and Firebase hosting',
          'Built unified ordering API for DoorDash, Uber Eats, and Amazon Fresh for multi-channel platform'
        ],
        technologies: ['Angular', 'Node.js', 'TypeScript', 'MySQL', 'Redis', 'Pub/Sub', 'Kubernetes', 'Stripe']
      },
      {
        company: 'Meow Wolf',
        role: 'Front End Software Developer',
        startDate: '2021-03',
        endDate: '2021-07',
        highlights: [
          'Built shared React component library and Docker deployment pipeline for immersive art venues'
        ],
        technologies: ['React', 'Docker', 'Styled Components', 'MaterialUI', 'Pub/Sub']
      },
      {
        company: 'Opna Development',
        role: 'Co-Founder & Lead Engineer',
        startDate: '2017-06',
        endDate: '2021-12',
        highlights: [
          'Co-founded consultancy delivering full-stack solutions for Intuit, McDonald\'s, Google, and JLL on GCP',
          'Built Python gRPC game server with Docker, cutting provisioning from minutes to seconds at scale'
        ],
        technologies: ['React', 'TypeScript', 'Node.js', 'Python', 'GraphQL', 'Apollo', 'GCP', 'Docker']
      },
      {
        company: 'Various Consulting Projects',
        role: 'Software Engineer',
        startDate: '2015-08',
        endDate: '2017-06',
        highlights: [
          'Built full-stack micro-credential platform with React and PostgreSQL on GCP for educator networks'
        ]
      }
    ],
    projects: [
      {
        name: 'Job Finder',
        description: 'AI-assisted job search platform with LiteLLM proxy for unified model routing across Claude, Gemini, and Ollama',
        highlights: [
          'Monorepo with React/Vite frontend, Express API, Python worker, and shared TypeScript contracts'
        ]
      },
      {
        name: 'App Monitor',
        description: 'Platform orchestrating autonomous AI development agents with ephemeral Docker containers and real-time SSE',
        highlights: [
          'Shared TypeScript contracts across full-stack monorepo with 400+ automated tests and E2E coverage'
        ]
      }
    ],
    skills: [
      { category: 'Frontend', items: ['React', 'Angular', 'Tailwind CSS', 'Shadcn', 'MaterialUI', 'Styled Components'] },
      { category: 'Backend & APIs', items: ['Node.js', 'Express', 'Python', 'Flask', 'GraphQL', 'REST'] },
      { category: 'Cloud & Infrastructure', items: ['GCP', 'Docker', 'Kubernetes', 'Firebase', 'GitHub Actions', 'CircleCI'] },
      { category: 'Data & Messaging', items: ['MySQL', 'MongoDB', 'Redis', 'SQLite', 'Pub/Sub', 'BullMQ'] }
    ],
    education: [
      { institution: 'Google Cloud', degree: 'Professional Cloud Developer Certificate', endDate: '2021' },
      { institution: 'University of California — Santa Cruz', degree: 'B.A. in Music', field: 'Regents Scholar — top 1% of incoming freshmen. Minors in Electronic Music & Jazz.' }
    ]
  })
}

/** Build a typical resume (from the accuracy test) for comparison. */
function makeTypicalResume(): ResumeContent {
  return makeResume({
    professionalSummary: 'Senior full-stack engineer with 8+ years building production systems for enterprise clients.',
    experience: [
      {
        company: 'Amazon Web Services',
        role: 'Senior SDE',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 3 }, () =>
          'Designed and implemented scalable microservice architecture handling high-throughput event processing with sub-second latency requirements'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      },
      {
        company: 'Stripe',
        role: 'Software Engineer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 3 }, () =>
          'Built and shipped production features for the platform'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      },
      {
        company: 'Startup Inc',
        role: 'Full-Stack Developer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 2 }, () =>
          'Built and shipped production features for the platform'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      },
      {
        company: 'Agency Co',
        role: 'Junior Developer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 2 }, () =>
          'Built and shipped production features for the platform'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      }
    ],
    skills: [
      { category: 'Languages', items: ['TypeScript', 'Python', 'Go', 'SQL'] },
      { category: 'Frontend', items: ['React', 'Next.js', 'Tailwind CSS'] },
      { category: 'Backend', items: ['Node.js', 'Express', 'FastAPI'] },
      { category: 'Cloud & Infra', items: ['AWS', 'Docker', 'Kubernetes'] }
    ],
    education: [{ institution: 'University of Oregon', degree: 'BS Computer Science' }]
  })
}

/** Build a near-boundary resume that should barely fit. */
function makeBoundaryResume(): ResumeContent {
  return makeResume({
    professionalSummary:
      'Experienced engineer with expertise in full-stack web development and cloud infrastructure.',
    experience: [
      {
        company: 'Company A',
        role: 'Lead Engineer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 4 }, () =>
          'Designed and implemented scalable microservice architecture handling high-throughput event processing with sub-second latency requirements'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      },
      {
        company: 'Company B',
        role: 'Senior Engineer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 3 }, () =>
          'Designed and implemented scalable microservice architecture handling high-throughput event processing with sub-second latency requirements'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      },
      {
        company: 'Company C',
        role: 'Engineer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 3 }, () =>
          'Built and shipped production features for the platform'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      },
      {
        company: 'Company D',
        role: 'Junior Engineer',
        startDate: '2022-01',
        endDate: '2024-06',
        highlights: Array.from({ length: 2 }, () =>
          'Built and shipped production features for the platform'
        ),
        technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
      }
    ],
    skills: [
      { category: 'Languages', items: ['TypeScript', 'Python', 'Go'] },
      { category: 'Frontend', items: ['React', 'Next.js', 'Tailwind CSS'] },
      { category: 'Backend', items: ['Node.js', 'Express', 'PostgreSQL'] },
      { category: 'Cloud', items: ['AWS', 'Docker', 'Kubernetes'] }
    ],
    education: [{ institution: 'University of Oregon', degree: 'BS Computer Science' }]
  })
}

describe('content-fit calibration (pixel-accurate)', () => {
  const cases: [string, ResumeContent][] = [
    ['fullstack (prod-like)', makeFullstackResume()],
    ['typical 4-exp', makeTypicalResume()],
    ['boundary (near max)', makeBoundaryResume()]
  ]

  for (const [label, content] of cases) {
    it(`calibration: ${label}`, async () => {
      const estimate = estimateContentFit(content)
      const measured = await measureContentHeight(content)

      const actualLines = measured.contentHeightPx / LINE_UNIT_PX
      const estimatedLines = estimate.mainColumnLines
      const delta = estimatedLines - actualLines
      const deltaPercent = (delta / actualLines) * 100
      const actualUsage = Math.round((measured.contentHeightPx / measured.usableHeightPx) * 100)
      const estimatedUsage = Math.round((estimatedLines / LAYOUT.MAX_LINES) * 100)

      console.log(`\n${'='.repeat(60)}`)
      console.log(`CALIBRATION: ${label}`)
      console.log(`${'='.repeat(60)}`)
      console.log(`  Actual content:    ${measured.contentHeightPx.toFixed(1)}px = ${actualLines.toFixed(2)} lines`)
      console.log(`  Estimated:         ${(estimatedLines * LINE_UNIT_PX).toFixed(1)}px = ${estimatedLines.toFixed(2)} lines`)
      console.log(`  Delta:             ${(delta * LINE_UNIT_PX).toFixed(1)}px = ${delta.toFixed(2)} lines (${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%)`)
      console.log(`  Actual usage:      ${actualUsage}% of ${measured.usableHeightPx}px usable`)
      console.log(`  Estimated usage:   ${estimatedUsage}% of ${LAYOUT.MAX_LINES} max lines`)
      console.log(`  Actual fits:       ${measured.contentHeightPx <= measured.usableHeightPx}`)
      console.log(`  Estimated fits:    ${estimate.fits}`)
      console.log(`\n  Section heights (px):`)
      for (const [section, height] of Object.entries(measured.sectionHeights)) {
        console.log(`    ${section.padEnd(30)} ${height.toFixed(1)}px = ${(height / LINE_UNIT_PX).toFixed(2)} lines`)
      }
      console.log(`\n  Element heights (px):`)
      for (const [elem, height] of Object.entries(measured.elementHeights)) {
        console.log(`    ${elem.padEnd(40)} ${height.toFixed(1)}px`)
      }

      // The estimation should be within ±3% of actual to be useful
      expect(Math.abs(deltaPercent)).toBeLessThan(8) // loose bound — tighten after calibration
    }, 30_000)
  }
})
