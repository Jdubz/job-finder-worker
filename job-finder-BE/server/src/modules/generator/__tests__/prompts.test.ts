import { describe, it, expect } from 'vitest'
import { buildResumePrompt } from '../workflow/prompts'

// Minimal fixtures
const personalInfo = {
  name: 'Test User',
  email: 'test@example.com',
  location: 'Portland, OR'
} as const

const contentItems = [
  {
    id: 'work-1',
    parentId: null,
    order: 0,
    title: 'Acme Corp',
    role: 'Engineer',
    location: 'Remote',
    description: '- Shipped things',
    skills: ['TypeScript'],
    aiContext: 'work',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'me',
    updatedBy: 'me'
  }
] as any

describe('buildResumePrompt', () => {
  it('includes company website, job URL, and candidate location in the data block', () => {
    const prompt = buildResumePrompt(
      {
        generateType: 'resume',
        job: {
          role: 'Senior Engineer',
          company: 'Acme',
          companyWebsite: 'https://acme.test',
          jobDescriptionUrl: 'https://jobs.acme.test/123',
          jobDescriptionText: 'Build great products'
        }
      },
      personalInfo as any,
      contentItems
    )

    expect(prompt).toMatch(/Company Website: https:\/\/acme\.test/i)
    expect(prompt).toMatch(/Job Post URL: https:\/\/jobs\.acme\.test\/123/i)
    expect(prompt).toMatch(/Candidate Location: Portland, OR/i)
  })
})

