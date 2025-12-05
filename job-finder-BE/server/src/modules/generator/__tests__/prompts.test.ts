import { describe, it, expect, vi } from 'vitest'
import { buildResumePrompt, buildCoverLetterPrompt } from '../workflow/prompts'
import type { ContentItem, PersonalInfo } from '@shared/types'

// Mock prompts config to avoid DB dependency in unit tests
vi.mock('../../prompts/prompts.repository', () => {
  class PromptsRepository {
    getPrompts() {
      return {
        resumeGeneration: 'resume template {{companyName}} {{candidateName}}',
        coverLetterGeneration: 'cover letter template {{companyName}} {{candidateName}}',
        jobScraping: '',
        jobMatching: ''
      }
    }
  }
  return { PromptsRepository }
})

// Minimal fixtures
const personalInfo: PersonalInfo = {
  name: 'Test User',
  email: 'test@example.com',
  location: 'Portland, OR'
}

const contentItems: ContentItem[] = [
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
]

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
      personalInfo,
      contentItems
    )

    expect(prompt).toMatch(/Company Website: https:\/\/acme\.test/i)
    expect(prompt).toMatch(/Job Post URL: https:\/\/jobs\.acme\.test\/123/i)
    expect(prompt).toMatch(/Candidate Location: Portland, OR/i)
  })
})

describe('buildCoverLetterPrompt', () => {
  it('includes company website, job URL, and candidate location in the data block', () => {
    const prompt = buildCoverLetterPrompt(
      {
        generateType: 'coverLetter',
        job: {
          role: 'Senior Engineer',
          company: 'Acme',
          companyWebsite: 'https://acme.test',
          jobDescriptionUrl: 'https://jobs.acme.test/123',
          jobDescriptionText: 'Build great products'
        }
      },
      personalInfo,
      contentItems
    )

    expect(prompt).toMatch(/Company Website: https:\/\/acme\.test/i)
    expect(prompt).toMatch(/Job Post URL: https:\/\/jobs\.acme\.test\/123/i)
    expect(prompt).toMatch(/Candidate Location: Portland, OR/i)
  })
})
