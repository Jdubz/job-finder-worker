/**
 * Content-fit estimation accuracy tests.
 *
 * These tests generate actual PDFs via Playwright and verify that the
 * estimateContentFit() algorithm correctly predicts whether the content
 * fits on a single page. This catches drift between the CSS layout
 * constants in content-fit.service.ts and the actual rendered output.
 *
 * Requires Chromium available via playwright-core (set CHROMIUM_PATH if needed).
 */
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { estimateContentFit } from '../content-fit.service'
import { HtmlPdfService } from '../html-pdf.service'
import type { ResumeContent, PersonalInfo } from '@shared/types'

const personalInfo: PersonalInfo = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  title: 'Senior Software Engineer',
  location: 'Portland, OR',
  website: 'https://janedoe.dev',
  linkedin: 'https://linkedin.com/in/janedoe',
  github: 'https://github.com/janedoe',
  applicationInfo: ''
}

function makeResume(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    personalInfo: {
      name: personalInfo.name,
      title: personalInfo.title ?? '',
      summary: 'Experienced full-stack engineer.',
      contact: {
        email: personalInfo.email,
        location: personalInfo.location,
        website: personalInfo.website,
        linkedin: personalInfo.linkedin,
        github: personalInfo.github
      }
    },
    professionalSummary: 'Experienced full-stack engineer with expertise in TypeScript, React, and cloud infrastructure.',
    experience: [],
    skills: [],
    education: [],
    ...overrides
  }
}

function makeExperience(
  company: string,
  role: string,
  bulletCount: number,
  bulletLength: 'short' | 'medium' | 'long' = 'medium'
) {
  const bullets: Record<typeof bulletLength, string> = {
    short: 'Built and shipped production features for the platform',
    medium: 'Designed and implemented scalable microservice architecture handling high-throughput event processing with sub-second latency requirements',
    long: 'Architected and delivered end-to-end migration of legacy monolith to event-driven microservices on Kubernetes, reducing deployment time from hours to minutes and enabling independent scaling of critical path services across multiple availability zones'
  }

  return {
    company,
    role,
    startDate: '2022-01',
    endDate: '2024-06',
    highlights: Array.from({ length: bulletCount }, () => bullets[bulletLength]),
    technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL']
  }
}

async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer)
  return doc.getPageCount()
}

const htmlPdf = new HtmlPdfService()

describe('content-fit estimation accuracy (PDF rendering)', () => {
  it('minimal resume: estimate fits AND renders as 1 page', async () => {
    const content = makeResume({
      experience: [makeExperience('Acme Corp', 'Engineer', 2, 'short')],
      skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
      education: [{ institution: 'University of Oregon', degree: 'BS Computer Science' }]
    })

    const estimate = estimateContentFit(content)
    const pdf = await htmlPdf.renderResume(content, personalInfo)
    const pages = await getPdfPageCount(pdf)

    expect(estimate.fits).toBe(true)
    expect(pages).toBe(1)
  }, 30_000)

  it('typical single-page resume: estimate fits AND renders as 1 page', async () => {
    const content = makeResume({
      professionalSummary: 'Senior full-stack engineer with 8+ years building production systems for enterprise clients.',
      experience: [
        makeExperience('Amazon Web Services', 'Senior SDE', 3, 'medium'),
        makeExperience('Stripe', 'Software Engineer', 3, 'short'),
        makeExperience('Startup Inc', 'Full-Stack Developer', 2, 'short'),
        makeExperience('Agency Co', 'Junior Developer', 2, 'short')
      ],
      skills: [
        { category: 'Languages', items: ['TypeScript', 'Python', 'Go', 'SQL'] },
        { category: 'Frontend', items: ['React', 'Next.js', 'Tailwind CSS'] },
        { category: 'Backend', items: ['Node.js', 'Express', 'FastAPI'] },
        { category: 'Cloud & Infra', items: ['AWS', 'Docker', 'Kubernetes'] }
      ],
      education: [{ institution: 'University of Oregon', degree: 'BS Computer Science' }]
    })

    const estimate = estimateContentFit(content)
    const pdf = await htmlPdf.renderResume(content, personalInfo)
    const pages = await getPdfPageCount(pdf)

    expect(estimate.fits).toBe(true)
    expect(pages).toBe(1)
  }, 30_000)

  it('overflowing resume: estimate overflows AND renders as 2+ pages', async () => {
    const content = makeResume({
      professionalSummary: 'Senior full-stack engineer with deep expertise across the entire stack. Proven track record of delivering complex distributed systems at scale for Fortune 500 clients.',
      experience: [
        makeExperience('Company A', 'Principal Engineer', 5, 'long'),
        makeExperience('Company B', 'Senior Engineer', 5, 'long'),
        makeExperience('Company C', 'Engineer', 4, 'long'),
        makeExperience('Company D', 'Engineer', 4, 'medium'),
        makeExperience('Company E', 'Junior Engineer', 3, 'medium')
      ],
      skills: [
        { category: 'Languages', items: ['TypeScript', 'Python', 'Go', 'Rust', 'Java', 'SQL'] },
        { category: 'Frontend', items: ['React', 'Next.js', 'Vue', 'Angular', 'Tailwind', 'Storybook'] },
        { category: 'Backend', items: ['Node.js', 'Express', 'FastAPI', 'Django', 'Spring Boot', 'gRPC'] },
        { category: 'Cloud', items: ['AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform'] },
        { category: 'Data', items: ['PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Kafka'] }
      ],
      education: [
        { institution: 'MIT', degree: 'MS Computer Science' },
        { institution: 'University of Oregon', degree: 'BS Computer Science' }
      ]
    })

    const estimate = estimateContentFit(content)
    const pdf = await htmlPdf.renderResume(content, personalInfo)
    const pages = await getPdfPageCount(pdf)

    expect(estimate.fits).toBe(false)
    expect(estimate.overflow).toBeGreaterThan(0)
    expect(pages).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('estimation is conservative — never predicts fit when PDF overflows', async () => {
    // The estimator may be slightly conservative (predicting overflow when
    // the PDF still fits on 1 page), but must NEVER be optimistic (predicting
    // fit when the PDF actually overflows). This is the critical safety property.
    const testCases = [
      // Near the boundary: 4 experiences with varying bullet counts
      makeResume({
        professionalSummary: 'Experienced engineer with expertise in full-stack web development and cloud infrastructure.',
        experience: [
          makeExperience('Company A', 'Lead Engineer', 4, 'medium'),
          makeExperience('Company B', 'Senior Engineer', 3, 'medium'),
          makeExperience('Company C', 'Engineer', 3, 'short'),
          makeExperience('Company D', 'Junior Engineer', 2, 'short')
        ],
        skills: [
          { category: 'Languages', items: ['TypeScript', 'Python', 'Go'] },
          { category: 'Frontend', items: ['React', 'Next.js', 'Tailwind CSS'] },
          { category: 'Backend', items: ['Node.js', 'Express', 'PostgreSQL'] },
          { category: 'Cloud', items: ['AWS', 'Docker', 'Kubernetes'] }
        ],
        education: [{ institution: 'University of Oregon', degree: 'BS Computer Science' }]
      }),
      // Slightly heavier: 4 experiences with medium bullets
      makeResume({
        professionalSummary: 'Senior engineer with deep expertise across the entire stack.',
        experience: [
          makeExperience('Company A', 'Lead Engineer', 4, 'medium'),
          makeExperience('Company B', 'Senior Engineer', 4, 'medium'),
          makeExperience('Company C', 'Engineer', 3, 'medium'),
          makeExperience('Company D', 'Junior Engineer', 2, 'short')
        ],
        skills: [
          { category: 'Languages', items: ['TypeScript', 'Python', 'Go', 'SQL'] },
          { category: 'Frontend', items: ['React', 'Next.js', 'Tailwind CSS', 'Storybook'] },
          { category: 'Backend', items: ['Node.js', 'Express', 'FastAPI', 'gRPC'] },
          { category: 'Cloud', items: ['AWS', 'GCP', 'Docker', 'Kubernetes', 'Terraform'] }
        ],
        education: [{ institution: 'University of Oregon', degree: 'BS Computer Science' }]
      })
    ]

    for (const content of testCases) {
      const estimate = estimateContentFit(content)
      const pdf = await htmlPdf.renderResume(content, personalInfo)
      const pages = await getPdfPageCount(pdf)

      // CRITICAL: if estimate says it fits, PDF must actually be 1 page
      if (estimate.fits) {
        expect(pages).toBe(1)
      }
      // Note: estimate may say overflow when PDF is 1 page (conservative) — that's acceptable
    }
  }, 60_000)

  it('usage percentage is within reasonable bounds', async () => {
    const content = makeResume({
      experience: [
        makeExperience('Company A', 'Engineer', 3, 'medium'),
        makeExperience('Company B', 'Engineer', 3, 'medium')
      ],
      skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
      education: [{ institution: 'University of Oregon', degree: 'BS CS' }]
    })

    const estimate = estimateContentFit(content)

    // Sanity: a 2-experience resume should be between 40-90% of a page
    expect(estimate.mainColumnLines).toBeGreaterThan(25)
    expect(estimate.mainColumnLines).toBeLessThan(60)

    const usagePercent = Math.round((estimate.mainColumnLines / 63) * 100)
    expect(usagePercent).toBeGreaterThan(40)
    expect(usagePercent).toBeLessThan(90)
  })

  it('suggestions are generated when content overflows', () => {
    const content = makeResume({
      experience: Array.from({ length: 6 }, (_, i) =>
        makeExperience(`Company ${i + 1}`, 'Engineer', 5, 'long')
      ),
      skills: Array.from({ length: 7 }, (_, i) => ({
        category: `Category ${i + 1}`,
        items: ['Skill A', 'Skill B', 'Skill C', 'Skill D', 'Skill E']
      }))
    })

    const estimate = estimateContentFit(content)
    expect(estimate.fits).toBe(false)
    expect(estimate.suggestions.length).toBeGreaterThan(0)
    // Should suggest reducing experiences (>4) and skill categories (>5)
    expect(estimate.suggestions.some(s => s.includes('experience'))).toBe(true)
    expect(estimate.suggestions.some(s => s.includes('skill'))).toBe(true)
  })
})
